#!/bin/bash
echo "=== all main.py in AstrBot/ (excluding builtin_stars) ==="
find /root/lezskabot/AstrBot -name "main.py" -not -path "*/data/*" -not -path "*/__pycache__/*" 2>/dev/null
echo ""
echo "=== try the framework entry: python -m astrbot ==="
cd /root/lezskabot
source AstrBot/venv/bin/activate
# Add AstrBot/ to PYTHONPATH
export PYTHONPATH=/root/lezskabot/AstrBot:$PYTHONPATH
timeout 5 python -c "import astrbot; print('astrbot pkg:', astrbot.__file__)" 2>&1 | head -5
echo ""
echo "=== try with -m astrbot.cli ==="
cd /root/lezskabot/AstrBot
source venv/bin/activate
export PYTHONPATH=/root/lezskabot/AstrBot
timeout 5 python -m astrbot.cli 2>&1 | head -5
echo ""
echo "=== check if AstrBot/main.py had different content when 2663407 started ==="
# look for any other copy of AstrBot/main.py
find /root /tmp /opt -name "main.py" -path "*astr*" 2>/dev/null | head -10
