#!/bin/bash
echo "=== AstrBot repo has main.py? ==="
ls -la /root/lezskabot/AstrBot/main.py /root/lezskabot/AstrBot/astrbot/main.py /root/lezskabot/AstrBot/astrbot/__main__.py /root/lezskabot/AstrBot/astrbot/cli/main.py 2>&1
echo ""
echo "=== check for a Docker/setup-image snapshot of original main.py ==="
find /root/lezskabot -name "main.py" -not -path "*/venv/*" -not -path "*/data/*" 2>/dev/null | head -10
echo ""
echo "=== git ls-tree of HEAD: is AstrBot/ tracked? ==="
cd /root/lezskabot
git ls-tree HEAD -- AstrBot | head -20
echo ""
echo "=== git ls-tree of HEAD for the entire AstrBot/data ==="
git ls-tree HEAD -- AstrBot/data | head -5
echo ""
echo "=== git ls-tree -- AstrBot/data/plugins/astrbot_plugin_fishing ==="
git ls-tree HEAD -- AstrBot/data/plugins/astrbot_plugin_fishing | head -10
echo ""
echo "=== initial commit content of AstrBot ==="
git show 5ca530b --stat | head -20
