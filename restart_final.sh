#!/bin/bash
set -e
echo "=== 1. kill old astr ==="
pkill -f "python main.py" 2>/dev/null || true
pkill -f "astrbot.cli" 2>/dev/null || true
sleep 3
ps -ef | grep "python main.py" | grep -v grep || echo "  (none)"
echo ""
echo "=== 2. start new astr ==="
cd /root/lezskabot/AstrBot
rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal
screen -dmS astr bash -c "cd '/root/lezskabot/AstrBot' && rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal && source venv/bin/activate && python main.py"
echo "  started"
sleep 18
echo ""
echo "=== 3. ps check ==="
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== 4. plugin list ==="
curl -s --max-time 10 http://127.0.0.1:6185/api/v1/plugins \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  | /root/lezskabot/AstrBot/venv/bin/python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if isinstance(d, dict):
        plugins = d.get('data', [])
        if not plugins and 'plugins' in d:
            plugins = d['plugins']
        print(f'total plugins: {len(plugins)}')
        for p in plugins:
            n = p.get('name', '').lower()
            if 'fishing' in n or 'fishing' in p.get('path','').lower():
                print(f\"  FISHING: {p.get('name')} status={p.get('status')} version={p.get('version')}\")
except Exception as e:
    print('  err:', e)
"
