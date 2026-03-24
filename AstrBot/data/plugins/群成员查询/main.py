import json
from typing import List, Dict, Any, AsyncGenerator, Optional
from astrbot.api.event import filter, AstrMessageEvent, MessageEventResult
from astrbot.api.star import Context, Star, register
from astrbot.api import logger, AstrBotConfig
from astrbot.core.platform.sources.aiocqhttp.aiocqhttp_message_event import AiocqhttpMessageEvent
import time

class GroupMemberTool(Star):
    """
    AstrBot 群成员信息获取插件
    """
    def __init__(self, context: Context, config: AstrBotConfig = None):
        """插件初始化"""
        super().__init__(context)
        logger.info("群成员查询插件已加载。帮助命令塞了点私货，可以自己到/AstrBot/data/plugins/astrbot_plugin_GroupMemberQuery文件夹修改main文件删除")

    @filter.llm_tool(name="get_group_members_info")
    async def get_group_members(self, event: AstrMessageEvent) -> str:
        """
        获取QQ群成员信息的LLM工具。
        需要判断是否为群聊时，以及当需要知道群里有哪些人，或者需要获取他们的昵称和用户ID，
        或者需要知道群里是否有特定成员时，调用此工具。其中display_name是“群昵称”，username是用户“QQ名”
        获取数据之后需要联系上下文，用符合prompt的方式回答用户的问题。
        """
        start_time = time.time()
        
        try:
            group_id = event.get_group_id()
            if not group_id:
                logger.info("用户在非群聊环境中调用群成员查询工具")
                return json.dumps({"error": "这不是群聊"})
            
            if not isinstance(event, AiocqhttpMessageEvent):
                logger.info(f"不支持的平台: {event.get_platform_name()}")
                return json.dumps({"error": f"此功能仅支持QQ群聊(aiocqhttp平台)，当前平台为 {event.get_platform_name()}"})

            # 从API获取
            members_info = await self._get_group_members_internal(event)
            if not members_info:
                logger.info(f"无法获取群 {group_id} 的成员信息")
                return json.dumps({"error": "获取群成员信息失败，可能是权限不足或网络问题"})
            
            processed_members = [
                {
                    "user_id": str(member.get("user_id", "")),
                    "display_name": member.get("card") or member.get("nickname") or f"用户{member.get('user_id')}",
                    "username": member.get("nickname") or f"用户{member.get('user_id')}",  # 新增：用户的QQ昵称
                    "role": member.get("role", "member")
                }
                for member in members_info if member.get("user_id")
            ]
            
            group_info = {
                "group_id": group_id,
                "member_count": len(processed_members),
                "members": processed_members
            }
            
            elapsed_time = time.time() - start_time
            logger.info(f"成功获取群 {group_id} 的 {len(processed_members)} 名成员信息，耗时 {elapsed_time:.2f}s")
            
            return json.dumps(group_info, ensure_ascii=False, indent=2)
        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.info(f"获取群成员信息时发生错误: {e}，耗时 {elapsed_time:.2f}s")
            return json.dumps({"error": f"获取群成员信息时发生内部错误: {str(e)}"})

    async def _get_group_members_internal(self, event: AiocqhttpMessageEvent) -> Optional[List[Dict[str, Any]]]:
        """
        内部函数，用于调用API获取群成员列表
        
        Args:
            event: AiocqhttpMessageEvent实例
            
        Returns:
            群成员列表，失败时返回None
        """
        try:
            group_id = event.get_group_id()
            if not group_id:
                return None

            client = event.bot
            params = {"group_id": group_id}
            return await client.api.call_action('get_group_member_list', **params)
        except Exception as e:
            logger.info(f"API调用失败: {e}")
            return None

    @filter.command("测试群成员", alias={"test_members"})
    async def test_group_members(self, event: AstrMessageEvent) -> AsyncGenerator[MessageEventResult, None]:
        """测试指令：手动触发群成员查询并显示格式化结果（限制显示前300个成员）"""
        if not event.get_group_id():
            yield event.plain_result("此指令仅在群聊中可用")
            return
        start_time = time.time()

        logger.info("手动触发群成员查询测试")
        result_str = await self.get_group_members(event)
        
        try:
            result_data = json.loads(result_str)
            if "error" in result_data:
                yield event.plain_result(f"查询失败: {result_data['error']}")
                return
            
            members = result_data.get("members", [])
            if not members:
                yield event.plain_result("群成员列表为空")
                return
            
            # 限制显示数量，避免消息过长
            display_limit = 300
            display_members = members[:display_limit]
            elapsed_time = time.time() - start_time

            # 格式化输出：群昵称(用户名)(userid)[身份]
            formatted_members = []
            for member in display_members:
                display_name = member.get("display_name", "未知")
                username = member.get("username", "未知")  # 新增：显示用户名
                user_id = member.get("user_id", "未知")
                role = member.get("role", "member")
                
                # 角色中文化
                role_map = {
                    "owner": "群主",
                    "admin": "管理", 
                    "member": "成员"
                }
                role_cn = role_map.get(role, role)
                
                formatted_members.append(f"{display_name}({username})({user_id})[{role_cn}]")
            
            # 构建结果消息
            result_text = f"该命令仅用于测试工具可用性\n工具调用耗时 {elapsed_time:.2f}s\n\n群成员信息 (共{len(members)}人，显示前{len(display_members)}人):\n" + "\n".join(formatted_members)
            
            if len(members) > display_limit:
                result_text += f"\n\n注：群成员过多，仅显示前{display_limit}人。该命令仅用于测试工具可用性\n工具调用耗时 {elapsed_time:.2f}s"
            
            yield event.plain_result(result_text)
            
        except json.JSONDecodeError:
            yield event.plain_result(f"数据解析失败，原始数据：\n{result_str}")

    @filter.command("群成员帮助")
    async def help_command(self, event: AstrMessageEvent) -> AsyncGenerator[MessageEventResult, None]:
        """显示插件帮助信息"""
        help_text = """===Astrbot 群成员插件===\nv0.1.0 by 糯米茨(3218444911)\n\n- 当你询问"群里有哪些人"、"这个群有多少成员"等问题时，LLM会自动调用此工具\n- 工具会返回群成员的信息数组（包括群昵称、用户名、QQ号）\n- 目前仅支持QQ群聊使用\n\n可用命令：\n- 测试群成员：手动调用工具查看格式化的成员列表"""
        yield event.plain_result(help_text)

    async def terminate(self) -> None:
        """插件卸载时调用"""
        logger.info("群成员查询插件已卸载")
