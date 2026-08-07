# Koishi Extractor Toggle and Message Stats Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent administrator-controlled automatic extraction switch to Koishi and restore AstrBot message-stat image rankings with a reliable text fallback.

**Architecture:** Koishi keeps `llmEnabled` as its master configuration and stores the runtime scheduler state in `extractor-state.json`; the extractor controller owns timer lifecycle while manual extraction remains independent. AstrBot keeps image mode, installs only Playwright Chromium, and treats an empty image path as a recoverable rendering failure instead of a data-format error.

**Tech Stack:** Node.js 22, Koishi 4.18, `node:test`, Python 3.12, AstrBot 4.26.6, `unittest`, Playwright Chromium, GNU screen.

---

## File Structure

- Modify `koishi/koishi-app/plugins/random-answer/lib/extractor.js`: persistent state defaults and automatic scheduler controller.
- Modify `koishi/koishi-app/plugins/random-answer/lib/index.js`: administrator commands and status output.
- Create `koishi/koishi-app/plugins/random-answer/test/extractor-toggle.test.js`: controller behavior regression tests.
- Modify `AstrBot/data/plugins/astrbot_plugin_message_stats/main.py`: guard falsey image paths and return the existing text fallback.
- Create `AstrBot/data/plugins/astrbot_plugin_message_stats/test/test_rank_fallback.py`: regression test for image generation returning `None`.

## Task 1: Capture Production Baseline and Backups

**Files:**
- Read: all five scoped files above
- Backup: `/root/lezskabot/backups/codex_20260808_extractor_stats/`

- [ ] **Step 1: Confirm scoped source files are clean**

Run:

```bash
cd /root/lezskabot
git status --short -- \
  koishi/koishi-app/plugins/random-answer/lib/extractor.js \
  koishi/koishi-app/plugins/random-answer/lib/index.js \
  koishi/koishi-app/plugins/random-answer/test \
  AstrBot/data/plugins/astrbot_plugin_message_stats/main.py \
  AstrBot/data/plugins/astrbot_plugin_message_stats/test
```

Expected: no output. Stop if any scoped production file has an existing user modification.

- [ ] **Step 2: Create exact-file backups**

Run:

```bash
install -d -m 700 /root/lezskabot/backups/codex_20260808_extractor_stats
cp --preserve=mode,timestamps \
  koishi/koishi-app/plugins/random-answer/lib/extractor.js \
  koishi/koishi-app/plugins/random-answer/lib/index.js \
  AstrBot/data/plugins/astrbot_plugin_message_stats/main.py \
  /root/lezskabot/backups/codex_20260808_extractor_stats/
```

Expected: three small source backups, owned by root, with no runtime data copied.

## Task 2: Add the Koishi Failing Tests

**Files:**
- Create: `koishi/koishi-app/plugins/random-answer/test/extractor-toggle.test.js`
- Test: `koishi/koishi-app/plugins/random-answer/test/extractor-toggle.test.js`

- [ ] **Step 1: Write controller behavior tests**

Create the test with Node's built-in test runner:

```javascript
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")

const { startExtractor } = require("../lib/extractor")

async function withController(run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "random-answer-toggle-"))
  const handles = []
  const originals = {
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  }
  global.setInterval = (fn, ms) => {
    const handle = { type: "interval", fn, ms, cleared: false }
    handles.push(handle)
    return handle
  }
  global.clearInterval = (handle) => { if (handle) handle.cleared = true }
  global.setTimeout = (fn, ms) => {
    const handle = { type: "timeout", fn, ms, cleared: false }
    handles.push(handle)
    return handle
  }
  global.clearTimeout = (handle) => { if (handle) handle.cleared = true }

  const messages = []
  const ctx = {
    logger: () => ({
      info: (message) => messages.push(["info", message]),
      warn: (message) => messages.push(["warn", message]),
      error: (message) => messages.push(["error", message]),
    }),
  }
  const config = {
    dataDir,
    llmEnabled: true,
    llmApiBase: "https://example.invalid",
    llmIntervalMin: 17,
    llmAllowedGroups: [],
  }
  const dbApi = { has: () => false, all: () => [], add: async () => true }

  try {
    await run({ dataDir, handles, ctx, config, dbApi })
  } finally {
    global.setInterval = originals.setInterval
    global.clearInterval = originals.clearInterval
    global.setTimeout = originals.setTimeout
    global.clearTimeout = originals.clearTimeout
    await fs.rm(dataDir, { recursive: true, force: true })
  }
}

test("disabling automatic extraction persists and keeps manual extraction available", async () => {
  await withController(async ({ dataDir, handles, ctx, config, dbApi }) => {
    const extractor = await startExtractor(ctx, config, dbApi)
    assert.equal(extractor.isAutoEnabled(), true)
    assert.equal(handles[0].ms, 17 * 60 * 1000)

    assert.equal(await extractor.setAutoEnabled(false), true)
    assert.equal(extractor.isAutoEnabled(), false)
    assert.equal(handles.filter((handle) => handle.cleared).length, 2)

    const manual = await extractor.runNow()
    assert.equal(manual.skipped, true)
    assert.equal(manual.reason, "llmAllowedGroups 为空")

    extractor.stop()
    const restarted = await startExtractor(ctx, config, dbApi)
    assert.equal(restarted.isAutoEnabled(), false)
    assert.equal(handles.filter((handle) => !handle.cleared).length, 0)

    const state = JSON.parse(await fs.readFile(path.join(dataDir, "extractor-state.json"), "utf8"))
    assert.equal(state.autoEnabled, false)
  })
})

test("enabling schedules the interval without running immediately", async () => {
  await withController(async ({ dataDir, handles, ctx, config, dbApi }) => {
    await fs.writeFile(path.join(dataDir, "extractor-state.json"), JSON.stringify({
      lastExtractionTs: 0,
      intervalMin: 15,
      autoEnabled: false,
    }))
    const extractor = await startExtractor(ctx, config, dbApi)

    assert.equal(await extractor.setAutoEnabled(true), true)
    assert.equal(extractor.isAutoEnabled(), true)
    assert.equal(handles.filter((handle) => handle.type === "interval" && !handle.cleared).length, 1)
    assert.equal(handles.filter((handle) => handle.type === "timeout" && !handle.cleared).length, 0)
  })
})

test("changing interval while disabled persists without scheduling", async () => {
  await withController(async ({ dataDir, handles, ctx, config, dbApi }) => {
    await fs.writeFile(path.join(dataDir, "extractor-state.json"), JSON.stringify({
      lastExtractionTs: 0,
      intervalMin: 60,
      autoEnabled: false,
    }))
    const extractor = await startExtractor(ctx, config, dbApi)

    await extractor.setInterval(20)
    assert.equal(handles.filter((handle) => handle.type === "interval" && !handle.cleared).length, 0)
    const state = JSON.parse(await fs.readFile(path.join(dataDir, "extractor-state.json"), "utf8"))
    assert.equal(state.intervalMin, 20)
    assert.equal(state.autoEnabled, false)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd /root/lezskabot/koishi/koishi-app
node --test plugins/random-answer/test/extractor-toggle.test.js
```

Expected: FAIL because `isAutoEnabled` or `setAutoEnabled` does not exist.

## Task 3: Implement the Koishi Scheduler Controller

**Files:**
- Modify: `koishi/koishi-app/plugins/random-answer/lib/extractor.js:37-48`
- Modify: `koishi/koishi-app/plugins/random-answer/lib/extractor.js:437-488`
- Test: `koishi/koishi-app/plugins/random-answer/test/extractor-toggle.test.js`

- [ ] **Step 1: Normalize persisted state**

Change `readState()` so every caller receives normalized defaults while preserving additional fields:

```javascript
async function readState(stateFile, defaultIntervalMin = 60) {
  const fallbackInterval = Math.max(1, Number(defaultIntervalMin) || 60)
  try {
    const raw = await fs.readFile(stateFile, "utf-8")
    const state = JSON.parse(raw)
    return {
      ...state,
      lastExtractionTs: Number(state.lastExtractionTs) || 0,
      intervalMin: Math.max(1, Number(state.intervalMin) || fallbackInterval),
      autoEnabled: state.autoEnabled !== false,
    }
  } catch {
    return { lastExtractionTs: 0, intervalMin: fallbackInterval, autoEnabled: true }
  }
}
```

- [ ] **Step 2: Replace `startExtractor()` with an asynchronous stateful controller**

The implementation must:

```javascript
async function startExtractor(ctx, config, dbApi) {
  if (!config.llmEnabled) return null
  if (!config.llmApiBase) {
    ctx.logger("random-answer").warn("llmEnabled=true 但 llmApiBase 未配置，跳过 extractor 启动")
    return null
  }

  let timer = null
  let startupTimer = null
  const stateFile = path.join(config.dataDir, "extractor-state.json")
  const initialState = await readState(stateFile, config.llmIntervalMin)
  let autoEnabled = initialState.autoEnabled
  let intervalMin = initialState.intervalMin || config.llmIntervalMin
  config.llmIntervalMin = intervalMin

  const clearAutomaticTimers = () => {
    if (timer) clearInterval(timer)
    if (startupTimer) clearTimeout(startupTimer)
    timer = null
    startupTimer = null
  }

  const persistState = async (updates) => {
    const state = await readState(stateFile, intervalMin)
    await writeState(stateFile, { ...state, ...updates })
  }

  const schedule = () => {
    if (!autoEnabled) return
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      runExtraction(ctx, config, dbApi).then(result => {
        ctx.logger("random-answer").info("extractor run: " + JSON.stringify(result))
      }).catch(error => {
        ctx.logger("random-answer").error("extractor run failed: " + (error?.stack || error))
      })
    }, intervalMin * 60 * 1000)
    ctx.logger("random-answer").info(`extractor 已启动，间隔 ${intervalMin} 分钟`)
  }

  if (autoEnabled) {
    schedule()
    startupTimer = setTimeout(() => {
      startupTimer = null
      if (!autoEnabled) return
      runExtraction(ctx, config, dbApi).then(result => {
        ctx.logger("random-answer").info("extractor run (startup): " + JSON.stringify(result))
      }).catch(error => {
        ctx.logger("random-answer").error("extractor startup run failed: " + (error?.stack || error))
      })
    }, 5000)
  }

  return {
    runNow: () => runExtraction(ctx, config, dbApi),
    isAutoEnabled: () => autoEnabled,
    setAutoEnabled: async (enabled) => {
      const next = Boolean(enabled)
      if (next === autoEnabled) return false
      autoEnabled = next
      await persistState({ autoEnabled })
      clearAutomaticTimers()
      if (autoEnabled) schedule()
      return true
    },
    setInterval: async (min) => {
      intervalMin = Math.max(1, Number(min) || 60)
      config.llmIntervalMin = intervalMin
      await persistState({ intervalMin })
      if (autoEnabled) schedule()
    },
    stop: clearAutomaticTimers,
  }
}
```

- [ ] **Step 3: Run the Koishi tests and verify GREEN**

Run:

```bash
cd /root/lezskabot/koishi/koishi-app
node --test plugins/random-answer/test/extractor-toggle.test.js
```

Expected: 3 tests pass, 0 fail.

## Task 4: Add Koishi Administrator Commands

**Files:**
- Modify: `koishi/koishi-app/plugins/random-answer/lib/index.js:862-920`
- Test: `koishi/koishi-app/plugins/random-answer/test/extractor-toggle.test.js`

- [ ] **Step 1: Await controller startup**

Change:

```javascript
const extractor = await startExtractor(ctx, config, dbApi)
```

- [ ] **Step 2: Register idempotent administrator commands**

Add before `设置提取间隔`:

```javascript
ctx.command("开启自动提取", "开启 LLM 定时自动提取（admin）")
  .action(async ({ session }) => {
    if (!await isAdmin(session)) return "需要管理员权限"
    if (!extractor) return "extractor 不可用（请检查 llmEnabled 和 llmApiBase）"
    const changed = await extractor.setAutoEnabled(true)
    return changed ? "自动提取已开启；下次按设定间隔运行" : "自动提取已经处于开启状态"
  })

ctx.command("关闭自动提取", "关闭 LLM 定时自动提取（admin，立即提取仍可用）")
  .action(async ({ session }) => {
    if (!await isAdmin(session)) return "需要管理员权限"
    if (!extractor) return "extractor 不可用（请检查 llmEnabled 和 llmApiBase）"
    const changed = await extractor.setAutoEnabled(false)
    return changed ? "自动提取已关闭；立即提取仍可使用" : "自动提取已经处于关闭状态"
  })
```

- [ ] **Step 3: Make status output unambiguous**

Replace the old `enabled` field in `/提取状态` with:

```javascript
configuredEnabled: Boolean(config.llmEnabled),
extractorAvailable: Boolean(extractor),
autoEnabled: extractor ? extractor.isAutoEnabled() : false,
```

Keep the persisted state, extraction timestamps, and allowed groups in the same response.

- [ ] **Step 4: Run all Koishi checks**

Run:

```bash
cd /root/lezskabot/koishi/koishi-app
node --test plugins/random-answer/test/extractor-toggle.test.js
find plugins/random-answer/lib -type f -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check -- \
  plugins/random-answer/lib/extractor.js \
  plugins/random-answer/lib/index.js \
  plugins/random-answer/test/extractor-toggle.test.js
```

Expected: 3 tests pass, all syntax checks return zero, and `git diff --check` is silent.

- [ ] **Step 5: Commit the Koishi change**

```bash
cd /root/lezskabot
git add \
  koishi/koishi-app/plugins/random-answer/lib/extractor.js \
  koishi/koishi-app/plugins/random-answer/lib/index.js \
  koishi/koishi-app/plugins/random-answer/test/extractor-toggle.test.js
git commit -m "feat(random-answer): add automatic extraction toggle"
```

## Task 5: Add the AstrBot Failing Regression Test

**Files:**
- Create: `AstrBot/data/plugins/astrbot_plugin_message_stats/test/test_rank_fallback.py`
- Test: `AstrBot/data/plugins/astrbot_plugin_message_stats/test/test_rank_fallback.py`

- [ ] **Step 1: Write the failing async test**

```python
import unittest

from data.plugins.astrbot_plugin_message_stats.main import MessageStatsPlugin
from data.plugins.astrbot_plugin_message_stats.utils.models import (
    GroupInfo,
    PluginConfig,
    UserData,
)


class FakeEvent:
    """Provide the result method used by the rank renderer."""

    def plain_result(self, text: str):
        return ("plain", text)


class EmptyImageGenerator:
    """Simulate the safety decorator returning no image path."""

    async def generate_rank_image(self, *args, **kwargs):
        return None


class RankFallbackTest(unittest.IsolatedAsyncioTestCase):
    async def test_empty_image_path_falls_back_to_text(self):
        plugin = MessageStatsPlugin.__new__(MessageStatsPlugin)
        plugin.image_generator = EmptyImageGenerator()
        plugin._generate_text_message = lambda *args: "text fallback"
        plugin._schedule_file_cleanup = lambda *args: None

        users = [(UserData(user_id="1", nickname="tester", message_count=3), 3)]
        config = PluginConfig()
        results = [
            result
            async for result in plugin._render_rank_as_image(
                FakeEvent(),
                users,
                GroupInfo(group_id="10000", group_name="test"),
                "test rank",
                "1",
                config,
                None,
                None,
            )
        ]

        self.assertEqual(results, [("plain", "text fallback")])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd /root/lezskabot/AstrBot
venv/bin/python -m unittest discover \
  -s data/plugins/astrbot_plugin_message_stats/test \
  -p 'test_*.py' -v
```

Expected: FAIL or ERROR with `TypeError: stat: path should be string, bytes, os.PathLike or integer, not NoneType`.

## Task 6: Fix AstrBot's Falsey Image Path Fallback

**Files:**
- Modify: `AstrBot/data/plugins/astrbot_plugin_message_stats/main.py:1827-1840`
- Test: `AstrBot/data/plugins/astrbot_plugin_message_stats/test/test_rank_fallback.py`

- [ ] **Step 1: Guard the generated image path**

Change the success branch to:

```python
temp_path = await self.image_generator.generate_rank_image(
    users_for_image,
    group_info,
    title,
    current_user_id,
    llm_token_usage,
    titles_map,
)

if temp_path and os.path.exists(temp_path):
    yield event.image_result(str(temp_path))
    self._schedule_file_cleanup(str(temp_path))
else:
    text_msg = self._generate_text_message(
        filtered_data,
        group_info,
        title,
        config,
    )
    yield event.plain_result(text_msg)
```

Do not change the message-stat data files or exception classifications elsewhere.

- [ ] **Step 2: Run the regression test and verify GREEN**

Run:

```bash
cd /root/lezskabot/AstrBot
venv/bin/python -m unittest discover \
  -s data/plugins/astrbot_plugin_message_stats/test \
  -p 'test_*.py' -v
```

Expected: 1 test passes, 0 failures.

- [ ] **Step 3: Run syntax and diff checks**

```bash
cd /root/lezskabot/AstrBot
venv/bin/python - <<'PY'
import ast
from pathlib import Path

root = Path('data/plugins/astrbot_plugin_message_stats')
files = list(root.rglob('*.py'))
for path in files:
    ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
print(f'parsed={len(files)}')
PY
cd /root/lezskabot
git diff --check -- \
  AstrBot/data/plugins/astrbot_plugin_message_stats/main.py \
  AstrBot/data/plugins/astrbot_plugin_message_stats/test/test_rank_fallback.py
```

Expected: every Python file parses and `git diff --check` is silent.

- [ ] **Step 4: Commit the AstrBot change**

```bash
cd /root/lezskabot
git add \
  AstrBot/data/plugins/astrbot_plugin_message_stats/main.py \
  AstrBot/data/plugins/astrbot_plugin_message_stats/test/test_rank_fallback.py
git commit -m "fix(message-stats): fall back when image generation fails"
```

## Task 7: Install and Verify Playwright Chromium

**Files:**
- Environment: `/root/.cache/ms-playwright/`

- [ ] **Step 1: Record disk usage**

```bash
df -h /
du -sh /root/.cache/ms-playwright 2>/dev/null || true
```

Expected: at least 1 GiB available before download. Stop if available space has fallen below 1 GiB.

- [ ] **Step 2: Install only Chromium**

```bash
cd /root/lezskabot/AstrBot
venv/bin/playwright install chromium
```

Expected: Chromium and the required Playwright support binaries are installed without downloading Firefox or WebKit.

- [ ] **Step 3: Launch Chromium in isolation**

```bash
cd /root/lezskabot/AstrBot
venv/bin/python - <<'PY'
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        page = await browser.new_page()
        await page.set_content('<h1>message-stats</h1>')
        assert await page.text_content('h1') == 'message-stats'
        await browser.close()

asyncio.run(main())
print('chromium launch: ok')
PY
df -h /
du -sh /root/.cache/ms-playwright
```

Expected: `chromium launch: ok`, with sufficient disk space remaining.

## Task 8: Restart Screen Services Without Deleting Database WAL Files

**Files:**
- Runtime: existing `astr` and `koishi` screen sessions

- [ ] **Step 1: Gracefully restart Koishi in its required directory**

```bash
screen -S koishi -p 0 -X stuff $'\003'
for _ in $(seq 1 20); do
  pgrep -f '/root/lezskabot/koishi/koishi-app/node_modules/.bin/koishi start' >/dev/null || break
  sleep 1
done
screen -S koishi -X quit 2>/dev/null || true
screen -dmS koishi bash -c 'cd /root/lezskabot/koishi/koishi-app && [ -f .env ] && set -a && . ./.env && set +a; exec npm start 2>&1 | tee /tmp/koishi_restart.log'
```

Expected: screen session `koishi` runs `npm start` with working directory `/root/lezskabot/koishi/koishi-app`.

- [ ] **Step 2: Gracefully restart AstrBot without `restart_astr.sh`**

```bash
screen -S astr -p 0 -X stuff $'\003'
for _ in $(seq 1 20); do
  pgrep -f '/root/lezskabot/AstrBot/.*python main.py|python main.py' >/dev/null || break
  sleep 1
done
screen -S astr -X quit 2>/dev/null || true
screen -dmS astr bash -c 'cd /root/lezskabot/AstrBot && exec venv/bin/python main.py'
```

Do not run `restart_astr.sh`; its current user modification deletes SQLite WAL/SHM files and contains a local credential.

- [ ] **Step 3: Verify both services**

```bash
sleep 15
screen -ls
pgrep -af '/root/lezskabot/koishi/koishi-app/node_modules/.bin/koishi start|node_modules/koishi/lib/worker'
pgrep -af 'python main.py'
curl -sS -o /dev/null -w 'koishi=%{http_code}\n' http://127.0.0.1:5140/
curl -sS -o /dev/null -w 'astrbot=%{http_code}\n' http://127.0.0.1:6185/
grep -E 'Error|Exception|failed|自动提取|extractor' /tmp/koishi_restart.log | tail -n 60 || true
```

Expected: both screen sessions are detached, both worker processes exist, and both HTTP endpoints return 200.

## Task 9: Production-Level Verification

**Files:**
- Read: live process state and logs
- Temporary: a generated PNG under `/tmp`, deleted after validation

- [ ] **Step 1: Re-run all automated checks**

```bash
cd /root/lezskabot/koishi/koishi-app
node --test plugins/random-answer/test/extractor-toggle.test.js
cd /root/lezskabot/AstrBot
venv/bin/python -m unittest discover \
  -s data/plugins/astrbot_plugin_message_stats/test \
  -p 'test_*.py' -v
```

Expected: 4 total tests pass across the two commands.

- [ ] **Step 2: Verify real message-stat data remains valid and current**

```bash
cd /root/lezskabot/AstrBot
venv/bin/python - <<'PY'
import json
from pathlib import Path

root = Path('data/plugin_data/message_stats/groups')
files = list(root.glob('*.json'))
for path in files:
    value = json.loads(path.read_text(encoding='utf-8'))
    assert str(value['group_id']) == path.stem
    assert isinstance(value['users'], list)
print(f'valid_group_files={len(files)}')
PY
```

Expected: 27 valid group files; no file is rewritten by this check.

- [ ] **Step 3: Generate a real-data leaderboard image locally**

Run an isolated check that does not send a QQ message or print user records:

```bash
cd /root/lezskabot/AstrBot
venv/bin/python - <<'PY'
import asyncio
import json
from pathlib import Path

from data.plugins.astrbot_plugin_message_stats.utils.image_generator import ImageGenerator
from data.plugins.astrbot_plugin_message_stats.utils.models import GroupInfo, PluginConfig, UserData


async def main():
    groups_dir = Path('data/plugin_data/message_stats/groups')
    source = max(groups_dir.glob('*.json'), key=lambda path: path.stat().st_mtime)
    payload = json.loads(source.read_text(encoding='utf-8'))
    users = [UserData.from_dict(item) for item in payload['users']]
    users.sort(key=lambda user: user.message_count, reverse=True)
    users = users[:25]
    for user in users:
        user.display_total = user.message_count

    config = PluginConfig()
    config.theme = 'liquid_glass'
    generator = ImageGenerator(config)
    image_path = None
    try:
        await generator.initialize()
        image_path = await generator.generate_rank_image(
            users,
            GroupInfo(group_id=source.stem, group_name='validation'),
            'validation rank',
        )
        assert image_path
        output = Path(image_path)
        assert output.exists()
        assert output.stat().st_size > 0
        assert output.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'
        print('message-stats image: ok')
    finally:
        await generator.cleanup()
        if image_path:
            Path(image_path).unlink(missing_ok=True)


asyncio.run(main())
PY
```

Expected output:

```text
message-stats image: ok
```

- [ ] **Step 4: Verify Git scope**

```bash
cd /root/lezskabot
git status --short -- \
  koishi/koishi-app/plugins/random-answer \
  AstrBot/data/plugins/astrbot_plugin_message_stats \
  docs/superpowers
git log -3 --oneline
```

Expected: scoped code and tests are clean. Runtime data changes elsewhere remain untouched. The latest commits are the design, Koishi feature, and message-stats fix.

## Rollback

If Koishi fails verification:

```bash
cp /root/lezskabot/backups/codex_20260808_extractor_stats/extractor.js \
  /root/lezskabot/koishi/koishi-app/plugins/random-answer/lib/extractor.js
cp /root/lezskabot/backups/codex_20260808_extractor_stats/index.js \
  /root/lezskabot/koishi/koishi-app/plugins/random-answer/lib/index.js
```

If AstrBot fails verification:

```bash
cp /root/lezskabot/backups/codex_20260808_extractor_stats/main.py \
  /root/lezskabot/AstrBot/data/plugins/astrbot_plugin_message_stats/main.py
```

After restoring, repeat only the affected service's screen restart step. Do not reset the repository or restore runtime data.
