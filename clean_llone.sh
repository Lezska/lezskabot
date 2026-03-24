#!/bin/bash
# 获取脚本所在目录的绝对路径
cwd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LLONE_TEMP_DIR="${cwd}/llone/data/temp"

# 清理 temp 文件夹
if [ -d "${LLONE_TEMP_DIR}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning ${LLONE_TEMP_DIR}..."
    rm -rf "${LLONE_TEMP_DIR}"/*
    # 确保目录存在（如果被删除了就重建）
    mkdir -p "${LLONE_TEMP_DIR}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ temp folder cleaned"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ Warning: ${LLONE_TEMP_DIR} not found"
    mkdir -p "${LLONE_TEMP_DIR}"
fi