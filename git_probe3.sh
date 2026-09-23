#!/bin/bash
cd /root/lezskabot
echo "=== git log --oneline (last 10) ==="
git log --oneline -10
echo ""
echo "=== git remote -v ==="
git remote -v
echo ""
echo "=== git branch -a ==="
git branch -a
echo ""
echo "=== git rev-parse HEAD ==="
git rev-parse HEAD
echo ""
echo "=== ls -la .git/HEAD ==="
ls -la .git/HEAD
echo ""
echo "=== git config --get user.email ==="
git config --get user.email
git config --get user.name
echo ""
echo "=== git log --all --oneline | grep -E 'c7e34bd|fix.fishing' | head -5 ==="
git log --all --oneline | grep -E "c7e34bd|fix.fishing" | head -5
