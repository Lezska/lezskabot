#!/bin/bash
cd /root/lezskabot/AstrBot
source venv/bin/activate
export PYTHONPATH=/root/lezskabot/AstrBot:$PYTHONPATH
echo "=== run python -m astrbot.cli run (5s timeout) ==="
timeout 5 python -m astrbot.cli run 2>&1 | head -40
