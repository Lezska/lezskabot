from typing import List
from astrbot.core import AstrBotConfig


class MemeConfig:
    """表情包生成器配置管理类"""

    def __init__(self, config: AstrBotConfig):
        self.config = config
        self._load_config()

    def _load_config(self):
        """加载配置"""
        self.enable_plugin: bool = self.config.get("enable_plugin", True)
        self.generation_timeout: int = self.config.get("generation_timeout", 30)
        self.cooldown_seconds: int = self.config.get("cooldown_seconds", 3)
        self.enable_avatar_cache: bool = self.config.get("enable_avatar_cache", True)
        self.cache_expire_hours: int = self.config.get("cache_expire_hours", 24)
        self.disabled_templates: List[str] = self.config.get("disabled_templates", [])

    def save_config(self):
        """保存配置 - 只写入改动的键，避免循环引用"""
        # 更新配置中的特定键值
        self.config["disabled_templates"] = self.disabled_templates
        self.config["enable_plugin"] = self.enable_plugin
        # 调用框架的保存方法，不传入整个配置对象
        self.config.save_config()

    def _save_specific_config(self, key: str, value):
        """保存特定配置项的专用方法"""
        self.config[key] = value
        self.config.save_config()

    def is_template_disabled(self, template_name: str) -> bool:
        """检查模板是否被禁用"""
        return template_name in self.disabled_templates

    def disable_template(self, template_name: str) -> bool:
        """禁用模板"""
        if template_name not in self.disabled_templates:
            self.disabled_templates.append(template_name)
            self._save_specific_config("disabled_templates", self.disabled_templates)
            return True
        return False

    def enable_template(self, template_name: str) -> bool:
        """启用模板"""
        if template_name in self.disabled_templates:
            self.disabled_templates.remove(template_name)
            self._save_specific_config("disabled_templates", self.disabled_templates)
            return True
        return False

    def get_disabled_templates(self) -> List[str]:
        """获取禁用的模板列表"""
        return self.disabled_templates.copy()

    def enable_plugin_func(self) -> bool:
        """启用插件功能"""
        if not self.enable_plugin:
            self.enable_plugin = True
            self._save_specific_config("enable_plugin", True)
            return True
        return False

    def disable_plugin_func(self) -> bool:
        """禁用插件功能"""
        if self.enable_plugin:
            self.enable_plugin = False
            self._save_specific_config("enable_plugin", False)
            return True
        return False

    def is_plugin_enabled(self) -> bool:
        """检查插件是否启用"""
        return self.enable_plugin
