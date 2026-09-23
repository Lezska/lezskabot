#!/bin/bash
echo "=== find ANY __init__.py in lezskabot ==="
find /root/lezskabot -name "__init__.py" 2>/dev/null | head -20
echo ""
echo "=== find AstrBot/__init__.py with various names ==="
ls -la /root/lezskabot/AstrBot/__init* 2>&1
ls -la /root/lezskabot/AstrBot/__main__.py 2>&1
echo ""
echo "=== check what python sees when run from AstrBot dir ==="
cd /root/lezskabot/AstrBot
source venv/bin/activate
python -c "import sys; sys.path.insert(0, '.'); import main; print('ok, file:', main.__file__)" 2>&1 | head -5
echo ""
echo "=== try python -m AstrBot.main ==="
python -m AstrBot.main 2>&1 | head -5
echo ""
echo "=== try with cd parent then python -m AstrBot.main ==="
cd /root/lezskabot
source AstrBot/venv/bin/activate
timeout 5 python -m AstrBot.main 2>&1 | head -10
