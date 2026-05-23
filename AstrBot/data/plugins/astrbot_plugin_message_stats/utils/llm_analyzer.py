"""
LLM 发言头衔分析模块

通过 AstrBot 内置的 Provider 系统调用 LLM，
根据群成员的发言统计数据，使用 LLM 为每个成员生成个性化头衔。

在定时推送排行榜前调用，生成的头衔会嵌入到排行榜图片中。
"""

import json
import re
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from datetime import date as date_cls

from astrbot.api import logger as astrbot_logger

from .models import UserData


# 默认的系统提示词
DEFAULT_SYSTEM_PROMPT = """你是一个擅长给群成员起有趣头衔的群聊分析师，也是一个配色大师。
请根据以下群成员的发言统计数据，为每个成员生成一个富有创意、幽默且贴合其发言风格的头衔，并为每个头衔搭配一个合适的颜色。

要求：
1. 头衔要简短（不超过6个汉字），朗朗上口
2. 结合数据特征（发言总数、排名、活跃天数等）进行创意发挥
3. 风格可以多样：霸气、搞怪、吐槽、中二均可
4. 不要使用侮辱性词汇
5. 对发言最多的前3名给出更夸张、更酷的头衔
6. 为每个头衔搭配一个颜色，颜色要契合头衔的气质含义，例如：红色（#EF4444）代表热情霸气，蓝色（#3B82F6）代表沉稳冷静，紫色（#8B5CF6）代表神秘高贵，绿色（#22C55E）代表生机活力，橙色（#F97316）代表欢乐活泼，粉色（#EC4899）代表可爱温柔，青色（#06B6D4）代表清新灵动

请严格按照以下JSON格式返回，不要包含任何其他内容：
```json
{
  "titles": {
    "用户ID_1": {
      "title": "头衔1",
      "color": "#3B82F6"
    },
    "用户ID_2": {
      "title": "头衔2",
      "color": "#EF4444"
    }
  }
}
```"""


class LLMAnalyzer:
    """LLM 发言头衔分析器

    通过 AstrBot 内置 Provider 系统调用 LLM，
    根据群成员的发言统计数据生成个性化头衔。

    Attributes:
        context: AstrBot上下文对象
        provider_id (str): 指定的 LLM Provider ID（为空则使用默认）
        system_prompt (str): 系统提示词
        max_retries (int): 重试次数
        logger: 日志记录器
    """

    # ---------- 并发控制（优化B） ----------
    _global_semaphore = asyncio.Semaphore(3)  # 最多3个并发 LLM 请求
    _total_concurrent = 0

    def __init__(
        self,
        context,
        provider_id: str = "",
        system_prompt: str = "",
        max_retries: int = 2,
    ):
        """初始化 LLM 分析器

        Args:
            context: AstrBot上下文对象
            provider_id (str): Provider ID，留空则使用默认
            system_prompt (str): 系统提示词，留空使用默认
            max_retries (int): 重试次数
        """
        self.context = context
        self.provider_id = provider_id
        self.system_prompt = system_prompt.strip() or DEFAULT_SYSTEM_PROMPT
        self.max_retries = max_retries
        self.logger = astrbot_logger
        # 记录上一次调用的 token 用量
        self.last_token_usage: Dict[str, int] = {}

    async def analyze_users(
        self,
        group_data: List[UserData],
        group_name: str = "",
        min_daily_messages: int = 0,
    ) -> Tuple[Dict[str, str], Dict[str, int]]:
        """分析群成员数据，生成头衔

        构建描述所有用户的提示词，调用 LLM 批量生成头衔。
        支持通过 min_daily_messages 过滤今日发言不足的用户。

        Args:
            group_data (List[UserData]): 群成员数据列表
            group_name (str): 群组名称
            min_daily_messages (int): 每日发言最小值，低于此值的用户跳过分析

        Returns:
            Tuple[Dict[str, str], Dict[str, int]]: (用户ID到头衔的映射, token用量统计)
        """
        self.last_token_usage = {}
        if not group_data:
            return {}, {}

        # 过滤掉 0 发言的用户
        active_users = [u for u in group_data if u.message_count > 0]
        if not active_users:
            return {}, {}

        # 如果设置了 min_daily_messages，进一步过滤今日发言不足的用户
        today_str = str(date_cls.today())
        if min_daily_messages > 0:
            filtered_users = []
            for u in active_users:
                daily_count = u._message_dates.get(today_str, 0) if hasattr(u, '_message_dates') and u._message_dates else 0
                if daily_count >= min_daily_messages:
                    filtered_users.append(u)
            if filtered_users:
                self.logger.info(
                    f"每日发言阈值 {min_daily_messages}，过滤后 {len(filtered_users)}/{len(active_users)} 个用户参与分析"
                )
                active_users = filtered_users
            else:
                self.logger.warning(
                    f"每日发言阈值 {min_daily_messages} 过高，没有用户达到条件，跳过LLM分析"
                )
                return {}, {}

        # 按发言数降序排序
        sorted_users = sorted(active_users, key=lambda x: x.message_count, reverse=True)

        # 构建用户数据描述
        user_descriptions = []
        total_all = sum(u.message_count for u in active_users)
        for rank, user in enumerate(sorted_users, 1):
            active_days = len(user._message_dates) if hasattr(user, '_message_dates') and user._message_dates else 0
            percentage = (user.message_count / total_all * 100) if total_all > 0 else 0
            last_date = user.last_date or "未知"

            desc = (
                f"用户数据：\n"
                f"- 用户ID：{user.user_id}\n"
                f"- 昵称：{user.nickname or f'用户{user.user_id}'}\n"
                f"- 总发言数：{user.message_count} 次\n"
                f"- 群内排名：第 {rank} 名\n"
                f"- 活跃天数：{active_days} 天\n"
                f"- 占比：{percentage:.1f}%\n"
                f"- 最后发言：{last_date}"
            )
            user_descriptions.append(desc)

        # 构建完整提示词（强调必须用用户ID）
        prompt = (
            f"以下是「{group_name}」群聊的群成员发言统计数据：\n\n"
            + "\n\n".join(user_descriptions)
            + "\n\n请为这些群成员生成头衔。"
            + "\n\n注意：JSON 中的 key 必须使用用户ID（如" + sorted_users[0].user_id + "），而不是昵称！"
        )

        # 调用 LLM 并重试
        last_error = None
        for attempt in range(1 + self.max_retries):
            try:
                result, token_usage = await self._call_llm(prompt)
                self.last_token_usage = token_usage
                if result:
                    titles = self._parse_titles(result, sorted_users)
                    if titles:
                        self.logger.info(
                            f"✅ LLM 头衔生成成功: 为 {len(titles)}/{len(sorted_users)} 个用户生成了头衔"
                        )
                        return titles, token_usage
                    else:
                        self.logger.warning(f"⚠️ LLM 返回解析失败，尝试第 {attempt + 1} 次")
                else:
                    self.logger.warning(f"⚠️ LLM 返回为空，尝试第 {attempt + 1} 次")
            except Exception as e:
                last_error = e
                self.logger.warning(f"⚠️ LLM 调用失败(第{attempt + 1}次): {e}")
                if attempt < self.max_retries:
                    await asyncio.sleep(2 * (attempt + 1))

        if last_error:
            self.logger.error(f"❌ LLM 头衔生成失败(已重试{self.max_retries}次): {last_error}")
        else:
            self.logger.error("❌ LLM 头衔生成失败: 无法解析返回值")
        return {}, self.last_token_usage

    async def _call_llm(self, prompt: str) -> Tuple[Optional[str], Dict[str, int]]:
        """通过 AstrBot Provider 调用 LLM（带并发控制）

        使用 context.llm_generate() 调用 AstrBot 已配置的 LLM。
        通过类级别 Semaphore 限制最多 3 个并发请求。

        Args:
            prompt (str): 发送给 LLM 的提示词

        Returns:
            Tuple[Optional[str], Dict[str, int]]: (LLM返回文本, token用量统计)
        """
        token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        
        # 并发控制：获取信号量，最多3个并发 LLM 请求
        async with self._global_semaphore:
            LLMAnalyzer._total_concurrent += 1
            if LLMAnalyzer._total_concurrent > 3:
                self.logger.info(f"⏳ LLM 并发数已达上限，排队等待中... (当前并发: {LLMAnalyzer._total_concurrent})")
            try:
                llm_kwargs = {
                    "prompt": prompt,
                    "system_prompt": self.system_prompt,
                }

                if self.provider_id and self.provider_id.strip():
                    try:
                        provider = self.context.get_provider_by_id(
                            provider_id=self.provider_id.strip()
                        )
                        if provider:
                            llm_kwargs["chat_provider_id"] = self.provider_id.strip()
                            self.logger.info(f"使用指定 Provider: {self.provider_id}")
                        else:
                            self.logger.warning(
                                f"指定的 Provider '{self.provider_id}' 不存在，使用默认 Provider"
                            )
                    except Exception as e:
                        self.logger.warning(
                            f"获取 Provider '{self.provider_id}' 失败: {e}，使用默认 Provider"
                        )

                self.logger.debug("调用 LLM generate...")
                resp = await self.context.llm_generate(**llm_kwargs)

                if resp is None:
                    self.logger.warning("LLM 返回 None")
                    return None, token_usage

                # 提取 token 用量
                if hasattr(resp, "usage") and resp.usage:
                    usage = resp.usage
                    if hasattr(usage, "total"):
                        token_usage["total_tokens"] = getattr(usage, "total", 0) or 0
                        token_usage["prompt_tokens"] = getattr(usage, "input", 0) or 0
                        token_usage["completion_tokens"] = getattr(usage, "output", 0) or 0

                # 从响应中提取文本
                if hasattr(resp, "completion_text"):
                    text = resp.completion_text
                elif hasattr(resp, "text"):
                    text = resp.text
                elif isinstance(resp, str):
                    text = resp
                else:
                    text = str(resp)

                text = text.strip()
                if text:
                    return text, token_usage

                self.logger.warning("LLM 返回文本为空")
                return None, token_usage

            except Exception as e:
                self.logger.error(f"LLM 调用异常: {e}")
                raise
            finally:
                LLMAnalyzer._total_concurrent -= 1

    def _parse_titles(
        self,
        llm_response: str,
        sorted_users: List[UserData],
    ) -> Dict[str, Dict[str, str]]:
        """解析 LLM 返回的 JSON，提取头衔和颜色

        LLM 可能返回昵称作为 key（如 {"艾米": "话唠"}）而不是 user_id，
        因此需要建立昵称 → user_id 的映射表进行回退匹配。

        支持多种 JSON 格式：
        - {"titles": {"user_id": {"title": "头衔", "color": "#xxx"}, ...}}  (推荐带颜色)
        - {"titles": {"user_id": "头衔", ...}}                               (兼容纯字符串)
        - {"昵称": "头衔", ...}                                              (LLM常见行为)
        - {"1": "头衔", "2": "头衔"}                                         (排名数字)

        Returns:
            Dict[str, dict]: {user_id: {"title": str, "color": str}}
        """
        json_str = llm_response
        json_pattern = r"```(?:json)?\s*\n?(.*?)\n?```"
        json_match = re.search(json_pattern, llm_response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1).strip()

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            brace_start = llm_response.find("{")
            brace_end = llm_response.rfind("}")
            if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
                try:
                    data = json.loads(llm_response[brace_start : brace_end + 1])
                except json.JSONDecodeError:
                    self.logger.error("无法从 LLM 返回中解析 JSON")
                    self.logger.debug(f"LLM 原始返回: {llm_response[:500]}")
                    return {}
            else:
                self.logger.error("LLM 返回中未找到 JSON 结构")
                return {}

        if not isinstance(data, dict):
            self.logger.error(f"LLM 返回数据格式错误: 期望 dict, 得到 {type(data)}")
            return {}

        titles_raw = data.get("titles", data)
        if not isinstance(titles_raw, dict):
            self.logger.error(f"titles 字段格式错误: 期望 dict, 得到 {type(titles_raw)}")
            return {}

        # 建立 昵称/user_id → user_id 的映射
        nickname_to_id = {}
        for u in sorted_users:
            nickname_to_id[u.nickname] = u.user_id
            nickname_to_id[u.user_id] = u.user_id

        # 兜底颜色列表
        DEFAULT_COLORS = ["#7C3AED", "#3B82F6", "#EF4444", "#22C55E", "#F97316", "#EC4899", "#06B6D4"]

        def _resolve_uid(key_str: str) -> Optional[str]:
            key_str = str(key_str).strip()
            if key_str in nickname_to_id:
                return nickname_to_id[key_str]
            if key_str.lstrip('-').isdigit() and sorted_users:
                try:
                    rank_idx = int(key_str) - 1
                    if 0 <= rank_idx < len(sorted_users):
                        return sorted_users[rank_idx].user_id
                except (ValueError, IndexError):
                    pass
            return None

        def _extract(raw_value, fallback_color: str) -> Optional[dict]:
            if isinstance(raw_value, dict):
                title = str(raw_value.get("title", "")).strip()
                color = str(raw_value.get("color", "")).strip()
                if not title:
                    return None
                if not re.match(r'^#[0-9a-fA-F]{6}$', color):
                    color = fallback_color
                return {"title": title, "color": color}
            elif isinstance(raw_value, str):
                title = raw_value.strip().strip('"').strip("'").strip("【】").strip("「」")
                if title:
                    return {"title": title, "color": fallback_color}
            return None

        result = {}
        color_idx = 0
        for key, raw_value in titles_raw.items():
            color = DEFAULT_COLORS[color_idx % len(DEFAULT_COLORS)]
            color_idx += 1
            parsed = _extract(raw_value, color)
            if not parsed:
                continue
            uid = _resolve_uid(key)
            if uid:
                result[uid] = parsed

        if not result:
            self.logger.warning("⚠️ _parse_titles 未能解析出任何头衔")
        return result
