#!/bin/bash
set -e
echo "=== reload ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
echo "=== sleep 4s ==="
sleep 4
echo "=== ps after reload ==="
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== e2e speedtest ==="
cd /root/lezskabot/AstrBot
source venv/bin/activate
python /tmp/speedtest_e2e.py 2>&1 | tail -50
