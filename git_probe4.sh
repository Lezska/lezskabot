#!/bin/bash
cd /root/lezskabot
echo "=== git show --stat c7e34bd ==="
git show c7e34bd --stat
echo ""
echo "=== git show c7e34bd -- core/services/item_effects/reset_fishing_cooldown_effect.py | head -60 ==="
git show c7e34bd -- AstrBot/data/plugins/astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py 2>/dev/null | head -60
