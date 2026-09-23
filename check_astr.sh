#!/bin/bash
echo "=== ps check (long wait) ==="
sleep 5
ps -ef | grep "python main.py" | grep -v grep
echo ""
echo "=== screen capture ==="
screen -S astr -X hardcopy /tmp/astr_log.txt 2>&1
ls -la /tmp/astr_log.txt
