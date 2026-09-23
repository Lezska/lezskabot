#!/bin/bash
cd /root/lezskabot/AstrBot
source venv/bin/activate
export PYTHONPATH=/root/lezskabot/AstrBot:$PYTHONPATH
echo "=== python -m astrbot.cli help ==="
timeout 5 python -m astrbot.cli --help 2>&1 | head -30
echo ""
echo "=== python -m astrbot.cli run --help ==="
timeout 5 python -m astrbot.cli run --help 2>&1 | head -30
