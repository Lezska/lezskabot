# lezskabot

QQ bot stack + 状态备份/迁移仓库。

## 这是什么

4 个独立服务协同工作的 QQ 机器人栈：

| 服务 | 路径 | 用途 | 启动方式 |
|---|---|---|---|
| AstrBot | `AstrBot/` | 主 bot 框架（QQ 消息路由、命令系统、插件市场） | `restart_astr.sh` |
| Koishi | `koishi/koishi-app/` | 辅助 bot 框架（`random-answer` / `sticker-maker` / 漂流瓶等插件） | `koishi/koishi-app/data/.../restart_koishi.py`（不在 repo，见下） |
| LLOneBot | `llone/` | QQ 协议客户端，给 AstrBot/Koishi 提供 onebot 兼容协议 | `llone/start.sh` |
| OneBotFilter | `onebotfilter/` | 反向代理 / 消息过滤器 | `onebotfilter/OneBotFilter-v1.3.1-linux-amd64` |
| Haruki Client | `haruki-client-2.2.2-linux-x64/` | 另一个 onebot 客户端（备用） | 直接运行 `haruki-client` |

支持脚本：

| 脚本 | 用途 |
|---|---|
| `install_deps.sh` | 装系统依赖（Chrome / Python3.12 / npm / git / git-lfs） |
| `build.sh` | 重建 AstrBot / LLOne / pjskcards（假定 deps 已装） |
| `cleanup.sh` | 每日清理 LLOne logs / temp、AstrBot temp（挂 cron `0 4 * * *`） |
| `restart_astr.sh` | 重启 AstrBot（screen 会话 `astr`） |
| `clean_astr.sh` | 杀全部用户 Python 进程后重启 AstrBot（硬复位） |
| `clean_llone.sh` | 清 LLOneBot temp + logs（手动用） |
| `push_to_github.sh` | 一次性 LFS-aware 初始化推送脚本（**新机器首次推送到新仓库用**） |

## 仓库里有什么 / 没什么

### ✅ 在 repo（`git clone` + `git lfs pull` 就能拿到）

- 全部 `*.sh` 脚本
- `AstrBot/data/`（运行时数据：用户、消息历史、插件配置、avatar 缓存等）
- `koishi/`（除 `node_modules/` 外：插件源码、词库、抽取器归档、配置、字体）
- `llone/bin/llbot/data/*.json`（LLOneBot 三个老账号配置 + email config）
- `onebotfilter/OneBotFilter-v1.3.1-linux-amd64`（二进制）+ `config.yaml`
- `haruki-client-2.2.2-linux-x64/`（二进制 + 配置）
- `LLBot-CLI-linux-x64.zip`（LFS，LLOne 安装包）
- `.gitignore` / `.gitattributes`（LFS 规则）
- `backup-archives/`（历史 backup commit 的导出版本）

### ❌ 不在 repo（需要单独提供/还原）

| 文件 / 内容 | 为什么 | 怎么还原 |
|---|---|---|
| `koishi/koishi-app/.env` | 含 LLM API key（明文）。**initial commit `5ca530b` 已把这个文件 commit 进去了 —— 这是个安全 bug，详见下面"安全"一节** | `git show 5ca530b:koishi/koishi-app/.env` 拿到历史版本，或从环境变量重写 |
| `koishi/koishi-app/data/random-answer/llm-config.json` | 含当前生效的 LLM API key（`设置api` 命令创建） | 跑 `设置api <key> [base] [model]` 重建，或从备份恢复 |
| `llone/bin/llbot/data/config_<uin>.json`（**当前生产账号 `config_2763371925.json` 不在 repo 里**） | 含 QQ 登录 token | 重新扫码登录，或从 `/root/lezskabot/llone/bin/llbot/data/` 备份拷过来 |
| `pjskcards/`（3.9 GB，pjsk 图库） | 体积太大，`.gitignore` 整体排除；gacha-bot 插件读 `/root/lezskabot/pjskcards/{rarity}/{idx}.png` | `build.sh` 末尾 `git clone ... pjskcards.git` + `rm -rf pjskcards/.git`（省 4GB），目录名固定为 `pjskcards` |
| `/tmp/restart_koishi.py` | 在 `/tmp/` 不在 repo；是 koishi 的启动脚本（先 `source .env` 再 `npm start`） | 手写或从 https://... 这种永久地址取（见 `koishi/koishi-app/data/random-answer/lib/index.js:760` 注释里的引用） |

### ⚠️ 重建后必然缺失的运行时状态

- `koishi/koishi-app/node_modules/`（`.gitignore` 排除）— 跑 `npm install` 重建
- `AstrBot/venv/`（同上）— `python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
- 所有 `*.db-shm` / `*.db-wal` 文件
- 任何 `*/temp/` 和 `*/cache/` 目录（脚本会自动重建）

## 从零重建一台服务器

适用于：新开云服务器、当前机器坏了、想迁移到不同云。

```bash
# 假设是全新的 Ubuntu 22.04+ / Debian 12+ root 账号

# 1. 装系统依赖
bash install_deps.sh
# 装完会有：google-chrome-stable、python3.12、unzip、npm、git、git-lfs

# 2. 拉仓库（开 LFS！）
git clone https://github.com/Lezska/lezskabot.git /root/lezskabot
cd /root/lezskabot
git lfs install
git lfs pull   # 把 LFS 文件（*.zip、onebotfilter 二进制、haruki-client 等）下载下来

# 3. 重建 AstrBot（venv + pip install + pjskcards clone）
bash build.sh

# 4. 手动还原 secrets（不在 repo，必须从原机器拷过来或重做）
#    a. koishi/koishi-app/.env
#       从原机器: scp /root/lezskabot/koishi/koishi-app/.env root@新:/root/lezskabot/koishi/koishi-app/
#       或手写：
#         GITHUB_MIRROR=https://ghproxy.com/https://github.com
#         GITHUB_CONTENT_MIRROR=https://ghproxy.com/https://raw.githubusercontent.com
#         GRAVATAR_MIRROR=https://cravatar.cn
#         RANDOM_ANSWER_LLM_KEY=<your_key>
#       然后: chmod 600 koishi/koishi-app/.env
#
#    b. koishi/koishi-app/data/random-answer/llm-config.json
#       从原机器: scp .../llm-config.json root@新:.../llm-config.json
#       或在群里发 `设置api <新key>` 让 plugin 自己落盘
#
#    c. llone/bin/llbot/data/config_<uin>.json
#       从原机器拷过来；拷完后 LLOneBot 启动会自动续上登录态

# 5. 装 Koishi 的 node_modules
cd /root/lezskabot/koishi/koishi-app
npm install
cd /root/lezskabot

# 6. 写 /tmp/restart_koishi.py（手写 8 行，见下面"启动脚本"）

# 7. 启动各服务
screen -dmS llone bash -c "cd /root/lezskabot/llone && bash start.sh"
# 等 LLOneBot 起来（看屏幕输出，或浏览器开 127.0.0.1:3080 看 webui）
screen -dmS astr bash restart_astr.sh
screen -dmS koishi bash -c "cd /root/lezskabot/koishi/koishi-app && python3 /tmp/restart_koishi.py"

# 8. 配 cleanup.sh cron（每天凌晨 4 点）
(crontab -l 2>/dev/null; echo "0 4 * * * /root/lezskabot/cleanup.sh") | crontab -

# 9. onebotfilter / haruki（可选）
# onebotfilter: 改 config.yaml 里 AstrBot/Koishi 的端口，./OneBotFilter-v1.3.1-linux-amd64 启动
# haruki-client: 直接 ./haruki-client-2.2.2-linux-x64/haruki-client
```

### 启动后验证

```bash
# AstrBot 日志
tail -f /root/lezskabot/AstrBot/data/logs/astrbot.log 2>/dev/null
# Koishi 日志
tail -f /tmp/koishi_restart.log
# LLOneBot 日志
ls -lt /root/lezskabot/llone/bin/llbot/data/logs/ | head
# 群消息测试：在任一白名单群发「问今天吃什么」+「随机回答帮助」
```

## 启动脚本（不在 repo，手写或备份）

### `/tmp/restart_koishi.py`

```python
"""
Restart koishi cleanly:
1. Kill old koishi main + worker PIDs
2. Wait for them to fully die
3. Start fresh koishi in detached screen session
4. Tail the log
"""
import subprocess, time, os, signal

def sh(cmd, capture=True, timeout=30):
    r = subprocess.run(['bash', '-c', cmd], capture_output=capture, text=True, timeout=timeout)
    return r.stdout, r.stderr, r.returncode

out, _, _ = sh("ps -ef | grep -E 'koishi start|/koishi/lib/worker' | grep -v grep | awk '{print $2}'")
pids = [int(p) for p in out.strip().split('\n') if p.strip()]
print(f'[STEP 1] Found koishi PIDs: {pids}')

if not pids:
    print('  (no koishi running, skip kill)')
else:
    for pid in pids:
        try: os.kill(pid, signal.SIGTERM)
        except ProcessLookupError: pass
    time.sleep(3)
    out, _, _ = sh("ps -ef | grep -E 'koishi start|/koishi/lib/worker' | grep -v grep | awk '{print $2}'")
    for pid in [int(p) for p in out.strip().split('\n') if p.strip()]:
        try: os.kill(pid, signal.SIGKILL)
        except ProcessLookupError: pass
    time.sleep(2)

sh("screen -S koishi -X quit 2>/dev/null")
time.sleep(1)

ka = '/root/lezskabot/koishi/koishi-app'
start_cmd = (
    f'screen -dmS koishi bash -c "cd {ka} && '
    f'[ -f .env ] && set -a && . ./.env && set +a; '
    f'exec npm start 2>&1 | tee /tmp/koishi_restart.log"'
)
sh(start_cmd)
time.sleep(12)
out, _, _ = sh("tail -60 /tmp/koishi_restart.log")
print('=== /tmp/koishi_restart.log ===')
print(out)
```

## 安全（⚠️ 重读这一节）

### 已知的 secret 泄漏

- **`koishi/koishi-app/.env` 在 `5ca530b` initial commit 进了 GitHub 公开仓库**。里面有过期的 `RANDOM_ANSWER_LLM_KEY`（明文）。**这把 key 必须视为已泄漏，rotate 掉**。

  修法（**还没做，建议尽快**）：
  1. 改 LLM provider 那边的 key
  2. 在新机器上 `设置api <新key>` 重写 `llm-config.json`（已不在 repo，安全）
  3. `git filter-repo --path koishi/koishi-app/.env --invert-paths` 把 .env 从 history 里删掉
  4. `git push --force`，所有协作者 rebase
  5. 在 root `.gitignore` 加一行 `koishi/koishi-app/.env` 防再被加进去

- **LLOneBot 老 token** (`llone/bin/llbot/data/config_<uin>.json` 里 3 个老账号) 也进了 repo。同样建议 token rotate。

### 永久的 `.gitignore` 规则建议

下面这些路径建议**长期**在 root `.gitignore` 里（不只是为了这次 commit，是为了防 `git add -A` 误带）：

```
# Secrets — never commit
koishi/koishi-app/.env
koishi/koishi-app/data/random-answer/llm-config.json
llone/bin/llbot/data/config_*.json
llone/bin/llbot/data/accounts.json
llone/bin/llbot/data/llbot.json
```

> `koishi/koishi-app/.env` **当前还在 repo 里**（已被 5ca530b commit 进去），见上面"安全"一节。

## 常见运维操作

### 改 LLM API key（不用重启）

在群里 admin 发 `设置api <key> [base] [model]`：
- 立刻生效（内存 + 写 `llm-config.json`）
- 跨 koishi 重启持久化（启动时读 `llm-config.json` 覆盖 yml/env 值）
- 查看当前生效：`查看api`（key 脱敏显示）

### 重新生成 koishi.yml

- 改之前先 `cp koishi.yml koishi.yml.bak.<unix-timestamp>`
- 改完 `python3 /tmp/restart_koishi.py` 让 koishi 重新读
- 别直接 `git checkout koishi.yml` —— 会丢未 commit 的改动

### 加新群支持（random-answer 白名单）

改 `koishi/koishi-app/koishi.yml`：
```yaml
koishi-plugin-random-answer:bfx2ri:
  allowedGroups:
    - '1091191330'
    - '<新群号>'
```
然后 `python3 /tmp/restart_koishi.py`。

### 看抽取器跑没跑、用了哪个 key

群里 admin 发 `提取状态`（看 `lastExtractionAtLocal` + 间隔）或 `查看api`（看 key/base/model 脱敏后值 + 来源）。

## 故障排查

| 现象 | 看哪里 |
|---|---|
| 群消息没回复 | `tail /tmp/koishi_restart.log` 看 `[E]` 行；用 `查看api` 确认 key 有；`allowedGroups` 含本群 |
| 抽取器一直失败 | `tail /tmp/koishi_restart.log \| grep "LLM 调用"`；`查看api` 看 base/model；provider 那边有没限额 |
| LLOneBot 连不上 | `tail -50 llone/bin/llbot/data/logs/llbot-*.log`；看扫码页面能不能开 |
| AstrBot 启动报错 | `tail -f AstrBot/data/logs/astrbot.log`；多半是 venv 缺包，重跑 `pip install -r requirements.txt` |
| 磁盘满 | `df -h` + `journalctl --vacuum-size=200M` + 跑 `cleanup.sh`；avatar_cache 定期清 |

## 备份策略

`97f1776 "26-7-21 backup"` 和 `7ab7cf0 "chore(random-answer): ..."` 是最近的本地 backup commit。

写 backup commit 的清单（每次机器大改后）：
1. `cd /root/lezskabot && git status` 看哪些变脏
2. **手动 unstage** `koishi/koishi-app/.env`（每次都要 unst，因为有 in-place 修改；LFS 文件不进 `.gitignore` 因为已经 tracked）
3. **手动 unstage** `koishi/koishi-app/data/random-answer/llm-config.json`（新创建就是 untracked，stage 前先确认不是 secret）
4. `git reset HEAD` 清空 index
5. `git add <specific paths>` 显式列（不要 `git add -A`）
6. `git diff --cached --name-only | grep -iE 'env|secret|key|token|appkey|account'` 扫一遍
7. `git commit -m "..."` 写明包括哪些服务
8. `git push origin main`（push 要等用户指令，不要自动）

## 杂项

- 系统：Ubuntu 22.04 / Debian 12+（apt-based）。脚本里也有 yum/dnf 分支但没测过
- koishi app 监听 5140（server.port）
- AstrBot webui 默认 6185
- LLOneBot webui 默认 3080
- 数据库：
  - Koishi → `koishi/koishi-app/data/koishi.db` (sqlite)
  - AstrBot → `AstrBot/data/data_v4.db` (sqlite)
  - LLOneBot → `llone/bin/llbot/data/database/` (sqlite)
- 屏幕会话：astr / koishi / llone（screen -ls 查）
