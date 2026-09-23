#!/bin/bash
echo "=== screen capture ==="
screen -S astr -X hardcopy /tmp/astr_log2.txt 2>&1
ls -la /tmp/astr_log2.txt
