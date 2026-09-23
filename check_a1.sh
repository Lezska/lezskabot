#!/bin/bash
echo "=== A1 status on disk ==="
cd /root/lezskabot
P=AstrBot/data/plugins/astrbot_plugin_fishing
echo "  modified files (M):"
git status --short -- $P/core/database/connection_manager.py $P/core/repositories/sqlite_user_repo.py $P/core/repositories/sqlite_log_repo.py $P/core/repositories/sqlite_user_buff_repo.py $P/core/repositories/sqlite_inventory_repo.py $P/core/services/fishing_service.py $P/core/services/item_effects/reset_fishing_cooldown_effect.py $P/main.py
echo ""
echo "=== ps ==="
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== sign_in: is it in auto_sign loop? ==="
grep -n "sign_in\|auto_sign" $P/core/services/*.py 2>/dev/null | head -10
