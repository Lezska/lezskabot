#!/bin/bash
echo "=== AstrBot/ top dir ==="
ls /root/lezskabot/AstrBot/ | head -40
echo ""
echo "=== check if .core/ subdir exists ==="
ls -la /root/lezskabot/AstrBot/core/ 2>&1 | head -10
ls -la /root/lezskabot/AstrBot/astrbot/ 2>&1 | head -10
echo ""
echo "=== AstrBot/main.py first 30 lines (real content) ==="
head -30 /root/lezskabot/AstrBot/main.py
echo ""
echo "=== AstrBot/ git log of all .py changes (recent) ==="
cd /root/lezskabot
git log --all --diff-filter=M --oneline -- 'AstrBot/*.py' 2>&1 | head -10
echo ""
echo "=== how is the AstrBot symlink to upstream? ==="
ls -la /root/lezskabot/AstrBot/ | head -5
echo ""
echo "=== 7/18 was which commit's state? ==="
git log --since="2026-07-17" --until="2026-07-19" --oneline | head -10
