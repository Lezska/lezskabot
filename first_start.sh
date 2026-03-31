#!/bin/bash
#获取脚本所在目录的绝对路径
cwd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ========== 清理 llone/data 下的 logs 和 temp 文件夹 ==========
echo "Cleaning llone/data logs and temp directories..."

# ========== 检查并安装 Google Chrome ==========
echo "Checking Google Chrome availability..."

CHROME_CMD=""

# 检查是否已安装
if command -v google-chrome &> /dev/null; then
    CHROME_CMD="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    CHROME_CMD="google-chrome-stable"
fi

if [ -z "$CHROME_CMD" ]; then
    echo "Google Chrome not found. Attempting to install..."

    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing google-chrome-stable..."

        sudo apt-get update
        sudo apt-get install -y wget gnupg

        # 添加 Google 官方 key
        wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | \
        sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg

        # 添加 Chrome 仓库
        echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | \
        sudo tee /etc/apt/sources.list.d/google-chrome.list > /dev/null

        sudo apt-get update
        sudo apt-get install -y google-chrome-stable

    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL system. Installing google-chrome-stable..."

        sudo tee /etc/yum.repos.d/google-chrome.repo <<EOF
[google-chrome]
name=google-chrome
baseurl=http://dl.google.com/linux/chrome/rpm/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://dl.google.com/linux/linux_signing_key.pub
EOF

        sudo yum install -y google-chrome-stable

    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora system. Installing google-chrome-stable..."

        sudo dnf install -y google-chrome-stable

    else
        echo "Error: Unsupported package manager. Please install Chrome manually."
        exit 1
    fi

    # 再次检查
    if command -v google-chrome &> /dev/null; then
        CHROME_CMD="google-chrome"
    elif command -v google-chrome-stable &> /dev/null; then
        CHROME_CMD="google-chrome-stable"
    fi

    if [ -n "$CHROME_CMD" ]; then
        echo "Google Chrome installed successfully: $($CHROME_CMD --version)"
    else
        echo "Failed to install Google Chrome."
        exit 1
    fi

else
    echo "Google Chrome already available: $($CHROME_CMD --version)"
fi

export CHROME_BIN=$(command -v google-chrome || command -v google-chrome-stable)

echo ""

# ========== 检查并安装 Python 3.12 及 python3.12-venv ==========
echo "Checking Python 3.12 and python3.12-venv..."

if ! command -v python3.12 &> /dev/null; then
    echo "python3.12 not found. Attempting to install Python 3.12 and python3.12-venv..."
    sudo apt-get install -y python3.12 python3.12-venv python3.12-dev
    
    if command -v python3.12 &> /dev/null; then
        echo "python3.12 installed successfully: $(python3.12 --version)"
    else
        echo "Failed to install python3.12. Please install manually."
        exit 1
    fi
else
    echo "python3.12 is already available: $(python3.12 --version)"
fi

echo ""

echo "Installing Playwright"
playwright install 

# ========== 检查并安装 unzip ==========
echo "Checking unzip availability..."

if ! command -v unzip &> /dev/null; then
    echo "unzip not found. Attempting to install..."

    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing unzip..."
        sudo apt-get update
        sudo apt-get install -y unzip
    else
        echo "Error: Unsupported package manager. Please install unzip manually."
        exit 1
    fi

    if command -v unzip &> /dev/null; then
        echo "unzip installed successfully."
    else
        echo "Failed to install unzip. Please install manually."
        exit 1
    fi
else
    echo "unzip is already available: $(unzip -v | head -n 1)"
fi

echo ""

# ========== 检查并安装 npm ==========
echo "Checking npm availability..."

if ! command -v npm &> /dev/null; then
    echo "npm not found. Attempting to install..."
    
    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing npm..."
        sudo apt-get update
        sudo apt-get install -y npm
    else
        echo "Error: Unsupported package manager. Please install npm manually."
        exit 1
    fi
    
    if command -v npm &> /dev/null; then
        echo "npm installed successfully."
    else
        echo "Failed to install npm. Please install manually and rerun this script."
        exit 1
    fi
else
    echo "npm is already available: $(npm --version)"
fi

echo ""

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
    rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal && \
    python3 -m venv ./venv && \
    source venv/bin/activate && \
    python -m pip install -r requirements.txt -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple && \
    python main.py && \
    exec bash
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
        mkdir llone && \
        mv LLBot-CLI-linux-x64.zip llone && \
        cd '${cwd}/llone' && \
        unzip LLBot-CLI-linux-x64.zip && \
        chmod +x start.sh && \
        echo '=== Running start.sh ===' && \
        ./start.sh && exec bash
    "
fi
