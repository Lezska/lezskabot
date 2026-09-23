#!/bin/bash
set -e
echo "=== 1. backup AstrBot/main.py (just in case) ==="
mv /root/lezskabot/AstrBot/main.py /root/lezskabot/AstrBot/main.py.covered_by_a1_20260726.bak
ls -la /root/lezskabot/AstrBot/main.py* 2>&1
echo ""

echo "=== 2. ensure no AstrBot running ==="
pkill -f "python main.py" 2>/dev/null || true
pkill -f "astrbot.cli" 2>/dev/null || true
sleep 2
ps -ef | grep -E "python.*main.py|astrbot" | grep -v grep || echo "  (none)"
echo ""

echo "=== 3. start AstrBot via CLI ==="
cd /root/lezskabot/AstrBot
rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal
# Use the framework CLI entry instead of AstrBot/main.py
PYTHONPATH=/root/lezskabot/AstrBot screen -dmS astr bash -c "
    cd '/root/lezskabot/AstrBot' &&
    rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal &&
    source venv/bin/activate &&
    export PYTHONPATH=/root/lezskabot/AstrBot &&
    python -m astrbot.cli run
"
echo "  started"
echo ""

echo "=== 4. sleep 15s for AstrBot boot ==="
sleep 15

echo "=== 5. ps check ==="
ps -ef | grep -E "python.*astrbot|python.*main.py" | grep -v grep

echo ""
echo "=== 6. plugin list check ==="
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
