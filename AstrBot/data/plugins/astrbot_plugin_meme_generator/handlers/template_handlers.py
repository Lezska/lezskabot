"""模板相关命令处理器"""

from astrbot.core.platform import AstrMessageEvent
import astrbot.core.message.components as Comp
from ..core import MemeManager
from ..config import MemeConfig


class TemplateHandlers:
    """模板相关命令处理器"""

    def __init__(self, meme_manager: MemeManager, config: MemeConfig):
        self.meme_manager = meme_manager
        self.config = config

    async def handle_template_list(self, event: AstrMessageEvent):
        """处理表情列表命令"""
        output = await self.meme_manager.generate_template_list()
        if output:
            yield event.chain_result([Comp.Image.fromBytes(output)])
        else:
            yield event.plain_result("表情包列表生成失败")

    async def handle_template_info(self, event: AstrMessageEvent, keyword: str | int | None = None):
        """处理模板信息命令"""
        if not keyword:
            yield event.plain_result("请指定要查看的模板关键词")
            return

        keyword = str(keyword)
        template_info = await self.meme_manager.get_template_info(keyword)

        if not template_info:
            yield event.plain_result("未找到相关模板")
            return

        # 构建信息文本
        meme_info = self._build_template_info_text(template_info)

        # 只返回文本信息，不再包含预览图
        yield event.plain_result(meme_info)

    async def handle_disable_template(self, event: AstrMessageEvent, template_name: str | None = None):
        """处理禁用模板命令"""
        if not template_name:
            yield event.plain_result("请指定要禁用的模板名称")
            return

        if not await self.meme_manager.template_manager.keyword_exists(template_name):
            yield event.plain_result(f"模板 {template_name} 不存在")
            return

        if self.config.is_template_disabled(template_name):
            yield event.plain_result(f"模板 {template_name} 已被禁用")
            return

        if self.config.disable_template(template_name):
            yield event.plain_result(f"✅ 已禁用模板: {template_name}")
        else:
            yield event.plain_result(f"❌ 禁用模板失败: {template_name}")

    async def handle_enable_template(self, event: AstrMessageEvent, template_name: str | None = None):
        """处理启用模板命令"""
        if not template_name:
            yield event.plain_result("请指定要启用的模板名称")
            return

        if not await self.meme_manager.template_manager.keyword_exists(template_name):
            yield event.plain_result(f"模板 {template_name} 不存在")
            return

        if not self.config.is_template_disabled(template_name):
            yield event.plain_result(f"模板 {template_name} 未被禁用")
            return

        if self.config.enable_template(template_name):
            yield event.plain_result(f"✅ 已启用模板: {template_name}")
        else:
            yield event.plain_result(f"❌ 启用模板失败: {template_name}")

    async def handle_list_disabled(self, event: AstrMessageEvent):
        """处理禁用列表命令"""
        disabled_templates = self.config.get_disabled_templates()

        if not disabled_templates:
            yield event.plain_result("📋 当前没有禁用的模板")
            return

        # 格式化展示禁用列表
        formatted_text = self._format_template_list(
            disabled_templates,
            title="🔒 禁用模板列表",
            empty_message="当前没有禁用的模板"
        )

        yield event.plain_result(formatted_text)

    def _format_template_list(self, templates: list, title: str, empty_message: str, items_per_page: int = 20) -> str:
        """格式化模板列表展示"""
        if not templates:
            return f"{title}\n{empty_message}"

        # 计算总页数
        total_items = len(templates)
        total_pages = (total_items + items_per_page - 1) // items_per_page

        # 构建格式化文本
        result = f"{title}\n"
        result += f"📊 总计: {total_items} 个模板\n"

        if total_pages > 1:
            result += f"📄 分页显示 (每页 {items_per_page} 个，共 {total_pages} 页)\n"

        result += "─" * 30 + "\n"

        # 显示第一页内容
        page_templates = templates[:items_per_page]

        # 计算列宽（用于对齐）
        max_index_width = len(str(len(page_templates)))

        for i, template in enumerate(page_templates, 1):
            # 格式化编号，右对齐
            index_str = f"{i:>{max_index_width}}"
            result += f"{index_str}. {template}\n"

        if total_pages > 1:
            result += "─" * 30 + "\n"
            result += f"💡 提示: 当前显示第 1/{total_pages} 页"
            if total_items > items_per_page:
                remaining = total_items - items_per_page
                result += f"，还有 {remaining} 个模板未显示"

        return result

    def _build_template_info_text(self, template_info: dict) -> str:
        """构建模板信息文本"""
        meme_info = ""

        if template_info["name"]:
            meme_info += f"名称：{template_info['name']}\n"

        if template_info["keywords"]:
            meme_info += f"别名：{template_info['keywords']}\n"

        max_images = template_info["max_images"]
        min_images = template_info["min_images"]
        if max_images > 0:
            meme_info += (
                f"所需图片：{min_images}张\n"
                if min_images == max_images
                else f"所需图片：{min_images}~{max_images}张\n"
            )

        max_texts = template_info["max_texts"]
        min_texts = template_info["min_texts"]
        if max_texts > 0:
            meme_info += (
                f"所需文本：{min_texts}段\n"
                if min_texts == max_texts
                else f"所需文本：{min_texts}~{max_texts}段\n"
            )

        if template_info["default_texts"]:
            meme_info += f"默认文本：{template_info['default_texts']}\n"

        if template_info["tags"]:
            meme_info += f"标签：{template_info['tags']}\n"

        return meme_info
