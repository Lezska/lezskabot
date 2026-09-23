#!/bin/bash
echo "=== find __init__.py in AstrBot ==="
find /root/lezskabot/AstrBot -maxdepth 3 -name "__init__.py" 2>/dev/null | head -20
echo ""
echo "=== AstrBot dir structure ==="
ls -la /root/lezskabot/AstrBot/ | head -20
echo ""
echo "=== /root/lezskabot git log -- oneline for AstrBot/main.py history ==="
cd /root/lezskabot
git log --all --diff-filter=AMD --pretty=format:"%h %s" -- AstrBot/main.py 2>&1 | head -10
echo ""
echo "=== how AstrBot 7/18 was launched: SCREEN command file ==="
ls -la /root/lezskabot/*.sh 2>&1 | head -10
find /root/lezskabot -name "start*.sh" 2>/dev/null | head -10
