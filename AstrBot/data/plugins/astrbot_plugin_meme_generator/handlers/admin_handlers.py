"""管理员命令处理器"""

from astrbot.core.platform import AstrMessageEvent
from ..config import MemeConfig


class AdminHandlers:
    """管理员命令处理器"""

    def __init__(self, config: MemeConfig):
        self.config = config

    async def handle_enable_plugin(self, event: AstrMessageEvent):
        """处理启用插件命令"""
        # 尝试启用插件
        if self.config.enable_plugin_func():
            yield event.plain_result("✅ 表情包生成功能已启用")
        else:
            yield event.plain_result("ℹ️ 表情包生成功能已经是启用状态")

    async def handle_disable_plugin(self, event: AstrMessageEvent):
        """处理禁用插件命令"""
        # 尝试禁用插件
        if self.config.disable_plugin_func():
            yield event.plain_result("🔒 表情包生成功能已禁用")
        else:
            yield event.plain_result("ℹ️ 表情包生成功能已经是禁用状态")
