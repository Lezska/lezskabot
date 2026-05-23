"""
成员缓存管理器
管理群成员列表缓存和用户昵称缓存，提供跨平台兼容的缓存访问。
使用分层缓存策略（昵称缓存 → 字典缓存 → API获取），
并在API请求外层添加异步锁防止缓存击穿。
"""

import asyncio
import time
from typing import List, Optional, Dict, Any
from cachetools import TTLCache

from astrbot.api import logger
from astrbot.api.event import AstrMessageEvent

from .platform_helper import PlatformHelper


class MemberCacheManager:
    """成员缓存管理器
    管理群成员列表缓存和用户昵称缓存，提供跨平台兼容的缓存访问。
    
    分层缓存策略：
    1. 昵称缓存（user_nickname_cache）：TTLCache，最高效
    2. 群成员字典缓存（group_members_dict_cache）：TTLCache，带TTL
    3. 群成员列表缓存（group_members_cache）：TTLCache，用于批量操作
    4. API获取：仅在以上缓存均失效时调用
    
    使用异步锁防止缓存击穿：同一时间对同一用户ID只会发起一次API请求。
    
    内存安全（优化C：冷热分离）：
    - 活跃群组保持标准 TTL（5分钟）
    - 僵尸群组（24小时无消息）主动清理，释放内存
    - 所有缓存字典均使用 TTLCache 或限制大小
    - 异步锁字典定期清理，防止无限增长
    - 里程碑缓存使用独立的小容量 TTLCache
    """

    # 锁字典清理间隔（秒）
    _LOCK_CLEANUP_INTERVAL = 3600  # 1小时清理一次
    # 锁最大存活时间（秒）
    _LOCK_MAX_AGE = 7200  # 2小时无访问则清理
    
    # ---------- 冷热分离配置（优化C） ----------
    _ZOMBIE_THRESHOLD = 86400  # 24小时无消息视为僵尸群组
    _ZOMBIE_CLEANUP_INTERVAL = 7200  # 每2小时检查一次僵尸群组

    def __init__(self, context, cache_ttl: int = 300, nickname_cache_ttl: int = 600):
        """初始化缓存管理器
        
        Args:
            context: AstrBot上下文对象
            cache_ttl: 群成员缓存TTL（秒），默认300秒（5分钟）
            nickname_cache_ttl: 昵称缓存TTL（秒），默认600秒（10分钟）
        """
        self.context = context
        self._cache_ttl = cache_ttl
        
        # 群成员列表缓存（TTLCache，用于批量操作）
        self.group_members_cache = TTLCache(maxsize=100, ttl=cache_ttl)
        
        # 群成员字典缓存（TTLCache，用于快速查找）- 改为TTLCache防止无限增长
        self.group_members_dict_cache = TTLCache(maxsize=100, ttl=cache_ttl)
        
        # 用户昵称缓存（TTLCache，最高效）
        self.user_nickname_cache = TTLCache(maxsize=500, ttl=nickname_cache_ttl)
        
        # 里程碑缓存（独立的小容量TTLCache，防止挤占昵称缓存）
        self._milestone_cache = TTLCache(maxsize=200, ttl=86400)  # 24小时过期
        
        # 异步锁字典：防止同一用户ID的并发API请求（缓存击穿防护）
        self._fetch_locks: Dict[str, asyncio.Lock] = {}
        # 群成员列表获取锁
        self._members_locks: Dict[str, asyncio.Lock] = {}
        # 锁的最后访问时间（用于清理）
        self._lock_access_time: Dict[str, float] = {}
        # 上次清理时间
        self._last_lock_cleanup: float = time.time()
        
        # ---------- 冷热分离缓存（优化C） ----------
        # 活跃群组最后访问时间 {group_id: timestamp}
        self._group_last_active: Dict[str, float] = {}
        # 上次僵尸群组清理时间
        self._last_zombie_cleanup: float = time.time()
    
    # ========== 冷热分离方法（优化C） ==========
    
    def mark_group_active(self, group_id: str):
        """标记群组为活跃状态（收到消息时调用）
        
        Args:
            group_id: 群组ID
        """
        self._group_last_active[str(group_id)] = time.time()
    
    def _cleanup_zombie_groups(self):
        """清理僵尸群组的缓存数据（24小时无消息的群组）"""
        now = time.time()
        if now - self._last_zombie_cleanup < self._ZOMBIE_CLEANUP_INTERVAL:
            return
        self._last_zombie_cleanup = now
        
        zombie_threshold = now - self._ZOMBIE_THRESHOLD
        zombie_groups = [
            gid for gid, last_active in self._group_last_active.items()
            if last_active < zombie_threshold
        ]
        
        for gid in zombie_groups:
            cache_key = f"group_members_{gid}"
            dict_key = f"group_members_dict_{gid}"
            if cache_key in self.group_members_cache:
                del self.group_members_cache[cache_key]
            if dict_key in self.group_members_dict_cache:
                del self.group_members_dict_cache[dict_key]
            del self._group_last_active[gid]
            
            # 同时清理该群的成员锁
            if gid in self._members_locks:
                del self._members_locks[gid]
                self._lock_access_time.pop(f"members_{gid}", None)
        
        if zombie_groups:
            logger.info(f"🧹 清理 {len(zombie_groups)} 个僵尸群组缓存")
    
    # ========== 原生方法保持不变 ==========
    
    def _get_fetch_lock(self, user_id: str) -> asyncio.Lock:
        """获取或创建用户ID对应的异步锁"""
        self._cleanup_locks_if_needed()
        
        if user_id not in self._fetch_locks:
            self._fetch_locks[user_id] = asyncio.Lock()
        self._lock_access_time[user_id] = time.time()
        return self._fetch_locks[user_id]
    
    def _get_members_lock(self, group_id: str) -> asyncio.Lock:
        """获取或创建群组ID对应的异步锁"""
        self._cleanup_locks_if_needed()
        
        if group_id not in self._members_locks:
            self._members_locks[group_id] = asyncio.Lock()
        self._lock_access_time[f"members_{group_id}"] = time.time()
        return self._members_locks[group_id]
    
    def _cleanup_locks_if_needed(self):
        """定期清理长时间未使用的锁，防止内存泄漏"""
        now = time.time()
        if now - self._last_lock_cleanup < self._LOCK_CLEANUP_INTERVAL:
            return
        
        self._last_lock_cleanup = now
        cleanup_threshold = now - self._LOCK_MAX_AGE
        
        expired_fetch = [
            uid for uid in list(self._fetch_locks.keys())
            if self._lock_access_time.get(uid, 0) < cleanup_threshold
        ]
        for uid in expired_fetch:
            del self._fetch_locks[uid]
            self._lock_access_time.pop(uid, None)
        
        expired_members = [
            gid for gid in list(self._members_locks.keys())
            if self._lock_access_time.get(f"members_{gid}", 0) < cleanup_threshold
        ]
        for gid in expired_members:
            del self._members_locks[gid]
            self._lock_access_time.pop(f"members_{gid}", None)
        
        if expired_fetch or expired_members:
            logger.debug(f"清理过期锁: {len(expired_fetch)}个用户锁, {len(expired_members)}个群锁")
    
    # ========== 公开方法 ==========
    
    async def get_user_display_name(self, event: AstrMessageEvent, group_id: str, user_id: str) -> str:
        """获取用户的群昵称（统一入口）
        
        采用分层缓存策略：
        1. 从昵称缓存获取（最高效）
        2. 从群成员字典缓存获取（中等效率）
        3. 从API获取（带异步锁防止缓存击穿）
        4. 返回默认昵称
        """
        group_id_str = str(group_id)
        self.mark_group_active(group_id_str)
        self._cleanup_zombie_groups()
        
        # 步骤1: 从昵称缓存获取
        nickname = self._get_from_nickname_cache(user_id)
        if nickname:
            return nickname
        
        # 步骤2: 从群成员字典缓存获取
        nickname = self._get_from_dict_cache(group_id_str, user_id)
        if nickname:
            return nickname
        
        # 步骤3: 从API获取（带异步锁防止缓存击穿）
        nickname = await self._fetch_and_cache_from_api(event, group_id_str, user_id)
        if nickname:
            return nickname
        
        # 步骤4: 返回默认昵称
        return f"用户{user_id}"
    
    async def get_fallback_nickname(self, event: AstrMessageEvent, user_id: str) -> str:
        """获取备用昵称（从事件对象获取发送者名称）"""
        try:
            nickname = event.get_sender_name()
            if not nickname or not nickname.strip():
                nickname = f"用户{user_id}"
                logger.warning(f"事件中获取的昵称为空，使用默认昵称: {nickname}")
            return nickname
        except (AttributeError, KeyError, TypeError) as e:
            logger.error(f"获取备用昵称失败: {e}")
            return f"用户{user_id}"
    
    def get_display_name_from_member(self, member: Dict[str, Any]) -> Optional[str]:
        """从群成员信息中提取显示昵称（跨平台通用）"""
        return PlatformHelper.get_display_name_from_member(member)
    
    def clear_user_cache(self, user_id: Optional[str] = None):
        """清理用户昵称缓存"""
        if user_id:
            nickname_cache_key = f"nickname_{user_id}"
            if nickname_cache_key in self.user_nickname_cache:
                del self.user_nickname_cache[nickname_cache_key]
        else:
            self.user_nickname_cache.clear()
        
        logger.info(f"清理用户缓存: {user_id or '全部'}")
    
    async def refresh_group_cache(self, event: AstrMessageEvent, group_id: str) -> bool:
        """刷新指定群的成员缓存"""
        try:
            cache_key = f"group_members_{group_id}"
            if cache_key in self.group_members_cache:
                del self.group_members_cache[cache_key]
            
            dict_cache_key = f"group_members_dict_{group_id}"
            if dict_cache_key in self.group_members_dict_cache:
                del self.group_members_dict_cache[dict_cache_key]
            
            self.clear_user_cache()
            self.mark_group_active(group_id)
            
            members_info = await self._fetch_group_members_from_api(event, group_id)
            return members_info is not None
        except Exception as e:
            logger.error(f"刷新群成员缓存失败: {e}")
            return False
    
    async def get_group_members(self, event: AstrMessageEvent, group_id: str) -> Optional[List[Dict[str, Any]]]:
        """获取群成员列表（带缓存）"""
        cache_key = f"group_members_{group_id}"
        
        if cache_key in self.group_members_cache:
            return self.group_members_cache[cache_key]
        
        return await self._fetch_group_members_from_api(event, group_id)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        return {
            "members_cache_size": len(self.group_members_cache),
            "members_cache_maxsize": self.group_members_cache.maxsize,
            "dict_cache_size": len(self.group_members_dict_cache),
            "nickname_cache_size": len(self.user_nickname_cache),
            "nickname_cache_maxsize": self.user_nickname_cache.maxsize,
        }
    
    def update_nickname_cache(self, user_id: str, nickname: str):
        """更新昵称缓存"""
        nickname_cache_key = f"nickname_{user_id}"
        self.user_nickname_cache[nickname_cache_key] = nickname
    
    def get_nickname_from_cache(self, user_id: str) -> Optional[str]:
        """从昵称缓存获取昵称"""
        nickname_cache_key = f"nickname_{user_id}"
        return self.user_nickname_cache.get(nickname_cache_key)
    
    def is_milestone_cached(self, group_id: str, user_id: str, count: int) -> bool:
        """检查里程碑是否已缓存"""
        milestone_cache_key = f"milestone_{group_id}_{user_id}_{count}"
        return milestone_cache_key in self._milestone_cache
    
    def mark_milestone_cached(self, group_id: str, user_id: str, count: int):
        """标记里程碑已推送"""
        milestone_cache_key = f"milestone_{group_id}_{user_id}_{count}"
        self._milestone_cache[milestone_cache_key] = True
    
    def clear_all(self):
        """清理所有缓存"""
        self.group_members_cache.clear()
        self.group_members_dict_cache.clear()
        self.user_nickname_cache.clear()
        self._fetch_locks.clear()
        self._members_locks.clear()
        self._group_last_active.clear()
        logger.info("所有缓存已清理")
    
    # ========== 私有方法 ==========
    
    def _get_from_nickname_cache(self, user_id: str) -> Optional[str]:
        """从昵称缓存获取昵称"""
        nickname_cache_key = f"nickname_{user_id}"
        return self.user_nickname_cache.get(nickname_cache_key)
    
    def _get_from_dict_cache(self, group_id: str, user_id: str) -> Optional[str]:
        """从群成员字典缓存获取昵称"""
        dict_cache_key = f"group_members_dict_{group_id}"
        if dict_cache_key in self.group_members_dict_cache:
            members_dict = self.group_members_dict_cache[dict_cache_key]
            if user_id in members_dict:
                member = members_dict[user_id]
                display_name = self.get_display_name_from_member(member)
                if display_name:
                    self.update_nickname_cache(user_id, display_name)
                    return display_name
        return None
    
    async def _fetch_and_cache_from_api(self, event: AstrMessageEvent, group_id: str, user_id: str) -> Optional[str]:
        """从API获取群成员信息并缓存（带异步锁防止缓存击穿）"""
        lock = self._get_fetch_lock(user_id)
        async with lock:
            cached = self._get_from_nickname_cache(user_id)
            if cached:
                return cached
            
            cached = self._get_from_dict_cache(group_id, user_id)
            if cached:
                return cached
            
            try:
                members_info = await self._fetch_group_members_from_api(event, group_id)
                if members_info:
                    dict_cache_key = f"group_members_dict_{group_id}"
                    members_dict = {}
                    for m in members_info:
                        uid = PlatformHelper.get_user_id_from_member(m)
                        if uid:
                            members_dict[uid] = m
                    self.group_members_dict_cache[dict_cache_key] = members_dict
                    
                    if user_id in members_dict:
                        member = members_dict[user_id]
                        display_name = self.get_display_name_from_member(member)
                        if display_name:
                            self.update_nickname_cache(user_id, display_name)
                            return display_name
            except (AttributeError, KeyError, TypeError) as e:
                logger.warning(f"获取群成员信息失败(数据格式错误): {e}")
            except (ConnectionError, TimeoutError, OSError) as e:
                logger.warning(f"获取群成员信息失败(网络错误): {e}")
            except (ImportError, RuntimeError) as e:
                logger.warning(f"获取群成员信息失败(系统错误): {e}")
            
            return None
    
    async def _fetch_group_members_from_api(self, event: AstrMessageEvent, group_id: str) -> Optional[List[Dict[str, Any]]]:
        """从API获取群成员（跨平台通用，带群级别异步锁）"""
        lock = self._get_members_lock(group_id)
        async with lock:
            cache_key = f"group_members_{group_id}"
            if cache_key in self.group_members_cache:
                return self.group_members_cache[cache_key]
            
            try:
                helper = PlatformHelper(event, self.context)
                members_info = await helper.get_group_members(group_id)
                
                if members_info:
                    self.group_members_cache[cache_key] = members_info
                    
                    if len(members_info) > 500:
                        logger.warning(f"群 {group_id} 成员数较多({len(members_info)}),建议调整缓存策略")
                    
                    return members_info
            except (AttributeError, KeyError, TypeError) as e:
                logger.warning(f"获取群成员列表失败(数据格式错误): {e}")
            except (ConnectionError, TimeoutError, OSError) as e:
                logger.warning(f"获取群成员列表失败(网络错误): {e}")
            except (ImportError, RuntimeError) as e:
                logger.warning(f"获取群成员列表失败(系统错误): {e}")
            
            return None
