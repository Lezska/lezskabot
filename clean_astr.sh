#!/bin/bash

cwd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "警告：即将终止当前用户的所有 Python 进程！"
read -p "确认继续？(y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "操作已取消。"
    exit 0
fi

# 终止当前用户的所有 Python 进程（避免误杀系统或其他用户的进程）
echo "正在清理所有 Python 进程..."
pkill -u "$USER" -f "python" || echo "没有找到 Python 进程。"

# 可选：等待进程完全退出
sleep 1

# 重启 AstrBot（逻辑与 restart_astr.sh 一致）
if screen -list | grep -q "astr"; then
    screen -X -S "astr" quit
fi

screen -d -m -S "astr" bash -c "
    cd '${cwd}/AstrBot' && \
    rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal && \
    source venv/bin/activate && \
    python main.py
"

echo "已清理所有 Python 进程并重启 AstrBot。"