#!/bin/bash
set -e

echo "=== 1. kill old astr SCREEN session ==="
screen -S astr -X quit 2>&1 || echo "no astr session, ok"
sleep 2
ps -ef | grep "python main.py" | grep -v grep || echo "  (no python main.py)"

echo ""
echo "=== 2. start new astr SCREEN session ==="
cd /root/lezskabot/AstrBot
rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal
screen -dmS astr bash -c "cd '/root/lezskabot/AstrBot' && rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal && source venv/bin/activate && python main.py"
echo "  started"

echo ""
echo "=== 3. sleep 12s for AstrBot boot ==="
sleep 12

echo ""
echo "=== 4. ps check ==="
ps -ef | grep "python main.py" | grep -v grep

echo ""
echo "=== 5. plugin list check ==="
curl -s --max-time 10 http://127.0.0.1:6185/api/v1/plugins \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  | /root/lezskabot/AstrBot/venv/bin/python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for p in d.get('data', []):
        n = p.get('name', '').lower()
        path = p.get('path', '').lower()
        if 'fishing' in n or 'fishing' in path:
            print(f\"  {p.get('name')}: status={p.get('status')} version={p.get('version')}\")
except Exception as e:
    print('  err:', e)
"

echo ""
echo "=== 6. screen astr capture (last 30 lines) ==="
screen -S astr -X hardcopy /tmp/astr_screen2.txt 2>&1
wc -l /tmp/astr_screen2.txt 2>&1
