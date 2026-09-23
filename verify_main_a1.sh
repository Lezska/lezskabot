#!/bin/bash
echo "=== verify main.py has A1 conn_mgr injection now ==="
P=/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing
echo "  conn_mgr references: $(grep -c "self._conn_mgr" $P/main.py)"
echo "  self.fishing_service lines:"
sed -n '260,285p' $P/main.py
echo ""
echo "=== git status ==="
cd /root/lezskabot
git status --short -- $P/main.py
echo ""
echo "=== reload plugin ==="
curl -s -X POST http://127.0.0.1:6185/api/v1/plugins/reload \
  -H "Authorization: Bearer abk_DGkLHYxXTqLuqIgVl0Oee7rjohIyyye-ZVeDNhTNzuY" \
  -H "Content-Type: application/json" \
  -d '{"plugin_id":"astrbot_plugin_fishing_again"}'
echo ""
echo "=== sleep 3s ==="
sleep 3
echo "=== ps check ==="
ps -ef | grep "python main.py" | grep -v grep
