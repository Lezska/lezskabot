import asyncio
from typing import Dict, Any, Optional
from collections import defaultdict

from astrbot.api import logger

from .abstract_effect import AbstractItemEffect
from ...domain.models import User, Item


class ResetFishingCooldownEffect(AbstractItemEffect):
    effect_type = "RESET_FISHING_COOLDOWN"

    def __init__(
        self,
        user_repo: Optional[Any] = None,
        buff_repo: Optional[Any] = None,
        fishing_service=None,
        **kwargs,
    ):
        """
        构造函数，用于依赖注入。
        """
        super().__init__(user_repo, buff_repo, **kwargs)
        self.fishing_service = fishing_service
        if not self.fishing_service:
            raise ValueError("ResetFishingCooldownEffect requires fishing_service dependency")

    async def apply(
        self, user: User, item_template: Item, payload: Dict[str, Any], quantity: int = 1
    ) -> Dict[str, Any]:
        # 检查最大使用量限制
        if quantity > 99:
            return {
                "success": False,
                "message": f"【{item_template.name}】一次最多只能使用 99 个。",
            }

        # go_fish 是同步阻塞 SQL 调用, 必须放进线程池, 否则 quantity=99
        # 时会在主 event loop 串行跑 ~3-8s, 期间整个 AstrBot 不响应任何事件.
        async def _go_fish_async() -> Dict[str, Any]:
            return await asyncio.to_thread(self.fishing_service.go_fish, user.user_id)

        # 单次使用: 直接执行钓鱼并返回详细结果
        if quantity == 1:
            result = await _go_fish_async()
            if not result or not result.get("success"):
                return {
                    "success": False,
                    "message": result.get("message", "钓鱼失败") if result else "钓鱼失败",
                }

            # 获取钓鱼成本
            inventory_repo = self.fishing_service.inventory_repo
            zone = await asyncio.to_thread(
                inventory_repo.get_zone_by_id, user.fishing_zone_id
            )
            fishing_cost = zone.fishing_cost if zone else 10

            # 构建单次钓鱼消息
            fish = result["fish"]
            quality_display = ""
            if fish.get("quality_level") == 1:
                quality_display = " ✨高品质"

            message = (
                f"🎣 恭喜你钓到了: {fish['name']}{quality_display}\n"
                f"✨稀有度: {'★' * fish['rarity']} \n"
                f"⚖️重量: {fish['weight']} 克\n"
                f"💰价值: {fish['value']} 金币\n"
                f"💸消耗: {fishing_cost} 金币/次"
            )
            if "equipment_broken_messages" in result:
                for broken_msg in result["equipment_broken_messages"]:
                    message += f"\n{broken_msg}"

            return {"success": True, "message": message}

        # 批量使用: 逐次执行 go_fish, 每次 await sleep(0) 让 event loop 喘气,
        # 期间其他消息/心跳/平台适配器事件能插队处理, AstrBot 不再卡死.
        results = []
        success_count = 0
        fail_count = 0
        fish_stats = defaultdict(int)  # key: (fish_name, quality_level), value: count
        equipment_broken_messages = []

        for i in range(quantity):
            result = await _go_fish_async()
            if result and result.get("success"):
                success_count += 1
                fish = result["fish"]
                fish_name = fish["name"]
                quality_level = fish.get("quality_level", 0)
                fish_stats[(fish_name, quality_level)] += 1

                # 收集装备损坏消息
                if "equipment_broken_messages" in result:
                    equipment_broken_messages.extend(result["equipment_broken_messages"])
            else:
                fail_count += 1
            results.append(result)

            # 关键: 每跑一次 go_fish 就让 event loop 跑一轮, 其他 handler / 心跳
            # / aiocqhttp 事件能插队, 不再单线程串行阻塞.
            await asyncio.sleep(0)

        # 如果全部失败
        if success_count == 0:
            if fail_count > 0 and results[0]:
                error_msg = results[0].get("message", "钓鱼失败")
            else:
                error_msg = "所有钓鱼尝试均失败"
            return {
                "success": False,
                "message": f"使用 {quantity} 个【{item_template.name}】, {error_msg}",
            }

        # 构建汇总消息
        fish_details = []
        for (fish_name, quality_level), count in sorted(fish_stats.items()):
            if quality_level == 1:
                fish_details.append(f"{fish_name}(✨高品质) x{count}")
            else:
                fish_details.append(f"{fish_name} x{count}")

        message = f"使用{item_template.name} x{quantity}, 成功钓鱼 {success_count} 次"
        if fail_count > 0:
            message += f", 失败 {fail_count} 次"
        message += "。\n钓到: "
        message += "，".join(fish_details)

        # 添加装备损坏消息(去重)
        unique_broken_messages = list(set(equipment_broken_messages))
        if unique_broken_messages:
            message += "\n" + "\n".join(unique_broken_messages)

        return {"success": True, "message": message}
