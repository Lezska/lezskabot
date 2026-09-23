#!/bin/bash
cd /root/lezskabot/AstrBot
source venv/bin/activate
echo "=== try run main.py directly (foreground, will hang) ==="
# run for 5s then kill
timeout 5 python main.py 2>&1 | head -30
echo ""
echo "=== exit code: $? ==="
