#!/bin/bash
cd /root/lezskabot/AstrBot
echo "=== Item class definition ==="
grep -n -A 20 "^class Item" data/plugins/astrbot_plugin_fishing/core/domain/models.py | head -40
echo ""
echo "=== effect apply signature ==="
grep -n "async def apply\|def apply" data/plugins/astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py
echo ""
echo "=== mtime check ==="
stat -c "%y %n" data/plugins/astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py data/plugins/astrbot_plugin_fishing/core/database/connection_manager.py
