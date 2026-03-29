#!/bin/bash
#获取脚本所在目录的绝对路径
cwd="$(cd "$(dirname "${BASH_SOURCE[O]}")" && pwd)"

# ========== 清理 llone/data 下的 logs 和 temp 文件夹 ==========
echo "Cleaning llone/data logs and temp directories..."

LLONE_DATA_DIR="${cwd}/llone/data"

# 检查 llone/data 目录是否存在
if [ -d "${LLONE_DATA_DIR}" ]; then
    # 清空 logs 文件夹内容（保留目录）
    if [ -d "${LLONE_DATA_DIR}/logs" ]; then
        echo "  Clearing ${LLONE_DATA_DIR}/logs..."
        rm -rf "${LLONE_DATA_DIR}/logs"/*
        echo "  ✓ logs cleared"
    fi
    
    # 清空 temp 文件夹内容（保留目录）
    if [ -d "${LLONE_DATA_DIR}/temp" ]; then
        echo "  Clearing ${LLONE_DATA_DIR}/temp..."
        rm -rf "${LLONE_DATA_DIR}/temp"/*
        echo "  ✓ temp cleared"
    fi
    
    echo "✓ llone/data cleanup completed"
else
    echo "⚠ Warning: llone/data directory not found at ${LLONE_DATA_DIR}"
fi

echo ""

#检查是否已有同名screen会话在运行
if screen -list | grep -q "astr"; then
    echo "Screen session 'astr' already exists."
# 执行
else
    screen -d -m -S "astr" bash -c "
    cd '${cwd}/AstrBot' && \
    source venv/bin/activate && \
    python main.py
    "
fi
    
if screen -list | grep -q "koishi"; then
    echo "Screen session 'koishi' already exists."
else
    screen -d -m -S "koishi" bash -c "
    cd '${cwd}/koishi/koishi-app' && npm start
    "
fi

if screen -list | grep -q "haruki"; then
    echo "Screen session 'haruki' already exists."
else
    screen -d -m -S "haruki" bash -c "
    cd '${cwd}/haruki' && ./HarukiClient-Linux-amd64-v1.1.8-glibc.app
    "
fi

if screen -list | grep -q "onebotfilter"; then
    echo "Screen session 'onebotfilter' already exists."
else
    screen -d -m -S "onebotfilter" bash -c "
    cd '${cwd}/onebotfilter' &&./OneBotFilter-v1.3.1-linux-amd64
    "
fi

if screen -list | grep -q "llone"; then
    echo "Screen session 'llone' already exists, attaching..."
    screen -r "llone"
else
    echo "Creating new screen session 'llone' and running start.sh..."
    # 创建新会话，先执行 cd 和 start.sh，然后保持 shell 交互
    screen -S "llone" bash -c "
        cd '${cwd}/llone' && \
        echo '=== Running start.sh ===' && \
        ./start.sh \
        exec bash
    "
fi
