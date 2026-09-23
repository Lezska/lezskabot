#!/bin/bash
echo "=== framework main.py in astrbot/ subdir ==="
ls -la /root/lezskabot/AstrBot/astrbot/ | head -20
echo ""
echo "=== check if AstrBot/ is a git submodule or has .git ==="
ls -la /root/lezskabot/AstrBot/.git 2>&1 | head -5
echo ""
echo "=== astrbot/builtin_stars/astrbot/main.py content (framework plugin loader) ==="
head -30 /root/lezskabot/AstrBot/astrbot/builtin_stars/astrbot/main.py
echo ""
echo "=== last 50 lines of AstrBot/main.py (to see if it has __main__ guard) ==="
tail -50 /root/lezskabot/AstrBot/main.py
echo ""
echo "=== AstrBot/astrbot/ is git-tracked? ==="
cd /root/lezskabot
git ls-tree HEAD -- AstrBot/astrbot | head -3
