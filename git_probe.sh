#!/bin/bash
cd /root/lezskabot
echo "=== git log (last 5) ==="
git log --oneline -5
echo ""
echo "=== git status (short) ==="
git status --short
echo ""
echo "=== git diff stat HEAD ==="
git diff --stat HEAD
echo ""
echo "=== HEAD reset_fishing_cooldown_effect.py signature ==="
git show HEAD:astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py 2>/dev/null | grep -n "def apply"
echo ""
echo "=== HEAD connection_manager.py has _ProxyConn? ==="
git show HEAD:astrbot_plugin_fishing/core/database/connection_manager.py 2>/dev/null | grep -n "_ProxyConn\|transaction\|def _in_transaction" | head -5
echo ""
echo "=== working reset_fishing_cooldown_effect.py signature ==="
grep -n "def apply" /root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py
echo ""
echo "=== working connection_manager.py has _ProxyConn? ==="
grep -n "_ProxyConn\|def transaction\|def _in_transaction" /root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing/core/database/connection_manager.py | head -5
