#!/bin/bash
echo "=== AstrBot package config files ==="
ls -la /root/lezskabot/AstrBot/pyproject.toml /root/lezskabot/AstrBot/setup.py /root/lezskabot/AstrBot/setup.cfg 2>&1
echo ""
echo "=== AstrBot/egg-info ==="
find /root/lezskabot/AstrBot -maxdepth 2 -name "*.egg-info" -o -name "*.dist-info" 2>/dev/null | head -10
echo ""
echo "=== check Python path from inside /root/lezskabot/AstrBot ==="
cd /root/lezskabot/AstrBot
source venv/bin/activate
python -c "
import sys
print('cwd:', __import__('os').getcwd())
print('sys.path:')
for p in sys.path:
    print(' ', p)
import os
print('AstrBot/__init__.py exists:', os.path.exists('__init__.py'))
print('AstrBot dir contents (top 20):', sorted(os.listdir('.'))[:20])
"
echo ""
echo "=== SCREEN astr cmdline (try another way) ==="
ls /run/screen/S-root/ 2>&1
ls /tmp/.X11-unix/ 2>&1
cat /proc/2663406/cmdline 2>&1 | tr '\0' ' '
echo ""
ls /proc/*/cmdline 2>/dev/null | xargs grep -l "main.py" 2>/dev/null | head -5
