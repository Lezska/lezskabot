#!/bin/bash
sleep 10
echo "=== ps after 25s total ==="
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== plugin list ==="
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
    else:
        print('  unexpected json:', d)
except Exception as e:
    print('  err:', e)
"
echo ""
echo "=== verify A1 code is in fishing plugin files ==="
P=/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing
echo "  async def apply: $(grep -c "async def apply" $P/core/services/item_effects/reset_fishing_cooldown_effect.py)"
echo "  conn_mgr.transaction: $(grep -c "conn_mgr.transaction" $P/core/services/item_effects/reset_fishing_cooldown_effect.py)"
echo "  def transaction in cm: $(grep -c "def transaction" $P/core/database/connection_manager.py)"
echo "  _ProxyConn in cm: $(grep -c "_ProxyConn" $P/core/database/connection_manager.py)"
echo "  conn_mgr arg in user_repo: $(grep -c "conn_mgr" $P/core/repositories/sqlite_user_repo.py)"
