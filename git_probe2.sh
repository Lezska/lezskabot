#!/bin/bash
cd /root/lezskabot
echo "=== git log --oneline (last 8) ==="
git log --oneline -8
echo ""
echo "=== git show --stat HEAD ==="
git show --stat HEAD | head -20
echo ""
echo "=== git status --short (head 15) ==="
git status --short | head -15
echo ""
echo "=== Are P0+P1 + P3 files in HEAD? ==="
echo "--- HEAD: connection_manager.py def transaction ---"
git show HEAD:astrbot_plugin_fishing/core/database/connection_manager.py 2>/dev/null | grep -c "def transaction" || echo "NOT_FOUND"
echo "--- HEAD: reset_fishing_cooldown_effect.py async def apply ---"
git show HEAD:astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py 2>/dev/null | grep -c "async def apply" || echo "NOT_FOUND"
echo "--- HEAD: inventory_handlers.py await use_item ---"
git show HEAD:astrbot_plugin_fishing/handlers/inventory_handlers.py 2>/dev/null | grep -c "await.*use_item" || echo "NOT_FOUND"
