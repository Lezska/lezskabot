#!/bin/bash
echo "=== before reload: ps ==="
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== reload plugin ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
echo "=== sleep 4s for reload ==="
sleep 4
echo "=== after reload: ps ==="
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== after reload: plugin list ==="
curl -s http://127.0.0.1:6185/api/v1/plugins \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  | /root/lezskabot/AstrBot/venv/bin/python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for p in d.get('data', []):
        if 'fishing' in p.get('name','').lower() or 'fishing' in p.get('path','').lower():
            print(f\"  {p.get('name')}: status={p.get('status')} version={p.get('version')}\")
except Exception as e:
    print('json parse err:', e)
"
