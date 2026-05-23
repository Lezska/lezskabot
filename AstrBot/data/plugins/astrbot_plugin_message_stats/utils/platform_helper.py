"""
平台兼容性辅助模块

提供统一的跨平台兼容接口，支持 QQ、Telegram、Discord、飞书 等不同平台。
所有平台相关的操作都集中在此模块中，避免在业务代码中分散处理。

支持的平台：
- QQ (OneBot 协议)
- Telegram
- Discord
- 飞书 (Lark/Feishu)
- 以及其他 AstrBot 支持的平台

使用方式：
    helper = PlatformHelper(event, context)
    client = await helper.get_api_client()
    members = await helper.get_group_members(group_id)
    group_name = await helper.get_group_name(group_id)
"""

import asyncio
from typing import List, Optional, Dict, Any, Union
from astrbot.api import logger as astrbot_logger
from astrbot.api.event import AstrMessageEvent
from astrbot.api.star import Context


class PlatformHelper:
    """平台兼容性辅助类
    
    统一封装所有平台相关的操作，提供跨平台兼容的接口。
    所有方法都使用 hasattr + try/except 双重保护，确保在任何平台上都不会崩溃。
    
    Attributes:
        event: AstrMessageEvent 消息事件对象
        context: AstrBot Context 上下文对象
        logger: 日志记录器
    """
    
    def __init__(self, event: AstrMessageEvent = None, context: Context = None):
        """初始化 PlatformHelper
        
        Args:
            event: AstrMessageEvent 消息事件对象（可选）
            context: AstrBot Context 上下文对象（可选）
        """
        self.event = event
        self.context = context
        self.logger = astrbot_logger
    
    def set_event(self, event: AstrMessageEvent):
        """设置消息事件对象"""
        self.event = event
    
    def set_context(self, context: Context):
        """设置上下文对象"""
        self.context = context
    
    # ========== API 客户端获取 ==========
    
    async def get_api_client(self) -> Optional[Any]:
        """获取 API 客户端（跨平台通用）
        
        尝试从多个来源获取 API 客户端：
        1. event.bot（QQ 平台）
        2. context.bot（Telegram、Discord、飞书等平台）
        3. context.get_bot()（某些平台的备用方式）
        
        Returns:
            API 客户端对象，如果所有方式都失败则返回 None
        """
        client = None
        
        # 方式1: 从 event.bot 获取（QQ 平台）
        if self.event and hasattr(self.event, 'bot') and self.event.bot:
            client = self.event.bot
        
        # 方式2: 从 context.bot 获取（Telegram、Discord、飞书等平台）
        if not client and self.context and hasattr(self.context, 'bot'):
            try:
                client = self.context.bot
            except (AttributeError, KeyError, TypeError):
                pass
        
        # 方式3: 从 context.get_bot() 获取（某些平台的备用方式）
        if not client and self.context and hasattr(self.context, 'get_bot'):
            try:
                client = await self.context.get_bot()
            except (AttributeError, KeyError, TypeError, NotImplementedError):
                pass
        
        return client
    
    async def call_api(self, action: str, **params) -> Optional[Any]:
        """调用平台 API（跨平台通用）
        
        统一的 API 调用接口，自动处理不同平台的差异。
        
        Args:
            action: API 动作名称（如 'get_group_member_list', 'get_group_info'）
            **params: API 参数
            
        Returns:
            API 响应结果，如果调用失败则返回 None
        """
        client = await self.get_api_client()
        if not client:
            self.logger.debug(f"无法获取API客户端，跳过API调用: {action}")
            return None
        
        try:
            if hasattr(client, 'api'):
                return await client.api.call_action(action, **params)
            else:
                self.logger.debug(f"API客户端没有api属性，跳过API调用: {action}")
                return None
        except (AttributeError, KeyError, TypeError) as e:
            self.logger.debug(f"API调用失败({action}): {e}")
        except (ConnectionError, TimeoutError, OSError) as e:
            self.logger.debug(f"API调用网络错误({action}): {e}")
        except (ImportError, RuntimeError, ValueError) as e:
            self.logger.debug(f"API调用错误({action}): {e}")
        
        return None
    
    # ========== ID 验证 ==========
    
    @staticmethod
    def is_valid_numeric_id(id_value: Any) -> bool:
        """验证是否为有效的数字ID（跨平台通用）
        
        支持：
        - 正数ID（QQ 平台）：123456789
        - 负数ID（Telegram 平台）：-1001234567890
        - 字符串数字ID：'123456789'
        - Discord 的数值ID：123456789012345678
        
        Args:
            id_value: 要验证的ID值
            
        Returns:
            bool: 是否为有效的数字ID
        """
        if id_value is None:
            return False
        
        id_str = str(id_value).strip()
        if not id_str:
            return False
        
        # 处理前导负号（Telegram 平台）
        if id_str.startswith('-'):
            numeric_part = id_str[1:]
            return bool(numeric_part) and numeric_part.isdigit()
        
        # 正数ID
        return id_str.isdigit()
    
    @staticmethod
    def normalize_id(id_value: Any) -> str:
        """标准化ID为字符串（跨平台通用）
        
        将各种格式的ID统一转换为字符串，去除空白字符。
        
        Args:
            id_value: 要标准化的ID值
            
        Returns:
            str: 标准化后的ID字符串
        """
        if id_value is None:
            return ""
        return str(id_value).strip()
    
    # ========== 群组操作 ==========
    
    async def get_group_members(self, group_id: str) -> Optional[List[Dict[str, Any]]]:
        """获取群成员列表（跨平台通用）
        
        统一的群成员获取接口，自动适配不同平台的 API。
        
        Args:
            group_id: 群组ID
            
        Returns:
            群成员列表，如果获取失败则返回 None
        """
        return await self.call_api('get_group_member_list', group_id=group_id)
    
    async def get_group_info(self, group_id: str) -> Optional[Dict[str, Any]]:
        """获取群组信息（跨平台通用）
        
        统一的群组信息获取接口，自动适配不同平台的 API。
        
        Args:
            group_id: 群组ID
            
        Returns:
            群组信息字典，如果获取失败则返回 None
        """
        return await self.call_api('get_group_info', group_id=group_id)
    
    async def get_group_name(self, group_id: str) -> Optional[str]:
        """获取群组名称（跨平台通用）
        
        统一的群组名称获取接口，自动适配不同平台的 API 返回格式。
        
        Args:
            group_id: 群组ID
            
        Returns:
            群组名称，如果获取失败则返回 None
        """
        group_info = await self.get_group_info(group_id)
        if group_info and isinstance(group_info, dict):
            # 尝试多种可能的字段名（不同平台返回格式不同）
            return (group_info.get('group_name') or 
                    group_info.get('group_title') or 
                    group_info.get('name') or 
                    group_info.get('title') or
                    group_info.get('chat_name') or
                    group_info.get('nickname'))
        return None
    
    # ========== 用户信息获取 ==========
    
    async def get_user_info(self, group_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """获取群成员信息（跨平台通用）
        
        Args:
            group_id: 群组ID
            user_id: 用户ID
            
        Returns:
            用户信息字典，如果获取失败则返回 None
        """
        return await self.call_api('get_group_member_info', group_id=group_id, user_id=user_id)
    
    @staticmethod
    def get_display_name_from_member(member: Dict[str, Any]) -> Optional[str]:
        """从群成员信息中提取显示昵称（跨平台通用）
        
        支持不同平台的昵称字段名：
        - QQ: card（群昵称）> nickname（QQ昵称）
        - Telegram: first_name + last_name > username
        - Discord: nickname（群昵称）> global_name > username
        - 飞书: name
        
        Args:
            member: 群成员信息字典
            
        Returns:
            用户的显示昵称，如果获取失败则返回 None
        """
        if not member or not isinstance(member, dict):
            return None
        
        # QQ 平台：card（群昵称）> nickname（QQ昵称）
        display_name = member.get('card') or member.get('nickname')
        if display_name:
            return str(display_name).strip()
        
        # Telegram 平台：first_name + last_name
        first_name = member.get('first_name', '')
        last_name = member.get('last_name', '')
        if first_name or last_name:
            return f"{first_name} {last_name}".strip()
        
        # Telegram 备用：username
        username = member.get('username')
        if username:
            return f"@{username}"
        
        # Discord 平台：nickname（群昵称）> global_name > username
        display_name = member.get('nick') or member.get('global_name') or member.get('username')
        if display_name:
            return str(display_name).strip()
        
        # 飞书平台：name
        name = member.get('name')
        if name:
            return str(name).strip()
        
        return None
    
    @staticmethod
    def get_user_id_from_member(member: Dict[str, Any]) -> Optional[str]:
        """从群成员信息中提取用户ID（跨平台通用）
        
        支持不同平台的用户ID字段名：
        - QQ: user_id
        - Telegram: id
        - Discord: id
        - 飞书: user_id / open_id
        
        Args:
            member: 群成员信息字典
            
        Returns:
            用户ID字符串，如果获取失败则返回 None
        """
        if not member or not isinstance(member, dict):
            return None
        
        # QQ 平台
        user_id = member.get('user_id')
        if user_id is not None:
            return str(user_id)
        
        # Telegram / Discord / 飞书 平台
        user_id = member.get('id')
        if user_id is not None:
            return str(user_id)
        
        # 飞书备用
        user_id = member.get('open_id') or member.get('union_id')
        if user_id is not None:
            return str(user_id)
        
        return None
    
    # ========== 事件信息获取 ==========
    
    def get_group_id_from_event(self) -> Optional[str]:
        """从事件中获取群组ID（跨平台通用）
        
        Returns:
            群组ID字符串，如果无法获取则返回 None
        """
        if not self.event:
            return None
        
        try:
            group_id = self.event.get_group_id()
            return str(group_id) if group_id else None
        except (AttributeError, KeyError, TypeError):
            return None
    
    def get_user_id_from_event(self) -> Optional[str]:
        """从事件中获取用户ID（跨平台通用）
        
        Returns:
            用户ID字符串，如果无法获取则返回 None
        """
        if not self.event:
            return None
        
        try:
            user_id = self.event.get_sender_id()
            return str(user_id) if user_id else None
        except (AttributeError, KeyError, TypeError):
            return None
    
    def get_self_id_from_event(self) -> Optional[str]:
        """从事件中获取机器人自身ID（跨平台通用）
        
        Returns:
            机器人自身ID字符串，如果无法获取则返回 None
        """
        if not self.event:
            return None
        
        try:
            self_id = self.event.get_self_id()
            return str(self_id) if self_id else None
        except (AttributeError, KeyError, TypeError):
            return None
    
    def get_sender_name_from_event(self) -> Optional[str]:
        """从事件中获取发送者名称（跨平台通用）
        
        Returns:
            发送者名称，如果无法获取则返回 None
        """
        if not self.event:
            return None
        
        try:
            return self.event.get_sender_name()
        except (AttributeError, KeyError, TypeError):
            return None
    
    def get_message_str_from_event(self) -> str:
        """从事件中获取消息文本（跨平台通用）
        
        Returns:
            消息文本字符串，如果无法获取则返回空字符串
        """
        if not self.event:
            return ""
        
        try:
            return getattr(self.event, 'message_str', '') or ''
        except (AttributeError, KeyError, TypeError):
            return ""
    
    def get_unified_msg_origin_from_event(self) -> Optional[str]:
        """从事件中获取 unified_msg_origin（跨平台通用）
        
        Returns:
            unified_msg_origin 字符串，如果无法获取则返回 None
        """
        if not self.event:
            return None
        
        try:
            return getattr(self.event, 'unified_msg_origin', None)
        except (AttributeError, KeyError, TypeError):
            return None
    
    # ========== 群成员列表处理 ==========
    
    @staticmethod
    def build_members_dict(members_info: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """构建群成员字典（以用户ID为键）
        
        将群成员列表转换为以用户ID为键的字典，方便快速查找。
        自动适配不同平台的用户ID字段名。
        
        Args:
            members_info: 群成员信息列表
            
        Returns:
            以用户ID为键的群成员字典
        """
        members_dict = {}
        for member in members_info:
            user_id = PlatformHelper.get_user_id_from_member(member)
            if user_id:
                members_dict[user_id] = member
        return members_dict
    
    @staticmethod
    def find_member_in_list(members_info: List[Dict[str, Any]], user_id: str) -> Optional[Dict[str, Any]]:
        """在群成员列表中查找指定用户
        
        自动适配不同平台的用户ID字段名。
        
        Args:
            members_info: 群成员信息列表
            user_id: 要查找的用户ID
            
        Returns:
            用户信息字典，如果未找到则返回 None
        """
        for member in members_info:
            mid = PlatformHelper.get_user_id_from_member(member)
            if mid == user_id:
                return member
        return None
