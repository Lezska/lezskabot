"""模板加载工具模块"""

import json
import os
from pathlib import Path
from typing import Optional, Dict, Any



class TemplateLoader:
    """HTML模板加载器"""
    
    def __init__(self, plugin_dir: str):
        """
        初始化模板加载器
        
        Args:
            plugin_dir: 插件根目录路径
        """
        self.plugin_dir = Path(plugin_dir)
        self.static_dir = self.plugin_dir / "static"
        self.html_dir = self.static_dir / "html"
        self.data_dir = self.static_dir / "data"
        self.config_dir = self.plugin_dir / "config"
    
    def load_template(self, template_name: str) -> Optional[str]:
        """
        加载HTML模板文件
        
        Args:
            template_name: 模板文件名（不包含路径）
            
        Returns:
            模板内容字符串，失败返回None
        """
        try:
            template_path = self.html_dir / template_name
            if template_path.exists() and template_path.is_file():
                with open(template_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # 处理CSS文件路径，将相对路径转换为绝对路径
                content = self._process_static_paths(content)
                return content
            else:
                return None
        except Exception as e:
            return None
    
    def _process_static_paths(self, content: str) -> str:
        """
        处理HTML中的静态资源路径
        
        Args:
            content: HTML内容
            
        Returns:
            处理后的HTML内容
        """

        # 处理帮助页面CSS
        if '../css/meme_help.css' in content:
            css_path = self.static_dir / "css" / "meme_help.css"
            if css_path.exists():
                try:
                    with open(css_path, 'r', encoding='utf-8') as f:
                        css_content = f.read()

                    # 替换CSS链接为内联样式
                    css_link = '<link rel="stylesheet" href="../css/meme_help.css">'
                    inline_css = f'<style>\n{css_content}\n</style>'
                    content = content.replace(css_link, inline_css)
                except Exception:
                    # 如果读取CSS失败，保持原样
                    pass

        # 处理状态信息页面CSS
        if '../css/meme_info.css' in content:
            css_path = self.static_dir / "css" / "meme_info.css"
            if css_path.exists():
                try:
                    with open(css_path, 'r', encoding='utf-8') as f:
                        css_content = f.read()

                    # 替换CSS链接为内联样式
                    css_link = '<link rel="stylesheet" href="../css/meme_info.css">'
                    inline_css = f'<style>\n{css_content}\n</style>'
                    content = content.replace(css_link, inline_css)
                except Exception:
                    # 如果读取CSS失败，保持原样
                    pass
        
        return content
    
    def get_template_path(self, template_name: str) -> Path:
        """
        获取模板文件的完整路径

        Args:
            template_name: 模板文件名

        Returns:
            模板文件路径
        """
        return self.html_dir / template_name
    
    def template_exists(self, template_name: str) -> bool:
        """
        检查模板文件是否存在

        Args:
            template_name: 模板文件名

        Returns:
            模板是否存在
        """
        template_path = self.html_dir / template_name
        return template_path.exists() and template_path.is_file()

    def load_template_data(self, data_file_name: str) -> Optional[Dict[str, Any]]:
        """
        加载模板数据JSON文件

        Args:
            data_file_name: JSON数据文件名（不包含路径）

        Returns:
            模板数据字典，失败返回None
        """
        try:
            data_path = self.data_dir / data_file_name
            if data_path.exists() and data_path.is_file():
                with open(data_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                return None
        except Exception as e:
            # 可以在这里添加日志记录
            return None


def get_plugin_dir() -> str:
    """
    获取插件根目录路径
    
    Returns:
        插件根目录的绝对路径
    """
    # 获取当前文件的目录，然后向上一级到插件根目录
    current_file = Path(__file__)
    plugin_dir = current_file.parent.parent
    return str(plugin_dir.absolute())


# 创建全局模板加载器实例
template_loader = TemplateLoader(get_plugin_dir())
