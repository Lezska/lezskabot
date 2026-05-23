"""
数据存储模块
将DataManager拆分为更小的、职责单一的类
"""

import json
import asyncio
import aiofiles
import aiofiles.os
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from astrbot.api import logger as astrbot_logger
from cachetools import TTLCache

from .models import UserData, PluginConfig, MessageDate

# 从集中管理的常量模块导入缓存配置
from .constants import (
    DATA_CACHE_MAXSIZE,
    DATA_CACHE_TTL,
    CONFIG_CACHE_MAXSIZE,
    CONFIG_CACHE_TTL
)


class GroupDataStore:
    """群组数据存储管理器
    
    专门负责群组数据（JSON文件）的增删改查和修复。
    
    优化：延迟批量写入 + 紧凑 JSON 格式。
    - 数据修改先缓存在内存 _dirty_cache 中
    - 积累 _FLUSH_THRESHOLD（10）次修改后批量写入一次
    - 使用紧凑格式（indent=None）减少文件体积约 50%
    - get_group_data() 读的是 data_cache（内存），不受延迟写入影响
    - 插件关闭时通过 flush_all() 确保数据落盘
    """
    
    # 积累多少次修改后触发一次写盘
    _FLUSH_THRESHOLD = 10
    # 脏缓存最大容量，防止内存泄漏
    _DIRTY_CACHE_MAXSIZE = 500
    
    def __init__(self, groups_dir: Path, logger=None):
        self.groups_dir = groups_dir
        self.logger = logger or astrbot_logger
        
        # 延迟写入缓存：group_id -> (users, group_name)
        # 添加大小限制防止内存泄漏
        self._dirty_cache: Dict[str, tuple] = {}
        # 脏标记计数
        self._dirty_count = 0
        # 批量写入任务
        self._batch_write_task: Optional[asyncio.Task] = None
        # 写盘触发事件（积累够 _FLUSH_THRESHOLD 次时 set）
        self._write_trigger = asyncio.Event()
        # 停止事件（插件关闭时 set）
        self._stop_event = asyncio.Event()
        # 目录创建延迟到首次使用时异步执行
    
    async def _ensure_groups_directory(self):
        """确保群组数据目录存在"""
        await asyncio.to_thread(self.groups_dir.mkdir, parents=True, exist_ok=True)
    
    def _get_group_file_path(self, group_id: str) -> Path:
        """获取群组数据文件路径"""
        return self.groups_dir / f"{group_id}.json"
    
    async def load_group_data(self, group_id: str) -> List[UserData]:
        """加载群组数据"""
        # 确保目录存在
        await self._ensure_groups_directory()
        file_path = self._get_group_file_path(group_id)
        
        if not await aiofiles.os.path.exists(file_path):
            return []
        
        try:
            async with aiofiles.open(str(file_path), 'r', encoding='utf-8') as f:
                content = await f.read()
                data = await asyncio.to_thread(json.loads, content)
            
            # 转换为UserData对象列表
            users = []
            
            # 处理不同的数据格式
            if isinstance(data, list):
                # 如果数据是列表格式，直接使用
                user_data_list = data
            elif isinstance(data, dict):
                # 如果数据是字典格式，获取users字段
                user_data_list = data.get('users', [])
            else:
                # 如果数据格式不正确，返回空列表
                self.logger.warning(f"群组 {group_id} 数据格式不正确")
                return []
            
            for user_data in user_data_list:
                try:
                    # 使用UserData.from_dict方法来消除逻辑重复
                    user = UserData.from_dict(user_data)
                    users.append(user)
                except (ValueError, TypeError) as e:
                    self.logger.warning(f"跳过无效的用户数据: {e}")
                    continue
            
            return users
            
        except (IOError, json.JSONDecodeError) as e:
            self.logger.error(f"读取群组数据失败 {group_id}: {e}")
            return []
    
    async def save_group_data(self, group_id: str, users: List[UserData], group_name: str = None) -> bool:
        """保存群组数据（延迟批量写入）
        
        数据先缓存在内存中，积累 _FLUSH_THRESHOLD 次修改后批量写入磁盘。
        get_group_data() 读的是 data_cache（内存），不受延迟写入影响，数据实时。
        插件关闭时通过 flush_all() 确保数据落盘。
        
        Args:
            group_id: 群组ID
            users: 用户数据列表
            group_name: 可选的群组名称，如果提供则保存到数据文件中
            
        Returns:
            bool: 始终返回True（实际写入在后台批量执行）
        """
        # 缓存数据到脏缓存
        self._dirty_cache[group_id] = (users, group_name)
        self._dirty_count += 1
        
        # 检查脏缓存大小，超过上限时强制立即写盘防止内存泄漏
        if len(self._dirty_cache) >= self._DIRTY_CACHE_MAXSIZE:
            self._write_trigger.set()
            self.logger.warning(f"脏缓存达到上限({self._DIRTY_CACHE_MAXSIZE})，强制立即写盘")
        elif self._dirty_count >= self._FLUSH_THRESHOLD:
            self._write_trigger.set()
        
        # 启动批量写入任务（如果尚未启动）
        if self._batch_write_task is None or self._batch_write_task.done():
            self._batch_write_task = asyncio.create_task(self._batch_write_loop())
        
        return True
    
    async def _batch_write_loop(self):
        """批量写入循环：等待 _write_trigger 事件触发后写盘，零CPU空转"""
        try:
            while self._dirty_cache:
                # 检查是否收到停止信号
                if self._stop_event.is_set():
                    break
                    
                # 等待触发事件（积累够 _FLUSH_THRESHOLD 次），或超时（60秒，作为兜底防止数据长时间在内存中丢失）
                try:
                    # 使用 wait_for 避免创建额外 task，同时设定 60 秒的强制兜底写入时间
                    await asyncio.wait_for(self._write_trigger.wait(), timeout=60.0)
                except asyncio.TimeoutError:
                    # 超时兜底写入，无需任何特殊处理，直接进入写盘逻辑
                    pass
                except asyncio.CancelledError:
                    raise
                
                # 如果收到停止信号，退出循环（退出前会自动写盘）
                if self._stop_event.is_set():
                    break
                
                # 重置触发器，并执行写盘
                self._write_trigger.clear()
                await self._flush_dirty_cache()
                
        except asyncio.CancelledError:
            pass
        finally:
            # 无论是正常退出、抛出异常还是被取消，都确保剩余的脏数据被写入
            if self._dirty_cache:
                await self._flush_dirty_cache()
    
    async def _flush_dirty_cache(self):
        """将脏缓存中的数据批量写入磁盘"""
        if not self._dirty_cache:
            return
        
        # 取出当前所有脏数据
        batch = dict(self._dirty_cache)
        self._dirty_cache.clear()
        self._dirty_count = 0
        
        for group_id, (users, group_name) in batch.items():
            try:
                await self._write_group_data_direct(group_id, users, group_name)
            except Exception as e:
                self.logger.error(f"批量写入群组数据失败 {group_id}: {e}")
                # 写失败的放回脏缓存，下次重试
                if group_id not in self._dirty_cache:
                    self._dirty_cache[group_id] = (users, group_name)
    
    async def _write_group_data_direct(self, group_id: str, users: List[UserData], group_name: str = None):
        """直接写入群组数据到磁盘（无缓存）"""
        file_path = self._get_group_file_path(group_id)
        
        # 尝试读取现有数据以保留 group_name
        existing_group_name = None
        if await aiofiles.os.path.exists(file_path):
            try:
                async with aiofiles.open(str(file_path), 'r', encoding='utf-8') as f:
                    content = await f.read()
                    if content.strip():
                        existing_data = json.loads(content)
                        if isinstance(existing_data, dict):
                            existing_group_name = existing_data.get('group_name')
            except (json.JSONDecodeError, IOError):
                pass
        
        # 准备数据（使用紧凑格式减少文件体积）
        data = {
            'group_id': group_id,
            'last_updated': datetime.now().isoformat(),
            'users': [user.to_dict() for user in users]
        }
        
        # 如果提供了新的 group_name，使用新的；否则保留原有的
        final_group_name = group_name or existing_group_name
        if final_group_name:
            data['group_name'] = final_group_name
        
        # 使用 indent=None 减少文件体积（约减少50%）
        json_content = await asyncio.to_thread(json.dumps, data, ensure_ascii=False, indent=None, separators=(',', ':'))
        async with aiofiles.open(str(file_path), 'w', encoding='utf-8') as f:
            await f.write(json_content)
    
    async def flush_all(self):
        """立即将所有脏数据写入磁盘（插件关闭时调用）
        
        优化：取消批量写入任务 + 直接刷盘，最大耗时不超过 2 秒，
        避免 AstrBot 保存配置时因插件重载被阻塞。
        """
        self._stop_event.set()
        # 取消批量写入任务（如果有），避免等待 60 秒超时
        if self._batch_write_task and not self._batch_write_task.done():
            self._batch_write_task.cancel()
            try:
                await asyncio.wait_for(self._batch_write_task, timeout=2)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
        # 直接写入剩余脏数据，不依赖后台任务
        await self._flush_dirty_cache()
    
    async def delete_group_data(self, group_id: str) -> bool:
        """删除群组数据"""
        file_path = self._get_group_file_path(group_id)
        
        try:
            if await aiofiles.os.path.exists(file_path):
                await aiofiles.os.remove(file_path)
                return True
            return False
        except OSError as e:
            self.logger.error(f"删除群组数据失败 {group_id}: {e}")
            return False
    
    async def repair_corrupted_json(self, group_id: str) -> bool:
        """修复损坏的JSON文件"""
        file_path = self._get_group_file_path(group_id)
        
        if not await aiofiles.os.path.exists(file_path):
            return False
        
        try:
            # 读取文件内容
            async with aiofiles.open(str(file_path), 'r', encoding='utf-8') as f:
                content = await f.read()
            
            # 尝试解析JSON
            try:
                await asyncio.to_thread(json.loads, content)
                return True  # 文件正常
            except json.JSONDecodeError:
                # 文件损坏，创建备份
                backup_path = file_path.with_suffix('.json.backup')
                async with aiofiles.open(str(backup_path), 'w', encoding='utf-8') as f:
                    await f.write(content)
                
                # 创建新的空数据文件
                await self.save_group_data(group_id, [])
                self.logger.warning(f"已修复损坏的群组数据文件 {group_id}，备份保存至 {backup_path}")
                return True
                
        except (IOError, OSError) as e:
            self.logger.error(f"修复群组数据失败 {group_id}: {e}")
            return False


class ConfigManager:
    """配置管理器
    
    专门负责 config.json 的读写。
    """
    
    def __init__(self, config_file: Path, logger=None):
        self.config_file = config_file
        self.logger = logger or astrbot_logger
        # 目录创建延迟到首次使用时异步执行
    
    async def _ensure_config_directory(self):
        """确保配置目录存在"""
        await asyncio.to_thread(self.config_file.parent.mkdir, parents=True, exist_ok=True)
    
    async def load_config(self) -> PluginConfig:
        """加载配置"""
        # 确保配置目录存在
        await self._ensure_config_directory()
        if not await aiofiles.os.path.exists(self.config_file):
            # 创建默认配置
            default_config = PluginConfig()
            await self.save_config(default_config)
            return default_config
        
        try:
            async with aiofiles.open(str(self.config_file), 'r', encoding='utf-8') as f:
                content = await f.read()
                data = await asyncio.to_thread(json.loads, content)
            
            # 转换为PluginConfig对象
            return PluginConfig.from_dict(data)
            
        except (IOError, json.JSONDecodeError) as e:
            self.logger.error(f"读取配置文件失败: {e}")
            # 返回默认配置
            return PluginConfig()
    
    async def save_config(self, config: PluginConfig) -> bool:
        """保存配置"""
        try:
            data = config.to_dict()
            
            json_content = await asyncio.to_thread(json.dumps, data, ensure_ascii=False, indent=2)
            async with aiofiles.open(str(self.config_file), 'w', encoding='utf-8') as f:
                await f.write(json_content)
            
            return True
            
        except (IOError, OSError) as e:
            self.logger.error(f"保存配置文件失败: {e}")
            return False


class PluginCache:
    """插件缓存管理器
    
    统一管理所有 TTLCache 实例（数据、配置、图片等）。
    """
    
    def __init__(self, data_cache_maxsize=DATA_CACHE_MAXSIZE, data_cache_ttl=DATA_CACHE_TTL, 
                 config_cache_maxsize=CONFIG_CACHE_MAXSIZE, config_cache_ttl=CONFIG_CACHE_TTL, logger=None):
        self.logger = logger or astrbot_logger
        
        # 缓存设置
        self.data_cache_maxsize = data_cache_maxsize
        self.data_cache_ttl = data_cache_ttl
        self.config_cache_maxsize = config_cache_maxsize
        self.config_cache_ttl = config_cache_ttl
        
        # 创建缓存实例
        self.data_cache = TTLCache(maxsize=self.data_cache_maxsize, ttl=self.data_cache_ttl)
        self.config_cache = TTLCache(maxsize=self.config_cache_maxsize, ttl=self.config_cache_ttl)
    
    def get_data_cache(self):
        """获取数据缓存"""
        return self.data_cache
    
    def get_config_cache(self):
        """获取配置缓存"""
        return self.config_cache
    
    def clear_all_caches(self):
        """清理所有缓存"""
        self.data_cache.clear()
        self.config_cache.clear()
        self.logger.info("所有缓存已清理")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息
        
        注意：TTLCache 不支持 hits/misses 统计，只返回基本统计信息。
        """
        return {
            'data_cache': {
                'size': len(self.data_cache),
                'maxsize': self.data_cache.maxsize,
                'ttl': self.data_cache.ttl
            },
            'config_cache': {
                'size': len(self.config_cache),
                'maxsize': self.config_cache.maxsize,
                'ttl': self.config_cache.ttl
            }
        }