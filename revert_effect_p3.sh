#!/bin/bash
set -e
P='/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing'
cd /root/lezskabot

# backup
mkdir -p /root/lezskabot/backups/fishing_p3_rollback_effect_$(date +%H%M)
cp -v "$P/core/services/item_effects/reset_fishing_cooldown_effect.py" /root/lezskabot/backups/fishing_p3_rollback_effect_$(date +%H%M)/ 2>&1
echo ""

# restore to HEAD (P0+P1 has async apply, no transaction batching)
git checkout HEAD -- "$P/core/services/item_effects/reset_fishing_cooldown_effect.py"
echo ""

echo "=== verify ==="
echo "  async def apply: $(grep -c "async def apply" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo "  conn_mgr.transaction: $(grep -c "conn_mgr.transaction" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo "  to_thread: $(grep -c "asyncio.to_thread" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo "  sleep(0): $(grep -c "asyncio.sleep" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo ""

echo "=== reload ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
