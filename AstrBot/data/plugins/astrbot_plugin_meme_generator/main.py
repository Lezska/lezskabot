import yaml
from pathlib import Path
from astrbot.api.event import filter
from astrbot.api.star import Context, Star, register
from astrbot.core import AstrBotConfig
from astrbot.core.platform import AstrMessageEvent
from astrbot.core.star.filter.event_message_type import EventMessageType
from astrbot.api import logger
from astrbot.api.star import StarTools

from .config import MemeConfig
from .core import MemeManager
from .handlers import TemplateHandlers, GenerationHandler, AdminHandlers
from .utils import PermissionUtils
from .utils.template_loader import template_loader


def load_metadata_from_yaml():
    """从metadata.yaml加载插件元数据"""
    try:
        metadata_path = Path(__file__).parent / "metadata.yaml"
        if metadata_path.exists():
            with open(metadata_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f) or {}
    except Exception:
        pass
    return {}


_metadata = load_metadata_from_yaml()


@register(
    _metadata.get("name"),
    _metadata.get("author"),
    _metadata.get("desc"),
    _metadata.get("version"),
    _metadata.get("repo"),
)
class MemeGeneratorPlugin(Star):
    def __init__(self, context: Context, config: AstrBotConfig):
        super().__init__(context)

        # 初始化配置管理器
        self.meme_config = MemeConfig(config)

        # 获取插件数据目录

        data_dir = str(StarTools.get_data_dir())

        # 初始化核心管理器
        self.meme_manager = MemeManager(self.meme_config, data_dir)

        # 初始化命令处理器
        self.template_handlers = TemplateHandlers(self.meme_manager, self.meme_config)
        self.generation_handler = GenerationHandler(self.meme_manager)
        self.admin_handlers = AdminHandlers(self.meme_config)

    async def __aenter__(self):
        """异步上下文管理器入口"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口 - 清理资源"""
        await self.cleanup()
        return False  # 不抑制异常

    async def cleanup(self):
        """清理资源"""
        try:
            # 停止缓存清理任务
            await self.meme_manager.cache_manager.stop_cleanup_task()
        except (AttributeError, RuntimeError) as e:
            logger.error(f"清理缓存管理器时出错: {e}")

    @filter.command("表情帮助", alias={"meme帮助", "meme菜单"})
    async def meme_help_menu(self, event: AstrMessageEvent):
        """查看meme插件帮助菜单"""
        # 检查插件是否启用
        if not self.meme_config.is_plugin_enabled():
            if PermissionUtils.is_bot_admin(event):
                yield event.plain_result(PermissionUtils.get_plugin_disabled_message())
            return

        meme_help_tmpl = template_loader.load_template("meme_help.html")

        template_data = template_loader.load_template_data("meme_help.json")

        # 如果加载失败，使用默认的空数据
        if template_data is None:
            template_data = {
                "basic_commands": [],
                "admin_commands": []
            }

        # 从metadata.yaml加载版本和作者信息
        metadata = load_metadata_from_yaml()
        template_data["version"] = metadata.get("version")
        template_data["author"] = metadata.get("author")

        # 使用 html_render 方法渲染模板
        url = await self.html_render(meme_help_tmpl, template_data)
        yield event.image_result(url)

    @filter.command("表情列表", alias={"meme列表"})
    async def template_list(self, event: AstrMessageEvent):
        """查看所有可用的表情包模板"""
        # 检查插件是否启用
        if not self.meme_config.is_plugin_enabled():
            if PermissionUtils.is_bot_admin(event):
                yield event.plain_result(PermissionUtils.get_plugin_disabled_message())
            return

        async for result in self.template_handlers.handle_template_list(event):
            yield result

    @filter.command("表情信息", alias={"meme信息"})
    async def template_info(
            self, event: AstrMessageEvent, keyword: str | int | None = None
    ):
        """查看指定表情包模板的详细信息"""
        # 检查插件是否启用
        if not self.meme_config.is_plugin_enabled():
            if PermissionUtils.is_bot_admin(event):
                yield event.plain_result(PermissionUtils.get_plugin_disabled_message())
            return

        async for result in self.template_handlers.handle_template_info(event, keyword):
            yield result

    @filter.command("单表情禁用", alias={"单meme禁用"})
    async def disable_template(
            self, event: AstrMessageEvent, template_name: str | None = None
    ):
        """禁用指定的表情包模板（仅限Bot管理员）"""
        # 检查管理员权限
        if not PermissionUtils.is_bot_admin(event):
            return

        async for result in self.template_handlers.handle_disable_template(event, template_name):
            yield result

    @filter.command("单表情启用", alias={"单meme启用"})
    async def enable_template(
            self, event: AstrMessageEvent, template_name: str | None = None
    ):
        """启用指定的表情包模板（仅限Bot管理员）"""
        # 检查管理员权限
        if not PermissionUtils.is_bot_admin(event):
            return

        async for result in self.template_handlers.handle_enable_template(event, template_name):
            yield result

    @filter.command("禁用列表")
    async def list_disabled(self, event: AstrMessageEvent):
        """查看被禁用的模板列表（仅限Bot管理员）"""
        # 检查管理员权限
        if not PermissionUtils.is_bot_admin(event):
            return

        async for result in self.template_handlers.handle_list_disabled(event):
            yield result

    @filter.command("表情启用", alias={"meme启用"})
    async def enable_plugin(self, event: AstrMessageEvent):
        """启用表情包生成功能（仅限Bot管理员）"""
        # 检查管理员权限
        if not PermissionUtils.is_bot_admin(event):
            return

        async for result in self.admin_handlers.handle_enable_plugin(event):
            yield result

    @filter.command("表情禁用", alias={"meme禁用"})
    async def disable_plugin(self, event: AstrMessageEvent):
        """禁用表情包生成功能（仅限Bot管理员）"""
        # 检查管理员权限
        if not PermissionUtils.is_bot_admin(event):
            return

        async for result in self.admin_handlers.handle_disable_plugin(event):
            yield result

    @filter.command("表情状态", alias={"meme状态"})
    async def plugin_info(self, event: AstrMessageEvent):
        """查看表情状态（仅限Bot管理员）"""
        # 检查管理员权限
        if not PermissionUtils.is_bot_admin(event):
            return

        # 获取统计信息
        total_templates = 0
        total_keywords = 0
        try:
            all_memes = await self.meme_manager.template_manager.get_all_memes()
            total_templates = len(all_memes)
            all_keywords = await self.meme_manager.template_manager.get_all_keywords()
            total_keywords = len(all_keywords)
        except Exception:
            pass

        # 尝试加载外部模板
        template_content = template_loader.load_template("meme_info.html")

        # 从metadata.yaml加载版本和作者信息
        metadata = load_metadata_from_yaml()

        # 准备模板数据
        template_data = {
            "plugin_enabled": self.meme_config.is_plugin_enabled(),
            "avatar_cache_enabled": self.meme_config.enable_avatar_cache,
            "cooldown_seconds": self.meme_config.cooldown_seconds,
            "generation_timeout": self.meme_config.generation_timeout,
            "cache_expire_hours": self.meme_config.cache_expire_hours,
            "disabled_templates_count": len(self.meme_config.disabled_templates),
            "total_templates": total_templates,
            "total_keywords": total_keywords,
            "version": metadata.get("version", "v1.1.0"),
            "author": metadata.get("author", "SodaSizzle")
        }

        # 使用 html_render 方法渲染模板
        url = await self.html_render(template_content, template_data)
        yield event.image_result(url)

    @filter.event_message_type(EventMessageType.ALL)
    async def generate_meme(self, event: AstrMessageEvent):
        """
        表情包生成主流程处理器
        """
        # 检查是否是管理员命令，如果是则不处理
        message_str = event.message_str.strip()
        admin_commands = [
            "启用表情包", "meme启用", "启用插件",
            "禁用表情包", "meme禁用", "禁用插件", "关闭表情包",
            "表情状态", "meme状态",
            "表情帮助", "meme帮助",
            "表情列表", "meme列表",
            "禁用列表"
        ]

        # 如果消息以管理员命令开头，则不处理
        for cmd in admin_commands:
            if message_str.startswith(cmd):
                return

        # 检查插件是否启用
        if not self.meme_config.is_plugin_enabled():
            # 插件被禁用时不响应普通用户，但Bot管理员可以看到提示
            if PermissionUtils.is_bot_admin(event):
                yield event.plain_result(PermissionUtils.get_plugin_disabled_message())
            return

        async for result in self.generation_handler.handle_generate_meme(event):
            yield result
