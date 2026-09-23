#!/bin/bash
set -e
P='/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing'
echo "=== verify working tree ==="
echo "  async def apply: $(grep -c "async def apply" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo "  conn_mgr.transaction: $(grep -c "conn_mgr.transaction" "$P/core/services/item_effects/reset_fishing_cooldown_effect.py")"
echo "  def transaction in cm: $(grep -c "def transaction" "$P/core/database/connection_manager.py")"
echo "  _ProxyConn in cm: $(grep -c "_ProxyConn" "$P/core/database/connection_manager.py")"
echo "  await use_item in handlers: $(grep -c "await.*use_item" "$P/handlers/inventory_handlers.py")"
echo "  asyncio in inventory_service: $(grep -c "^import asyncio" "$P/core/services/inventory_service.py")"
echo ""

echo "=== reload plugin ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
echo "=== sleep 3s for reload ==="
sleep 3
echo "=== check plugin list status ==="
curl -s http://127.0.0.1:6185/api/v1/plugins \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  | python -c "
import sys, json
d = json.load(sys.stdin)
for p in d.get('data', []):
    if 'fishing' in p.get('name', '').lower() or 'fishing' in p.get('path', '').lower():
        print(f\"  {p.get('name')}: status={p.get('status')} version={p.get('version')}\")
"
echo ""
echo "=== run e2e speedtest ==="
cd /root/lezskabot/AstrBot
source venv/bin/activate
python /tmp/speedtest_e2e.py 2>&1 | tail -40
