#!/bin/bash
echo "=== check main.py is in git status ==="
cd /root/lezskabot
git status --short -- AstrBot/data/plugins/astrbot_plugin_fishing/main.py
echo ""
echo "=== HEAD main.py has A1 conn_mgr injection? ==="
git show HEAD:AstrBot/data/plugins/astrbot_plugin_fishing/main.py | grep -c "self._conn_mgr"
echo ""
echo "=== working main.py has A1 conn_mgr injection? ==="
grep -c "self._conn_mgr" AstrBot/data/plugins/astrbot_plugin_fishing/main.py
echo ""
echo "=== working main.py line 263-285 ==="
sed -n '263,285p' AstrBot/data/plugins/astrbot_plugin_fishing/main.py
