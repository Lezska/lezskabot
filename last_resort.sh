#!/bin/bash
echo "=== current state ==="
ls -la /root/lezskabot/AstrBot/main.py* 2>&1
echo ""
echo "=== try with __init__.py added (touches) to make relative import work ==="
touch /root/lezskabot/AstrBot/__init__.py
ls -la /root/lezskabot/AstrBot/__init__.py
echo ""
echo "=== try python main.py now ==="
cd /root/lezskabot/AstrBot
source venv/bin/activate
timeout 5 python main.py 2>&1 | head -20
