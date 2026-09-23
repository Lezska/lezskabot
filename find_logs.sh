#!/bin/bash
# Find AstrBot logs for /使用 D3 99 command timing
echo "=== AstrBot log files ==="
find /root/lezskabot/AstrBot -name "*.log" 2>/dev/null | head -10
echo ""
echo "=== /root/lezskabot/AstrBot/data/logs ==="
ls -la /root/lezskabot/AstrBot/data/logs 2>/dev/null | head -10
echo ""
echo "=== SCREEN astr output (last 100 lines) ==="
ls /tmp/screens/ 2>/dev/null
find /tmp -name "astr*log*" 2>/dev/null
echo ""
echo "=== SCREEN capture ==="
which screen && screen -S astr -X hardcopy /tmp/astr_screen.txt 2>&1
ls -la /tmp/astr_screen.txt 2>&1
