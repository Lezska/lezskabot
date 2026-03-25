#!/bin/bash
# 获取脚本所在目录的绝对路径
cwd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LLONE_TEMP_DIR="${cwd}/llone/data/temp"
LLONE_LOG_DIR="${cwd}/llone/data/logs"

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

# 清理 logs 文件夹
if [ -d "${LLONE_LOG_DIR}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning ${LLONE_LOG_DIR}..."
    rm -rf "${LLONE_LOG_DIR}"/*
    # 确保目录存在（如果被删除了就重建）
    mkdir -p "${LLONE_LOG_DIR}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ logs folder cleaned"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ Warning: ${LLONE_TOG_DIR} not found"
    mkdir -p "${LLONE_LOG_DIR}"
fi
