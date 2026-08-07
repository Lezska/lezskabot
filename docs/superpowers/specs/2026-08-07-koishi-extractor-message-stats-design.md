# Koishi Extractor Toggle and Message Stats Recovery Design

## Scope

This change covers two production services in `/root/lezskabot`:

1. Add a persistent runtime switch for Koishi random-answer automatic LLM extraction.
2. Restore AstrBot message-stats image rankings by installing Playwright Chromium and fixing the image-to-text fallback path.

No message-stat records, word database entries, API credentials, or unrelated plugins will be changed.

## Koishi Automatic Extraction Toggle

### Commands

Add two administrator-only commands to `koishi/koishi-app/plugins/random-answer/lib/index.js`:

- `/开启自动提取`
- `/关闭自动提取`

The commands use the plugin's existing `isAdmin(session)` authorization check. Repeating the command for the current state is idempotent and reports that the requested state is already active.

`/立即提取` remains available to administrators while automatic extraction is disabled.

### Persistent State

Extend `data/random-answer/extractor-state.json` with:

```json
{
  "autoEnabled": true
}
```

Existing state files without `autoEnabled` default to `true`, preserving current behavior. `llmEnabled` in `koishi.yml` remains the master capability switch; the runtime command does not override a disabled master configuration.

### Scheduler Behavior

The extractor controller will expose its automatic state and methods to enable or disable scheduling:

- Enabling automatic extraction persists `autoEnabled=true` and starts the interval timer.
- Enabling does not immediately call the LLM. Administrators can use `/立即提取` when an immediate run is wanted.
- Disabling persists `autoEnabled=false`, clears the interval timer, and cancels the pending startup extraction.
- An extraction already in progress is allowed to finish; subsequent automatic runs are prevented.
- Changing the interval while disabled persists the new interval without starting the timer.
- On Koishi startup, a persisted disabled state prevents both the interval timer and the five-second startup extraction.

`/提取状态` will distinguish the configured master capability from `autoEnabled` and continue reporting the last extraction time and interval.

### Koishi Deployment

Koishi remains a detached screen service named `koishi`. Its working directory and command are:

```bash
cd /root/lezskabot/koishi/koishi-app
npm start
```

The restart wrapper must preserve the existing `.env` loading and `/tmp/koishi_restart.log` logging behavior.

## AstrBot Message Stats Recovery

### Confirmed Root Cause

The message-stat JSON files are valid and internally consistent. Current data continues to receive messages.

The active AstrBot plugin configuration requests image output. The Python Playwright package is installed, but its Chromium executable is absent. `generate_rank_image()` therefore returns `None` through its safety decorator. `_render_rank_as_image()` passes that value to `os.path.exists()`, which raises `TypeError`; the outer handler then incorrectly replies with `数据格式错误，请联系管理员`.

### Environment Repair

Install Chromium using the Playwright executable from the AstrBot virtual environment:

```bash
cd /root/lezskabot/AstrBot
venv/bin/playwright install chromium
```

Check disk space before and after installation. Do not install unrelated browsers.

### Code Fallback

Update `_render_rank_as_image()` so a falsey image path is treated as image-generation failure and returns the existing text leaderboard. It must never call `os.path.exists()` with `None`.

This fallback remains necessary after Chromium installation because browser launch, template rendering, and screenshot generation can fail independently.

### AstrBot Deployment

Validate Chromium launch before restarting AstrBot. Restart AstrBot using the existing detached `screen` workflow and verify:

- the `astr` screen session is present;
- `python main.py` is running;
- `/发言榜` data preparation succeeds;
- an image file can be generated from real message-stat data;
- the fallback test succeeds when the generator returns no path.

## Testing

### Koishi

Use Node's built-in `node:test` runner without adding dependencies. Tests cover:

- missing `autoEnabled` defaults to enabled;
- disabling clears automatic scheduling and persists across controller recreation;
- enabling restarts scheduling without running extraction immediately;
- manual extraction remains callable while automatic extraction is disabled;
- interval changes while disabled do not start scheduling.

Run syntax checks for all custom random-answer JavaScript files after the tests.

### AstrBot

Use Python's built-in `unittest` and a lightweight fake event/image generator. The regression test first demonstrates that a `None` image path currently raises `TypeError`, then verifies the fixed method yields the text fallback.

Also run an isolated Playwright Chromium launch check and parse all message-stats Python files with `ast.parse`.

## Safety and Rollback

- Back up each production file immediately before replacement.
- Do not modify message-stat JSON data or the random-answer word database.
- Do not expose `.env`, LLM keys, QQ tokens, or AstrBot bearer tokens in logs or commits.
- Keep existing user changes outside the scoped files.
- If service verification fails, restore only the scoped backups and restart the affected screen session.
