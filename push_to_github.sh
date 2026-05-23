#!/bin/bash
set -euo pipefail

# ---------- 配置 ----------
LFS_THRESHOLD=${LFS_THRESHOLD:-50M}

# 需要添加的路径模式（支持通配符）
DEFAULT_INCLUDE_PATHS=(
    "./AstrBot/data"
    "./*.sh"
    "./koishi"
    "./*.zip"
    "./onebotfilter"
    "./haruki*"
    "./llone/bin/llbot/data/*.json"
    "./.gitignore"  # 确保 .gitignore 也被添加，以便 LFS 跟踪规则生效
)
# --------------------------

usage() {
    echo "用法: $0 <工作目录> <远程仓库地址> [选项]"
    echo ""
    echo "必要参数:"
    echo "  work_dir          - 包含需要推送内容的根目录"
    echo "  remote_url        - Git 远程仓库地址"
    echo ""
    echo "选项:"
    echo "  -b, --branch      分支名（默认: main）"
    echo "  -m, --message     提交信息（默认: 'Initial commit with LFS'）"
    echo "  -i, --include     需要添加的目录或文件（可重复多次，追加到默认列表）"
    echo "  -e, --exclude     排除列表文件（.gitignore 格式，内容将被追加到根 .gitignore）"
    echo ""
    exit 1
}

# ---- 参数解析 ----
WORK_DIR=""
REMOTE_URL=""
BRANCH="main"
COMMIT_MSG="Initial commit with LFS"
INCLUDE_PATHS=("${DEFAULT_INCLUDE_PATHS[@]}")
EXCLUDE_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--branch)
            BRANCH="$2"
            shift 2
            ;;
        -m|--message)
            COMMIT_MSG="$2"
            shift 2
            ;;
        -i|--include)
            INCLUDE_PATHS+=("$2")
            shift 2
            ;;
        -e|--exclude)
            EXCLUDE_FILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$WORK_DIR" ]; then
                WORK_DIR="$1"
            elif [ -z "$REMOTE_URL" ]; then
                REMOTE_URL="$1"
            else
                echo "未知参数: $1"
                usage
            fi
            shift
            ;;
    esac
done

if [ -z "$WORK_DIR" ] || [ -z "$REMOTE_URL" ]; then
    echo "错误: 缺少工作目录或远程仓库地址。"
    usage
fi

command -v git >/dev/null 2>&1 || { echo "错误: 未安装 git。"; exit 1; }
command -v git-lfs >/dev/null 2>&1 || { echo "错误: 未安装 git-lfs。"; exit 1; }

if [ ! -d "$WORK_DIR" ]; then
    echo "错误: 工作目录 '$WORK_DIR' 不存在。"
    exit 1
fi

cd "$WORK_DIR"

# ---- 初始化仓库 ----
if [ ! -d .git ]; then
    echo "初始化 Git 仓库..."
    git init
    git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
else
    echo "Git 仓库已存在。"
    git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
fi

git lfs install

# ---- 应用外部排除规则（追加到 .gitignore） ----
if [ -n "$EXCLUDE_FILE" ]; then
    if [ ! -f "$EXCLUDE_FILE" ]; then
        echo "警告: 排除文件 '$EXCLUDE_FILE' 不存在，忽略。"
    else
        echo "应用排除规则: $EXCLUDE_FILE"
        cat "$EXCLUDE_FILE" >> .gitignore
    fi
fi

# ---- 展开通配符模式 ----
echo "正在解析路径模式..."
EXPANDED_PATHS=()
for pattern in "${INCLUDE_PATHS[@]}"; do
    clean_pattern="${pattern#./}"
    if [[ "$clean_pattern" == *[*?[]* ]]; then
        if [[ "$clean_pattern" != */* ]]; then
            while IFS= read -r -d '' found; do
                rel="${found#./}"
                EXPANDED_PATHS+=("./$rel")
            done < <(find . -maxdepth 1 -name "$clean_pattern" -print0 2>/dev/null || true)
        else
            while IFS= read -r -d '' found; do
                rel="${found#./}"
                EXPANDED_PATHS+=("./$rel")
            done < <(find . -path "./$clean_pattern" -print0 2>/dev/null || true)
        fi
    else
        if [ -e "$pattern" ]; then
            EXPANDED_PATHS+=("$pattern")
        else
            echo "注意: 路径 '$pattern' 不存在，已跳过。"
        fi
    fi
done

if [ ${#EXPANDED_PATHS[@]} -eq 0 ]; then
    echo "警告: 没有匹配到任何文件或目录，退出。"
    exit 0
fi

echo "将要添加的路径:"
printf '  %s\n' "${EXPANDED_PATHS[@]}"

# ---- 关键修复：在 git add 之前扫描大文件并配置 LFS ----
echo "正在扫描大文件（> $LFS_THRESHOLD）并配置 Git LFS..."
while IFS= read -r -d '' file; do
    # 检查文件是否被 .gitignore 忽略（但我们后面会 git add，这里先跳过被忽略的）
    if git check-ignore -q "$file" 2>/dev/null; then
        continue
    fi
    echo "LFS 跟踪: $file"
    git lfs track "$file"
done < <(find "${EXPANDED_PATHS[@]}" -type f -size +"$LFS_THRESHOLD" -print0 2>/dev/null || true)

# 此时 .gitattributes 可能已更新，需要先将其加入暂存（后续 git add 会再添加其他文件）
if [ -f .gitattributes ]; then
    git add .gitattributes
fi

# ---- 现在才执行 git add，文件会自动按 LFS 规则处理 ----
echo "添加所有文件到暂存区（大文件将自动转为 LFS 指针）..."
git add "${EXPANDED_PATHS[@]}"

# 再次添加 .gitattributes（以防它在 git add 过程中被忽略或未包含）
if [ -f .gitattributes ]; then
    git add .gitattributes
fi

# ---- 提交 ----
if git diff --cached --quiet; then
    echo "没有需要提交的内容。"
else
    echo "提交: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
fi

# ---- 设置远程仓库 ----
if ! git remote get-url origin >/dev/null 2>&1; then
    echo "添加远程仓库 origin: $REMOTE_URL"
    git remote add origin "$REMOTE_URL"
else
    current_url=$(git remote get-url origin)
    if [ "$current_url" != "$REMOTE_URL" ]; then
        echo "远程仓库已设置为 $current_url，更新为 $REMOTE_URL"
        git remote set-url origin "$REMOTE_URL"
    else
        echo "远程仓库已配置: $REMOTE_URL"
    fi
fi

# ---- 推送 ----
echo "推送到 $REMOTE_URL ($BRANCH)..."
git push -u origin "$BRANCH"

echo "完成。"