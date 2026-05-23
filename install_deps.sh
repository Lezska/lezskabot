#!/bin/bash
# 获取脚本所在目录的绝对路径
cwd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# ========== 检查并安装 git ==========
echo "Checking git availability..."

if ! command -v git &> /dev/null; then
    echo "git not found. Attempting to install..."

    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing git..."
        sudo apt-get update
        sudo apt-get install -y git
    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL system. Installing git..."
        sudo yum install -y git
    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora system. Installing git..."
        sudo dnf install -y git
    else
        echo "Error: Unsupported package manager. Please install git manually."
        exit 1
    fi

    if command -v git &> /dev/null; then
        echo "git installed successfully: $(git --version)"
    else
        echo "Failed to install git. Please install manually."
        exit 1
    fi
else
    echo "git is already available: $(git --version)"
fi

echo ""

# ========== 检查并安装 git-lfs ==========
echo "Checking git-lfs availability..."

if ! command -v git-lfs &> /dev/null; then
    echo "git-lfs not found. Attempting to install..."

    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu system. Installing git-lfs..."
        # 添加 Git LFS 官方仓库（可选，但确保最新版本）
        curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | sudo bash
        sudo apt-get install -y git-lfs
    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL system. Installing git-lfs..."
        # 启用 EPEL 或直接使用官方脚本
        curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.rpm.sh | sudo bash
        sudo yum install -y git-lfs
    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora system. Installing git-lfs..."
        sudo dnf install -y git-lfs
    else
        echo "Error: Unsupported package manager. Please install git-lfs manually from https://git-lfs.com/"
        exit 1
    fi

    # 初始化 git-lfs（可选，通常在用户级别执行，这里仅为确保命令可用）
    if command -v git-lfs &> /dev/null; then
        echo "git-lfs installed successfully: $(git-lfs --version)"
        # 注意：git lfs install 需要在 git 仓库内执行或全局执行，这里仅做提示
        echo "You may need to run 'git lfs install' inside your repository to enable LFS."
    else
        echo "Failed to install git-lfs. Please install manually."
        exit 1
    fi
else
    echo "git-lfs is already available: $(git-lfs --version)"
fi

echo ""
echo "All dependencies have been checked/installed successfully."