"""命令处理器模块"""

from .template_handlers import TemplateHandlers
from .generation_handler import GenerationHandler
from .admin_handlers import AdminHandlers

__all__ = ["TemplateHandlers", "GenerationHandler", "AdminHandlers"]
