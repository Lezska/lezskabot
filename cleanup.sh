#!/bin/bash
# Daily cleanup for the QQ bot stack. Scheduled by root's crontab at 04:00.

set -uo pipefail

LOCKDIR=/var/lock/lezskabot-cleanup
LOG=/root/lezskabot/cleanup.log
QQ_ROOT=/root/.config/QQ
LLONE_LOG=/root/lezskabot/llone/bin/llbot/data/logs
LLONE_TEMP=/root/lezskabot/llone/bin/llbot/data/temp
ASTR_DATA=/root/lezskabot/AstrBot/data
KOISHI_ARCHIVE=/root/lezskabot/koishi/koishi-app/data/random-answer/extraction-archive
CHROME_METRICS=/root/.config/google-chrome/BrowserMetrics

if ! mkdir "$LOCKDIR" 2>/dev/null; then
    echo "[$(date '+%F %T')] another cleanup is already running" >&2
    exit 0
fi
trap 'rmdir "$LOCKDIR"' EXIT

say() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
used_kb() { df --output=used / | tail -n 1 | tr -d ' '; }

before_kb=$(used_kb)
say "cleanup started"

# LLOneBot runtime files. Three days of logs are enough for diagnostics.
find "$LLONE_LOG" -type f -name 'llbot-*.log' -mtime +3 -delete 2>/dev/null || true
if [ -d "$LLONE_TEMP" ]; then
    find "$LLONE_TEMP" -mindepth 1 -delete 2>/dev/null || true
else
    mkdir -p "$LLONE_TEMP"
fi

# QQ/NTQQ is the main source of disk growth. Keep databases and login state.
if [ -d "$QQ_ROOT" ]; then
    find "$QQ_ROOT" -type f -path '*/nt_data/log/*' -mtime +7 -delete 2>/dev/null || true
    find "$QQ_ROOT" -type f \( \
        -path '*/nt_data/Pic/*' -o \
        -path '*/nt_data/Ptt/*' -o \
        -path '*/nt_data/Video/*' \
    \) -mtime +14 -delete 2>/dev/null || true
fi

# AstrBot temporary downloads and generated images.
if [ -d "$ASTR_DATA/temp" ]; then
    find "$ASTR_DATA/temp" -mindepth 1 -delete 2>/dev/null || true
else
    mkdir -p "$ASTR_DATA/temp"
fi
find "$ASTR_DATA/tmp" -type f -mtime +3 -delete 2>/dev/null || true
find "$ASTR_DATA/plugin_data/unknown/cache/background_images_tmp" \
    -type f -mtime +3 -delete 2>/dev/null || true

# Keep one month of extraction snapshots. The SQLite word store is untouched.
find "$KOISHI_ARCHIVE" -type f -mtime +30 -delete 2>/dev/null || true

# Chromium metrics are disposable; Playwright browser binaries are retained.
find "$CHROME_METRICS" -type f -delete 2>/dev/null || true

# Bound ad-hoc restart logs without unlinking files held by running processes.
find /tmp -maxdepth 1 -type f -name '*_restart.log' -size +20M \
    -exec truncate -s 0 {} + 2>/dev/null || true

journalctl --vacuum-time=7d --vacuum-size=200M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true

after_kb=$(used_kb)
reclaimed_kb=$((before_kb - after_kb))
if (( reclaimed_kb < 0 )); then
    reclaimed_kb=0
fi
say "cleanup finished; reclaimed $((reclaimed_kb / 1024)) MiB"
df -h / | tee -a "$LOG"
say "---"
