// LLM-driven phrase extractor for random-answer.
//
// Pulls recent messages from whitelisted groups via the group-memory
// service, asks an LLM to extract short fun phrases (1–N chars),
// deduplicates, and adds them to the word DB.
//
// State:
//   <dataDir>/extractor-state.json       — { lastExtractionTs, intervalMin }
//   <dataDir>/extraction-archive/<ts>.json — optional per-run debug archive
//
// LLM contract: Anthropic-compatible Messages API.
//   POST {apiBase}/v1/messages
//   Headers: x-api-key, anthropic-version: 2023-06-01, content-type
//   Body: { model, max_tokens, system, messages: [{role, content}] }
//   Response: { content: [{type: "text", text: "..."}] }
// We also accept OpenAI-compatible /chat/completions if the URL does
// not contain "/anthropic" — auto-detected per call.

const fs = require("fs/promises")
const path = require("path")

const SYSTEM_PROMPT = `你是一个群聊语料整理助手。给定一段时间内某些 QQ 群的聊天记录，从里面提取适合作为"群友随机回复"使用的短句。

严格要求：
- 每条 1-15 个字（中文按字计，标点 / Emoji / 字母 / 数字都算 1 字）
- 单句，不带 @、URL、图片描述、表情包描述
- 语气轻松、好玩、像群友口吻（不要太书面）
- 输出格式：每行一条纯文字，不要编号、不要项目符号、不要解释
- 不要重复已经给出的句子
- 数字短句（如 666、233、88）也算合法短语，请保留
- 尽量给 30-50 条，覆盖群里不同用户的口吻
- **禁止输出任何群成员昵称 / 群名片 / 用户名**，即使它们出现在聊天里
- 如果输入里实在没有合适的，输出空行即可

直接输出短句，每行一条。`

async function readState(stateFile) {
  try {
    const raw = await fs.readFile(stateFile, "utf-8")
    return JSON.parse(raw)
  } catch {
    return { lastExtractionTs: 0, intervalMin: 60 }
  }
}

async function writeState(stateFile, state) {
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2))
}

async function fetchMessages(ctx, gm, groups, sinceTs, limitPerGroup, botIds) {
  const byGroup = {}
  // botIds is a Set of bot user_ids to exclude — bot's own messages
  // shouldn't be mined for "群友梗", only human chatter.
  const excludeSet = botIds instanceof Set ? botIds : new Set(botIds || [])
  for (const gid of groups) {
    try {
      // NOTE: koishi-plugin-group-memory's searchByGroupId uses
      // `orderBy: { id: 'desc' }` which is the WRONG key for minatojs
      // (minatojs reads `sort`, silently ignoring `orderBy`). Result:
      // searchByGroupId returns the OLDEST messages for the group,
      // making any timestamp-based filter return zero new items.
      // Workaround: call ctx.database.get directly with the correct
      // `sort: { id: 'desc' }` cursor option.
      let msgs = []
      if (ctx.database?.get) {
        msgs = await ctx.database.get(
          'group_memory_messages',
          { group_id: String(gid) },
          {
            fields: ['id', 'session_id', 'session_type', 'user_id', 'user_name', 'role', 'content', 'timestamp'],
            sort: { id: 'desc' },
            limit: limitPerGroup,
          }
        )
      } else if (gm?.searchByGroupId) {
        // Fallback to the buggy upstream helper. Will return oldest-first
        // messages and the timestamp filter will reject them all.
        // (See note above on the minatojs cursor key issue.)
        msgs = await gm.searchByGroupId(String(gid), limitPerGroup)
      }
      byGroup[String(gid)] = (msgs || [])
        .filter(m => (m.timestamp || 0) >= sinceTs)
        .filter(m => {
          const uid = String(m.user_id || "")
          return !excludeSet.has(uid)
        })
    } catch (e) {
      ctx.logger("random-answer").warn(`fetch group ${gid} failed: ${e.message}`)
      byGroup[String(gid)] = []
    }
  }
  return byGroup
}

function buildUserPrompt(byGroup, maxTotal) {
  const lines = []
  let total = 0
  for (const [gid, msgs] of Object.entries(byGroup)) {
    if (msgs.length === 0) continue
    lines.push(`【群 ${gid}】`)
    for (const m of msgs) {
      if (total >= maxTotal) break
      const t = new Date(m.timestamp || Date.now())
      const hh = t.getHours().toString().padStart(2, "0")
      const mm = t.getMinutes().toString().padStart(2, "0")
      // NOTE: previously emitted `[HH:MM] name: content`. Names were
      // leaking into the LLM feed, and the model would copy them out as
      // "phrases" → word DB polluted with nicknames like "Oxygen", "nene".
      // Strip the sender label entirely; the LLM only needs the content.
      const content = (m.content || "").slice(0, 200)
      lines.push(`[${hh}:${mm}] ${content}`)
      total++
    }
    if (total >= maxTotal) break
  }
  return lines.join("\n")
}

function parsePhrases(raw, nicknames, opts) {
  if (!raw) return []
  // Range bounds are config-driven (defaults 1..10) so extending
  // `llmMaxWordLen` past 10 here requires no code change.
  const minLen = (opts && opts.minLen) || 1
  const maxLen = (opts && opts.maxLen) || 10
  // Build a banned set. We do BOTH:
  //   (a) exact-match: a phrase that IS a nickname → drop
  //   (b) substring: a phrase that CONTAINS a nickname (e.g. "谢谢若离",
  //       "若离太富了") → drop. The LLM occasionally surfaces
  //       sentence + @mention composites even after we strip the
  //       prompt's name prefix and tell it not to ignore nicknames; this is
  //       the last-line safety net. Substring matching on a 2-char
  //       Chinese name risks false positives for very common names
  //       (like "无" inside "无敌"), so we skip banned tokens shorter
  //       than 2 chars from the substring pass.
  const exact = new Set()
  const sub = []
  for (const n of (nicknames || [])) {
    if (!n) continue
    const t = String(n).trim()
    if (!t) continue
    exact.add(t)
    exact.add(t.toLowerCase())
    if ([...t].length >= 2) sub.push(t.toLowerCase())
  }
  function containsNickname(phraseLower) {
    for (const n of sub) {
      if (n.length < 2) continue
      if (phraseLower.includes(n)) return true
    }
    return false
  }
  return raw.split(/\r?\n/)
    .map(l => l.replace(/^[\s\-•·*.()【】、，。：:]+/, "").trim())
    // Strip zero-width / non-printable characters that have historically
    // slipped into LLM output and caused length-mismatched buckets (the
    // plugin's `[...str].length` counts ZWSP/ZWNJ/etc as one char each,
    // but the user sees them as nothing). The chars themselves never
    // appear in real QQ messages — they only show up in the model's
    // output stream.
    .map(l => l.replace(/[\u200B-\u200D\uFEFF\u2060]/g, ""))
    // Length filter using CODE POINTS (`[...l].length`) to stay consistent
    // with `countChars` in the main plugin — JS string `.length` is
    // UTF-16 code units and counts surrogate-pair emojis like 😭 as 2
    // chars, which would mis-bucket the phrase relative to how
    // `addWord` later measures it. Range bounds come from config.
    .filter(l => {
      const n = [...l].length
      return n >= minLen && n <= maxLen
    })
    // Drop anything still containing an @-mention or URL fragment.
    .filter(l => !/@[\S]+/.test(l) && !/https?:\/\//.test(l))
    // Exact match: phrase IS a nickname.
    .filter(l => !exact.has(l) && !exact.has(l.toLowerCase()))
    // Substring match: phrase contains a nickname as a substring. Last-line
    // safety net for the LLM producing sentence+mention composites.
    .filter(l => !containsNickname(l.toLowerCase()))
}

// Pull every member's display name from each allowed group via the
// onebot adapter's getGuildMemberList (same call random-answer's 谁
// keyword uses). On failure or per-group skip, fall back to the names
// already seen in the messages we just fetched — partial coverage is
// still better than no coverage.
async function collectNicknames(ctx, allowedGroups, byGroup) {
  const set = new Set()
  // Try the adapter API per group with a short timeout so a flaky
  // onebot connection doesn't stall the whole extractor.
  for (const gid of allowedGroups) {
    try {
      const bot = ctx.bots?.values?.() ? Array.from(ctx.bots)[0]?.[1] : null
      // ctx.bots is iterable as [platform, bot] entries — pick the first.
      if (!bot || typeof bot.getGuildMemberList !== "function") continue
      const r = await Promise.race([
        bot.getGuildMemberList(String(gid)),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ])
      const list = r?.data ?? r
      if (!Array.isArray(list)) continue
      for (const m of list) {
        const user = m.user || m
        const names = [m.card, m.nickname, user.nick, user.name]
        for (const n of names) {
          if (n && typeof n === "string" && n.trim()) set.add(n.trim())
        }
      }
    } catch (_) {
      // best-effort; fall through to the message-sourced names
    }
    // Always also pull names from the messages we already have for this
    // group — covers nicknames the bot API didn't return, and works even
    // when the API fails.
    for (const m of (byGroup[String(gid)] || [])) {
      if (m.user_name) set.add(String(m.user_name).trim())
      // Also pick up names embedded inside the message content itself
      // (QQ often renders @-mentions as `<at id="..." name="Check"/>`).
      // Without this, mention targets' nicknames leak into the LLM
      // feed even though we strip the sender label.
      const c = String(m.content || "")
      const atRe = /\bat\s+[^>]*?\bname\s*=\s*["']([^"']+)["']/gi
      let am
      while ((am = atRe.exec(c)) !== null) {
        const v = am[1].trim()
        if (v) set.add(v)
      }
    }
  }
  // Drop empty / pure-whitespace / pure-number entries (those are usually
  // QQ ids being rendered as display names by the adapter; filtering them
  // avoids accidentally blocking legitimate digit phrases like "666").
  const out = []
  for (const n of set) {
    if (!n) continue
    if (/^\d+$/.test(n)) continue
    if (n.length < 2) continue
    out.push(n)
  }
  return out
}
// Anything else → OpenAI-compatible /chat/completions.
function detectFormat(apiBase) {
  return /\/anthropic(\/|$)/i.test(apiBase) ? "anthropic" : "openai"
}

async function callAnthropic(ctx, apiBase, apiKey, model, systemMsg, userMessages, timeoutMs) {
  const url = `${apiBase.replace(/\/+$/, "")}/v1/messages`
  // NOTE: koishi's ctx.http.post / .patch / .put unwrap `response.data`
  // and return the body directly (see @cordisjs/plugin-http index.cjs
  // post() wrapper around line 182). So `data` here IS the parsed JSON.
  const data = await ctx.http.post(url, {
    model,
    max_tokens: 2048,
    system: systemMsg,
    messages: userMessages,
  }, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    timeout: timeoutMs,
  })
  if (data?.type === "error" || data?.error) {
    const msg = data?.error?.message || JSON.stringify(data?.error || data)
    throw new Error(`LLM API error: ${msg}`)
  }
  const blocks = data?.content || []
  return blocks.filter(b => b.type === "text").map(b => b.text).join("\n")
}

async function callOpenAI(ctx, apiBase, apiKey, model, messages, timeoutMs) {
  const url = `${apiBase.replace(/\/+$/, "")}/chat/completions`
  const res = await ctx.http.post(url, {
    model,
    messages,
    temperature: 0.9,
    max_tokens: 2048,
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: timeoutMs,
  })
  if (res.data?.error) {
    throw new Error(`LLM API error: ${res.data.error.message || JSON.stringify(res.data.error)}`)
  }
  return res.data?.choices?.[0]?.message?.content || ""
}

async function callLLM(ctx, config, messages, retries) {
  const format = detectFormat(config.llmApiBase)
  let lastErr = null
  for (let i = 0; i < retries; i++) {
    try {
      const apiKey = config.llmApiKey
        || (config.llmApiKeyEnv ? process.env[config.llmApiKeyEnv] : "")
      if (!apiKey) {
        throw new Error(`llmApiKey 未配置（config.llmApiKey 为空且 env ${config.llmApiKeyEnv || "(unset)"} 不存在）`)
      }

      let raw
      if (format === "anthropic") {
        const systemMsg = messages.find(m => m.role === "system")?.content || ""
        const userMessages = messages.filter(m => m.role !== "system")
        raw = await callAnthropic(ctx, config.llmApiBase, apiKey, config.llmModel, systemMsg, userMessages, 60000)
      } else {
        raw = await callOpenAI(ctx, config.llmApiBase, apiKey, config.llmModel, messages, 60000)
      }
      return raw
    } catch (e) {
      lastErr = e
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, (i + 1) * 2000))
      }
    }
  }
  throw lastErr
}

async function archiveRun(archiveDir, ts, byGroup, prompt, raw, phrases, added) {
  try {
    await fs.mkdir(archiveDir, { recursive: true })
    await fs.writeFile(
      path.join(archiveDir, `${ts}.json`),
      JSON.stringify({ ts, byGroup, prompt, raw, phrases, added }, null, 2)
    )
  } catch (_) {
    // archive failure shouldn't kill the run
  }
}

async function runExtraction(ctx, config, dbApi) {
  const logger = ctx.logger("random-answer")
  const dataDir = config.dataDir
  const stateFile = path.join(dataDir, "extractor-state.json")
  const archiveDir = path.join(dataDir, "extraction-archive")

  const state = await readState(stateFile)
  const sinceTs = state.lastExtractionTs || 0
  const now = Date.now()

  const allowedGroups = (config.llmAllowedGroups || []).map(String).filter(Boolean)
  if (allowedGroups.length === 0) {
    return { skipped: true, reason: "llmAllowedGroups 为空" }
  }

  // Read group-memory table directly via the koishi database API.
  // We bypass koishi-plugin-group-memory's `searchByGroupId` helper
  // because it passes `orderBy` (silently ignored by minatojs — it
  // reads `sort`), making the helper return the OLDEST messages and
  // the timestamp filter below reject everything.
  // The service is still required (we depend on its table existing
  // and its middleware recording messages); if not present, skip.
  if (!ctx.database?.get) {
    return { skipped: true, reason: "ctx.database.get 不可用" }
  }
  const gm = ctx["group-memory"] // optional, used only as fallback
  // Touching ctx["group-memory"] logs a koishi warning if the service
  // wasn't declared in `inject`. Guard so we don't trigger it when
  // we have the working database path.
  void gm

  // Discover bot user_ids from ctx.bots so we filter the bot's own
  // messages out of the LLM feed. Also let user-supplied config
  // llmBotIds override / supplement (useful if multiple bots).
  const botIds = new Set()
  try {
    const bots = ctx.bots || []
    for (const b of bots) {
      if (b?.selfId != null) botIds.add(String(b.selfId))
      if (b?.userId != null) botIds.add(String(b.userId))
      if (b?.uid != null) botIds.add(String(b.uid))
    }
  } catch (_) {}
  for (const id of (config.llmBotIds || [])) botIds.add(String(id))

  const byGroup = await fetchMessages(ctx, gm, allowedGroups, sinceTs, config.llmMaxMessagesPerRun, botIds)
  const totalMsgs = Object.values(byGroup).reduce((s, arr) => s + arr.length, 0)

  if (totalMsgs === 0) {
    state.lastExtractionTs = now
    await writeState(stateFile, state)
    return { skipped: true, reason: "本轮无新消息", groups: Object.keys(byGroup) }
  }

  // Build a nickname allow-block from each allowed group's member list so
  // parsePhrases can drop any LLM output that matches a member's
  // card / nickname / nick / name. We grab this via the onebot adapter's
  // getGuildMemberList (same API random-answer's 谁 keyword uses). On
  // failure we fall back to the names already seen in the messages
  // themselves — partial coverage is still better than nothing.
  const nicknames = await collectNicknames(ctx, allowedGroups, byGroup)

  const prompt = buildUserPrompt(byGroup, config.llmMaxMessagesPerRun)

  let raw
  try {
    raw = await callLLM(ctx, config, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ], Math.max(1, config.llmMaxRetries))
  } catch (e) {
    logger.error(`LLM 调用失败（已重试 ${config.llmMaxRetries} 次）: ${e.message}`)
    // Don't bump lastExtractionTs — next round will retry these messages.
    return { error: e.message, keptTs: sinceTs, processed: totalMsgs }
  }

  const phrases = parsePhrases(raw, nicknames, {
    minLen: config.llmMinWordLen,
    maxLen: config.llmMaxWordLen,
  })
  const added = []
  for (const p of phrases) {
    if (dbApi.has(p)) continue
    const len = [...p].length
    if (len < config.llmMinWordLen || len > config.llmMaxWordLen) continue
    const ok = await dbApi.add(p)
    if (ok) added.push(p)
  }

  state.lastExtractionTs = now
  await writeState(stateFile, state)

  if (config.llmArchiveRaw) {
    await archiveRun(archiveDir, now, byGroup, prompt, raw, phrases, added)
  }

  return {
    processed: totalMsgs,
    extracted: phrases.length,
    added: added.length,
    addedWords: added,
  }
}

function startExtractor(ctx, config, dbApi) {
  if (!config.llmEnabled) return null
  if (!config.llmApiBase) {
    ctx.logger("random-answer").warn("llmEnabled=true 但 llmApiBase 未配置，跳过 extractor 启动")
    return null
  }

  let timer = null
  const dataDir = config.dataDir
  const stateFile = path.join(dataDir, "extractor-state.json")

  const schedule = (intervalMin) => {
    if (timer) clearInterval(timer)
    const ms = Math.max(1, Number(intervalMin) || 60) * 60 * 1000
    timer = setInterval(() => {
      runExtraction(ctx, config, dbApi).then(result => {
        ctx.logger("random-answer").info("extractor run: " + JSON.stringify(result))
      }).catch(e => {
        ctx.logger("random-answer").error("extractor run failed: " + (e?.stack || e))
      })
    }, ms)
    ctx.logger("random-answer").info(`extractor 已启动，间隔 ${intervalMin} 分钟`)
  }

  schedule(config.llmIntervalMin)

  // Fire one extraction immediately on startup so accumulated messages
  // since the last run don't have to wait a full interval cycle. The
  // scheduled timer still handles subsequent runs at regular intervals.
  setTimeout(() => {
    runExtraction(ctx, config, dbApi).then(result => {
      ctx.logger("random-answer").info("extractor run (startup): " + JSON.stringify(result))
    }).catch(e => {
      ctx.logger("random-answer").error("extractor startup run failed: " + (e?.stack || e))
    })
  }, 5000)

  return {
    runNow: () => runExtraction(ctx, config, dbApi),
    setInterval: async (min) => {
      const m = Math.max(1, Number(min) || 60)
      config.llmIntervalMin = m
      schedule(m)
      const s = await readState(stateFile)
      s.intervalMin = m
      await writeState(stateFile, s)
    },
    stop: () => { if (timer) clearInterval(timer); timer = null },
  }
}

module.exports = { runExtraction, startExtractor, readState, detectFormat }