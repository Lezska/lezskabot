"""模板管理模块"""

import asyncio
from typing import List, Optional
from meme_generator import Meme, get_memes
from astrbot.api import logger


class TemplateManager:
    """表情包模板管理器"""

    def __init__(self):
        self._memes: Optional[List[Meme]] = None
        self._meme_keywords: Optional[List[str]] = None
        self._loading = False
        self._load_lock = asyncio.Lock()

        # 尝试立即加载，但不阻塞初始化
        try:
            self._load_templates_sync()
        except Exception as e:
            logger.warning(f"初始化时加载模板失败，将使用懒加载: {e}")

    def _load_templates_sync(self):
        """同步加载模板（用于初始化时的尝试）"""
        memes = get_memes()
        if memes:  # 只有在成功获取到模板时才更新
            self._memes = memes
            self._meme_keywords = [
                keyword for meme in memes for keyword in meme.info.keywords
            ]
            logger.debug(f"📦 成功加载 {len(memes)} 个表情包模板")
        else:
            logger.warning("未能加载到任何表情包模板")

    async def _ensure_templates_loaded(self):
        """确保模板已加载（懒加载机制）"""
        if self._memes is not None:
            return

        async with self._load_lock:
            # 双重检查锁定模式
            if self._memes is not None:
                return

            if self._loading:
                # 如果正在加载，等待一段时间后重试
                await asyncio.sleep(0.1)
                return

            self._loading = True
            try:
                # 使用 asyncio.to_thread 在线程池中执行同步操作
                memes = await asyncio.to_thread(get_memes)
                if memes:
                    self._memes = memes
                    self._meme_keywords = [
                        keyword for meme in memes for keyword in meme.info.keywords
                    ]
                    logger.debug(f"✅ 模板重新加载成功，共 {len(memes)} 个表情包模板")
                else:
                    logger.error("重新加载失败：未能获取到任何模板")
                    # 设置空列表避免重复加载
                    self._memes = []
                    self._meme_keywords = []
            except Exception as e:
                logger.error(f"重新加载表情包模板失败: {e}")
                # 设置空列表避免重复加载
                self._memes = []
                self._meme_keywords = []
            finally:
                self._loading = False

    async def refresh_templates(self):
        """手动刷新模板列表（用于资源检查完成后调用）"""
        async with self._load_lock:
            self._memes = None
            self._meme_keywords = None
        await self._ensure_templates_loaded()

    @property
    def memes(self) -> List[Meme]:
        """获取模板列表（同步属性，用于向后兼容）"""
        return self._memes or []

    @property
    def meme_keywords(self) -> List[str]:
        """获取关键词列表（同步属性，用于向后兼容）"""
        return self._meme_keywords or []

    async def find_meme(self, keyword: str) -> Optional[Meme]:
        """
        根据关键词查找表情包模板

        Args:
            keyword: 关键词

        Returns:
            找到的表情包模板，未找到返回None
        """
        await self._ensure_templates_loaded()
        for meme in self.memes:
            if keyword == meme.key or any(k == keyword for k in meme.info.keywords):
                return meme
        return None

    async def find_keyword(self, message_str: str) -> Optional[str]:
        """
        从消息中查找匹配的关键词

        Args:
            message_str: 消息字符串

        Returns:
            匹配的关键词，未找到返回None
        """
        await self._ensure_templates_loaded()
        # 精确匹配：检查关键词是否等于消息字符串的第一个单词
        words = message_str.split()
        if not words:
            return None
        return next((k for k in self.meme_keywords if k == words[0]), None)

    async def get_all_keywords(self) -> List[str]:
        """获取所有关键词"""
        await self._ensure_templates_loaded()
        return self.meme_keywords.copy()

    async def get_all_memes(self) -> List[Meme]:
        """获取所有表情包模板"""
        await self._ensure_templates_loaded()
        return self.memes.copy()

    async def keyword_exists(self, keyword: str) -> bool:
        """检查关键词是否存在"""
        await self._ensure_templates_loaded()
        return keyword in self.meme_keywords
