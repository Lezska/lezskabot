import unittest

from data.plugins.astrbot_plugin_message_stats.main import MessageStatsPlugin
from data.plugins.astrbot_plugin_message_stats.utils.models import (
    GroupInfo,
    PluginConfig,
    UserData,
)


class FakeEvent:
    """Provide the result method used by the rank renderer."""

    def plain_result(self, text: str):
        return ("plain", text)


class EmptyImageGenerator:
    """Simulate the safety decorator returning no image path."""

    async def generate_rank_image(self, *args, **kwargs):
        return None


class RankFallbackTest(unittest.IsolatedAsyncioTestCase):
    async def test_empty_image_path_falls_back_to_text(self):
        plugin = MessageStatsPlugin.__new__(MessageStatsPlugin)
        plugin.image_generator = EmptyImageGenerator()
        plugin._generate_text_message = lambda *args: "text fallback"
        plugin._schedule_file_cleanup = lambda *args: None

        users = [(UserData(user_id="1", nickname="tester", message_count=3), 3)]
        config = PluginConfig()
        results = [
            result
            async for result in plugin._render_rank_as_image(
                FakeEvent(),
                users,
                GroupInfo(group_id="10000", group_name="test"),
                "test rank",
                "1",
                config,
                None,
                None,
            )
        ]

        self.assertEqual(results, [("plain", "text fallback")])


if __name__ == "__main__":
    unittest.main()
