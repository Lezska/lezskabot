#!/bin/bash
echo "=== venv site-packages, astrbot? ==="
ls /root/lezskabot/AstrBot/venv/lib/python3.12/site-packages/ | grep -i astrbot
echo ""
echo "=== find any 'astrbot' in venv ==="
find /root/lezskabot/AstrBot/venv -name "astrbot*" -maxdepth 5 2>/dev/null | head -10
echo ""
echo "=== venv python info ==="
/root/lezskabot/AstrBot/venv/bin/python -c "import sys; print(sys.path); import astrbot; print('astrbot at:', astrbot.__file__)" 2>&1 | head -20
echo ""
echo "=== venv check editable install? ==="
ls /root/lezskabot/AstrBot/venv/lib/python3.12/site-packages/ | grep -E "egg-link|\.pth|easy-install" 2>/dev/null | head -10
find /root/lezskabot/AstrBot/venv -name "*.pth" 2>/dev/null | head -10
echo ""
echo "=== how AstrBot 7/18 was actually started (check process cmdline) ==="
cat /proc/2663407/cmdline 2>&1 | tr '\0' ' '
echo ""
cat /proc/2663407/environ 2>&1 | tr '\0' '\n' | grep -i path | head -5
