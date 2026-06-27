#!/bin/bash
# /root/lezskabot/cleanup.sh
# 定期清理 QQ 机器人栈的日志和临时文件
# 挂 cron: 0 4 * * * /root/lezskabot/cleanup.sh
#
# 清理项:
#   [1] LLOneBot logs (mtime > 7d)
#   [2] LLOneBot temp (全清, 启动时会重建)
#   [3] AstrBot data/temp (全清, 运行时重建)
#   [4] systemd journal vacuum 200M + apt cache clean
# 不清理:
#   - Koishi (没单独 logs 文件)
#   - cards/ (用户图库, 必保留)
#   - puppeteer / .cache/ms-playwright (使用频率高)
#   - AstrBot/data/dist (WebUI build artifacts, 不能删!)
#   - AstrBot/data/plugins (插件代码, 不能删)

set -uo pipefail

# 防重入锁 (mkdir 原子)
LOCKDIR=/var/lock/lezskabot-cleanup
if ! mkdir "$LOCKDIR" 2>/dev/null; then
    echo "[$(date '+%F %T')] another instance running, exit" >&2
    exit 0
fi
trap 'rmdir "$LOCKDIR"' EXIT

LOG=/root/lezskabot/cleanup.log
LLONE_LOG=/root/lezskabot/llone/bin/llbot/data/logs
LLONE_TEMP=/root/lezskabot/llone/bin/llbot/data/temp
ASTR_TEMP=/root/lezskabot/AstrBot/data/temp

reclaimed=0
say() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

# [1] LLOneBot logs 删 mtime > 7d
say "[1/4] LLOneBot logs > 7d"
size=$(find "$LLONE_LOG" -name "llbot-*.log" -type f -mtime +7 -printf "%s\n" 2>/dev/null | awk '{s+=$1} END {print s+0}')
size=${size:-0}
find "$LLONE_LOG" -name "llbot-*.log" -type f -mtime +7 -delete 2>/dev/null
say "  reclaimed $(awk "BEGIN{printf \"%.1f\", $size/1024/1024}") MB"
reclaimed=$((reclaimed + size))

# [2] LLOneBot temp 全清
say "[2/4] LLOneBot temp"
if [ -d "$LLONE_TEMP" ]; then
    size=$(du -sb "$LLONE_TEMP" 2>/dev/null | awk '{print $1}')
    size=${size:-0}
    find "$LLONE_TEMP" -mindepth 1 -delete 2>/dev/null
    say "  reclaimed $(awk "BEGIN{printf \"%.1f\", $size/1024/1024}") MB"
    reclaimed=$((reclaimed + size))
else
    mkdir -p "$LLONE_TEMP"
    say "  temp dir missing, recreated"
fi

# [3] AstrBot data/temp 全清 (注意: 不碰 dist/, 不碰 plugins/)
say "[3/4] AstrBot data/temp"
if [ -d "$ASTR_TEMP" ]; then
    size=$(du -sb "$ASTR_TEMP" 2>/dev/null | awk '{print $1}')
    size=${size:-0}
    find "$ASTR_TEMP" -mindepth 1 -delete 2>/dev/null
    say "  reclaimed $(awk "BEGIN{printf \"%.1f\", $size/1024/1024}") MB"
    reclaimed=$((reclaimed + size))
else
    mkdir -p "$ASTR_TEMP"
    say "  temp dir missing, recreated"
fi

# [4] 系统级
say "[4/4] journal vacuum 200M + apt clean"
journalctl --vacuum-size=200M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true
say "  done"

say "TOTAL reclaimed: $(awk "BEGIN{printf \"%.1f\", $reclaimed/1024/1024}") MB"
df -h / | tee -a "$LOG"
say "---"