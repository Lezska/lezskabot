#!/bin/bash
set -e
cd /root/lezskabot/AstrBot
source venv/bin/activate
echo "=== run e2e speedtest (venv active) ==="
python /tmp/speedtest_e2e.py 2>&1 | tail -50
