#!/bin/bash
set -e
cd /root/lezskabot
P=AstrBot/data/plugins/astrbot_plugin_fishing
echo "=== backup A1 working tree first (safety) ==="
mkdir -p /root/lezskabot/backups/fishing_a1_$(date +%H%M)
for f in core/database/connection_manager.py core/repositories/sqlite_user_repo.py core/repositories/sqlite_log_repo.py core/repositories/sqlite_user_buff_repo.py core/repositories/sqlite_inventory_repo.py core/services/fishing_service.py core/services/item_effects/reset_fishing_cooldown_effect.py main.py; do
    cp -v $P/$f /root/lezskabot/backups/fishing_a1_$(date +%H%M)/$(basename $f)
done
echo ""

echo "=== git checkout HEAD to revert A1 (8 files) ==="
git checkout HEAD -- $P/core/database/connection_manager.py $P/core/repositories/sqlite_user_repo.py $P/core/repositories/sqlite_log_repo.py $P/core/repositories/sqlite_user_buff_repo.py $P/core/repositories/sqlite_inventory_repo.py $P/core/services/fishing_service.py $P/core/services/item_effects/reset_fishing_cooldown_effect.py $P/main.py
echo ""

echo "=== verify ==="
echo "  async def apply: $(grep -c "async def apply" $P/core/services/item_effects/reset_fishing_cooldown_effect.py)"
echo "  conn_mgr.transaction: $(grep -c "conn_mgr.transaction" $P/core/services/item_effects/reset_fishing_cooldown_effect.py)"
echo "  def transaction in cm: $(grep -c "def transaction" $P/core/database/connection_manager.py)"
echo "  self._conn_mgr in main.py: $(grep -c "self._conn_mgr" $P/main.py)"
echo "  conn_mgr arg in user_repo: $(grep -c "conn_mgr" $P/core/repositories/sqlite_user_repo.py)"
echo ""

echo "=== git status ==="
git status --short -- $P/core/database/connection_manager.py $P/core/repositories/sqlite_user_repo.py $P/core/repositories/sqlite_log_repo.py $P/core/repositories/sqlite_user_buff_repo.py $P/core/repositories/sqlite_inventory_repo.py $P/core/services/fishing_service.py $P/core/services/item_effects/reset_fishing_cooldown_effect.py $P/main.py
echo ""

echo "=== reload plugin ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
echo "=== sleep 3s ==="
sleep 3
echo "=== ps ==="
ps -ef | grep "python main.py" | grep -v grep
