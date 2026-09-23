#!/bin/bash
echo "=== AstrBot pyproject.toml ==="
cat /root/lezskabot/AstrBot/pyproject.toml | head -40
echo ""
echo "=== look for AstrBot framework main entry point ==="
grep -rE "^\[project\.scripts\]|scripts\s*=|entry_points|astrbot.*=" /root/lezskabot/AstrBot/pyproject.toml 2>&1 | head -10
echo ""
echo "=== find framework main entry file (with class Star) ==="
grep -l "class.*Star\|class.*Plugin.*:" /root/lezskabot/AstrBot/main.py 2>&1 | head -3
echo ""
echo "=== git log of AstrBot/data first commit ==="
cd /root/lezskabot
git log --all --oneline -- AstrBot/data/plugins/astrbot_plugin_fishing/main.py | tail -3
echo ""
echo "=== git show first commit that includes AstrBot/main.py in tree ==="
git log --all --oneline --diff-filter=A -- "AstrBot/main.py" | head -5
echo ""
echo "=== HEAD tree: AstrBot/main.py tracked? ==="
git ls-tree HEAD AstrBot/main.py 2>&1
echo ""
echo "=== search for plugin name in any versioned file ==="
cd /root/lezskabot
git log --all --diff-filter=A --pretty=format:"%h %s" | head -5
