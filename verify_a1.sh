#!/bin/bash
echo "=== check A1 code is in disk (already verified) ==="
P=/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing
echo "  reset_fishing_cooldown_effect.py lines 88-105:"
sed -n '88,105p' "$P/core/services/item_effects/reset_fishing_cooldown_effect.py"
echo ""
echo "=== AstrBot reload plugin via API ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
echo "=== sleep 3s ==="
sleep 3
echo "=== ps check ==="
ps -ef | grep "python main.py" | grep -v grep
