#!/bin/bash
echo "=== first 5 bytes of AstrBot/main.py ==="
head -c 5 /root/lezskabot/AstrBot/main.py | xxd
echo ""
echo "=== line 1 ==="
head -1 /root/lezskabot/AstrBot/main.py
echo ""
echo "=== file encoding check ==="
file /root/lezskabot/AstrBot/main.py
echo ""
echo "=== old main.py (backup) first 5 bytes ==="
head -c 5 /root/lezskabot/backups/fishing_reapply_20260726_1050/reset_fishing_cooldown_effect.py > /dev/null
ls -la /root/lezskabot/backups/ | head -20
echo ""
echo "=== check if AstrBot.egg-info or AstrBot/__init__.py exists ==="
ls -la /root/lezskabot/AstrBot/__init__.py 2>&1
ls -la /root/lezskabot/AstrBot.egg-info 2>&1
