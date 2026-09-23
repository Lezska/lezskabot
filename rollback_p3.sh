#!/bin/bash
set -e
P='/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing'
cd /root/lezskabot

echo "=== backup pre-rollback state ==="
mkdir -p /root/lezskabot/backups/fishing_p3_rollback_$(date +%H%M)
cp -v "$P/core/database/connection_manager.py" /root/lezskabot/backups/fishing_p3_rollback_$(date +%H%M)/ 2>&1
echo ""

echo "=== restore connection_manager.py to HEAD (pre-P3, post-P0+P1) ==="
git checkout HEAD -- "$P/core/database/connection_manager.py"
echo ""

echo "=== verify rollback ==="
echo "  def transaction in cm: $(grep -c "def transaction" "$P/core/database/connection_manager.py")"
echo "  _ProxyConn in cm: $(grep -c "_ProxyConn" "$P/core/database/connection_manager.py")"
echo "  async def apply in effect: $(grep -c "async def apply" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo "  conn_mgr.transaction in effect: $(grep -c "conn_mgr.transaction" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo ""

echo "=== reload plugin ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""

echo "=== sleep 3s ==="
sleep 3
echo "=== status ==="
curl -s http://127.0.0.1:6185/api/v1/plugins \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  | /root/lezskabot/AstrBot/venv/bin/python -c "
import sys, json
d = json.load(sys.stdin)
for p in d.get('data', []):
    if 'fishing' in p.get('name','').lower() or 'fishing' in p.get('path','').lower():
        print(f\"  {p.get('name')}: status={p.get('status')} version={p.get('version')}\")
"
