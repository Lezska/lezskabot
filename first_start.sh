#!/bin/bash
#获取脚本所在目录的绝对路径
cwd="$(cd "$(dirname "${BASH_SOURCE[O]}")" && pwd)"

# ========== 清理 llone/data 下的 logs 和 temp 文件夹 ==========
echo "Cleaning llone/data logs and temp directories..."

# ========== 检查并安装 Chrome/Chromium ==========
echo "Checking Chrome/Chromium availability..."

# 定义可能的 Chrome 命令名称
CHROME_NAMES=("google-chrome" "google-chrome-stable" "chromium" "chromium-browser" "chrome")
CHROME_CMD=""

for name in "${CHROME_NAMES[@]}"; do
    if command -v "$name" &> /dev/null; then
        CHROME_CMD="$name"
        break
    fi
done

if [ -z "$CHROME_CMD" ]; then
    echo "Chrome/Chromium not found. Attempting to install..."
    
    # 检测 Linux 发行版并安装
    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing chromium..."
        sudo apt-get update
        sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL system. Installing chromium..."
        sudo yum install -y chromium
    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora system. Installing chromium..."
        sudo dnf install -y chromium
    else
        echo "Error: Unsupported package manager. Please install Chrome/Chromium manually."
        exit 1
    fi
    
    # 再次检查是否安装成功
    for name in "${CHROME_NAMES[@]}"; do
        if command -v "$name" &> /dev/null; then
            CHROME_CMD="$name"
            break
        fi
    done
    
    if [ -n "$CHROME_CMD" ]; then
        echo "Chrome/Chromium installed successfully as '$CHROME_CMD'."
    else
        echo "Failed to install Chrome/Chromium. Please install manually and rerun this script."
        exit 1
    fi
else
    echo "Chrome/Chromium is already available: $CHROME_CMD"
    # 尝试获取版本号
    $CHROME_CMD --version 2>/dev/null || echo "  (version info not available)"
fi

echo ""

# ========== 检查并安装 Python 环境 ==========
echo "Checking Python environment..."

# 检查 python3 是否可用
if ! command -v python3 &> /dev/null; then
    echo "Python3 not found. Attempting to install..."
    
    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing python3..."
        sudo apt-get update
        sudo apt-get install -y python3 python3-pip python3-venv
    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL system. Installing python3..."
        sudo yum install -y python3 python3-pip
    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora system. Installing python3..."
        sudo dnf install -y python3 python3-pip
    else
        echo "Error: Unsupported package manager. Please install Python 3 manually."
        exit 1
    fi
    
    if command -v python3 &> /dev/null; then
        echo "Python3 installed successfully: $(python3 --version)"
    else
        echo "Failed to install Python3. Please install manually."
        exit 1
    fi
else
    echo "Python3 is already available: $(python3 --version)"
fi

# 确保 python 命令存在（指向 python3）
if ! command -v python &> /dev/null; then
    echo "Creating 'python' symlink to 'python3'..."
    # 尝试使用 update-alternatives 或直接创建软链接
    if command -v update-alternatives &> /dev/null; then
        sudo update-alternatives --install /usr/bin/python python /usr/bin/python3 1
    else
        # 如果没有 update-alternatives，直接创建软链接（需要 sudo）
        sudo ln -s "$(which python3)" /usr/bin/python 2>/dev/null || echo "  Failed to create symlink. You may need to run 'sudo ln -s $(which python3) /usr/bin/python' manually."
    fi
    # 再次检查
    if command -v python &> /dev/null; then
        echo "  python command is now available: $(python --version)"
    else
        echo "  Warning: 'python' command still not available. You may need to use 'python3' instead."
        echo "  The script will continue using 'python3' in the following commands."
        # 修改后续启动命令中的 python 为 python3
        USE_PYTHON3=true
    fi
else
    # 检查 python 版本是否为 3.x
    PYTHON_VERSION=$(python --version 2>&1)
    if [[ "$PYTHON_VERSION" == *"Python 3"* ]]; then
        echo "python command points to Python 3: $PYTHON_VERSION"
    else
        echo "Warning: python command points to Python 2 or not recognized: $PYTHON_VERSION"
        echo "The script will use python3 instead."
        USE_PYTHON3=true
    fi
fi

# 检查 pip3 是否可用（可选，用于后续依赖安装）
if ! command -v pip3 &> /dev/null; then
    echo "pip3 not found. Attempting to install..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y python3-pip
    elif command -v yum &> /dev/null; then
        sudo yum install -y python3-pip
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y python3-pip
    fi
fi

echo ""

# ========== 检查并安装 npm ==========
echo "Checking npm availability..."

if ! command -v npm &> /dev/null; then
    echo "npm not found. Attempting to install..."
    
    # 检测 Linux 发行版并安装
    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing npm..."
        sudo apt-get update
        sudo apt-get install -y npm
    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL system. Installing npm..."
        sudo yum install -y npm
    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora system. Installing npm..."
        sudo dnf install -y npm
    else
        echo "Error: Unsupported package manager. Please install npm manually."
        exit 1
    fi
    
    # 再次检查是否安装成功
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
    rm data/data_v4.db-shm data/data_v4.db_wal data/fish.db-shm data/fish.db-wal && \
    python3 -m venv ./venv && \
    source venv/bin/activate && \
    python -m pip install -r requirements.txt -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple && \
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
        mkdir llone && \
        mv LLBot-CLI-linux-x64.zip llone && \
        cd '${cwd}/llone' && \
        unzip LLBot-CLI-linux-x64.zip && \
        echo '=== Running start.sh ===' && \
        ./start.sh && exec bash
    "
fi
