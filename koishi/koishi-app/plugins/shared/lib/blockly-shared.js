// Source: extracted from koishi-plugin-sign-bot + koishi-plugin-gacha-bot
// (originally blockly-generated code, 2026-06-27 refactor)
//
// Shared helpers for all blockly-derived plugins in this app.
// Provides:
//   - createHelpers(ctx, config): factory for ctx-bound helper functions
//   - parseRarity(s): '3星'/'三星'/... -> 1|2|3|4|0
//   - rollRarity(config): returns 1-4 by probability
//   - Constants (POINTS_NS, BUILTIN_KEYS, ...)

const { Schema, h } = require("koishi")

// Points / P点 namespace — both sign-bot and gacha-bot write here.
// Originally sign-bot was hardcoded as `var 每日签到 = '每日签到'` and
// gacha-bot's `var 积分系统UUID = '每日签到'` referenced the same prefix.
const POINTS_NS = "每日签到"

// Built-in key suffixes. Per-user: <NS>.<userId><suffix>
const SUFFIX = {
  points: "的P点",
  signDate: "签到日期",
  signCache: "的P点缓存",          // bonus stored on next sign-in
  signAt: "的签到时间",           // legacy, unused after refactor
  robCount: "的抢劫次数",
  robDate: "抢劫日期",
  robLastReset: "的抢劫上次恢复", // timestamp (ms) of last rob count replenishment
  robNet: "的抢劫记录",           // net P gained/lost today
  sendDate: "送p点日期",
  sendToday: "今日赠送p点",
  recvDate: "收p点日期",
  recvToday: "今日收到p点",
  pity: "的抽卡保底",                // 4星/FES pity counter (resets on 4星/FES)
}

// Pure helpers (no ctx needed) --------------------------------------

// Parse rarity alias. Accepts:
//   - '3星' / '三星' / '3' / '三' (case-insensitive on the digit too)
//   - 'fes' / 'FES' / 'Fes' / '5星' / '五星' / '5' / '五' / 'ssr' / 'ur'
// Returns 1..4 for valid, 0 for unknown.
function parseRarity(s) {
  if (s == null) return 0
  const t = String(s).trim()
  if (!t) return 0
  // Strip "星"/"卡" suffix and lowercase for matching
  const u = t.replace(/[星卡]/g, "").toLowerCase()
  if (u === "fes" || u === "5" || u === "五" || u === "ssr" || u === "ur") return 4
  if (u === "4" || u === "四") return 4
  if (u === "3" || u === "三") return 3
  if (u === "2" || u === "二") return 2
  return 0
}

function rarityName(r, config) {
  const arr = config.rarityNames || ["☆二星★", "❀三星☄", "♔♕四星(?)♕♔", "☂FES☃"]
  return arr[r - 1] || `R${r}`
}

// Roll a rarity by cumulative probability. config.drawThresholds: [t1, t2, t3, t4=1000]
// Default 70% / 24% / 5% / 1% (1000 base)
function rollRarity(rng, config) {
  const t = config.drawThresholds || [700, 940, 990, 1000]
  const r = rng(1, t[3] || 1000)
  if (r <= t[0]) return 1
  if (r <= t[1]) return 2
  if (r <= t[2]) return 3
  return 4
}

// Ctx-bound helpers ------------------------------------------------

function createHelpers(ctx, config) {
  // Resolve admin / privileged / bot sets.
  // For bot IDs, we gather from THREE sources because session.selfId
  // can be unreliable (e.g. onebot's data.self_id is the bot QQ
  // numerically, but guild/QQ-channel bots use data.self_tiny_id which
  // is a different string; the at-target.id format also varies by
  // platform). The robust approach is to enumerate every bot in ctx.bots
  // and grab both selfId and userId from each.
  const adminIds = new Set((config.adminIds || []).map(String))
  const privilegedIds = new Set((config.privilegedIds || []).map(String))
  const botSelfIds = new Set()
  for (const bot of ctx.bots) {
    if (!bot) continue
    for (const id of [bot.selfId, bot.userId, bot.platform && `${bot.platform}:${bot.selfId}`]) {
      if (id) botSelfIds.add(String(id))
    }
  }
  for (const id of (config.extraBotIds || [])) {
    botSelfIds.add(String(id))
  }

  function isAdmin(userId) {
    return adminIds.has(String(userId))
  }
  function isPrivileged(userId) {
    return adminIds.has(String(userId)) || privilegedIds.has(String(userId))
  }
  // Resolve the at-target userId from a session's elements
  function atTarget(session) {
    const el = session.elements?.find(e => e.type === "at")
    return el ? String(el.attrs.id) : null
  }
  // Is the at-target a bot? (protects bots from 抢/送/查看)
  function isAtTargetBot(session) {
    const target = atTarget(session)
    if (!target) return false
    return botSelfIds.has(target)
  }
  // Combined: is the at-target self or a protected bot?
  function isSelfOrBot(session) {
    const target = atTarget(session)
    if (!target) return false
    if (target === String(session.userId)) return true  // self
    return botSelfIds.has(target)
  }

  // KV get/set with NaN-safe number handling
  async function kvGet(key, def = null) {
    const row = (await ctx.database.get("blockly_key_value", { key }))[0]
    return row ? row.value : def
  }
  async function kvSet(key, value) {
    await ctx.database.upsert("blockly_key_value", [{ key, value }], ["key"])
  }
  async function kvDel(key) {
    await ctx.database.upsert("blockly_key_value", [{ key, value: null }], ["key"])
  }
  function safeNum(v, def = 0) {
    if (v == null) return def
    const n = Number(v)
    return Number.isFinite(n) ? n : def
  }
  function todayISO() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  function dayOfMonth(date) {
    return Number(todayISO().slice(8, 10))
  }
  function isSameDay(storedISO) {
    if (!storedISO || typeof storedISO !== "string") return false
    return storedISO.slice(0, 10) !== todayISO().slice(0, 10)
  }

  // P点 helpers
  function pointsKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.points}`
  }
  function sendDateKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.sendDate}`
  }
  function sendTodayKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.sendToday}`
  }
  function recvDateKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.recvDate}`
  }
  function recvTodayKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.recvToday}`
  }
  function robDateKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.robDate}`
  }
  function robCountKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.robCount}`
  }
  function robLastResetKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.robLastReset}`
  }
  function robNetKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.robNet}`
  }
  function signDateKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.signDate}`
  }

  async function getPoints(userId) {
    return safeNum(await kvGet(pointsKey(userId)))
  }
  async function addPoints(userId, delta) {
    const cur = await getPoints(userId)
    const next = Math.max(0, cur + delta)
    await kvSet(pointsKey(userId), next)
    return next
  }
  async function setPoints(userId, value) {
    await kvSet(pointsKey(userId), Math.max(0, value | 0))
  }

  // Daily counter helpers (今日赠送p点 / 今日收到p点) — auto-reset on day change
  async function getTodayCounter(userId, baseKey, todayKey) {
    const date = await kvGet(baseKey(userId))
    if (date == null || isSameDay(date)) {
      await kvSet(baseKey(userId), todayISO())
      await kvSet(todayKey(userId), 0)
      return 0
    }
    return safeNum(await kvGet(todayKey(userId)))
  }
  async function addTodayCounter(userId, baseKey, todayKey, delta) {
    const cur = await getTodayCounter(userId, baseKey, todayKey)
    const next = cur + delta
    await kvSet(todayKey(userId), next)
    return next
  }
  // For rob (抢劫): the timer is anchored to the FIRST rob and never
  // moves. Replenishment happens inside setRobCount — every time the
  // user actually robs, we look at how many restoreMs boundaries have
  // passed since lastReset, and add those ticks back to count (capped
  // at maxCount) before persisting. This gives the desired behavior:
  //   - User has 5 robs. Uses one. count=4.
  //   - 30 min later robs again. count=3. (No accrual yet.)
  //   - 1h 5 min after first rob robs again. count=3 (one tick accrued
  //     back), but the diff display still shows ~55min until the next
  //     +1 because lastReset is still pinned to the first rob.
  // getRobState itself does NOT mutate count — it just reads (and on
  // first ever call seeds count=maxCount, lastReset=now).
  async function getRobState(userId) {
    const lastReset = safeNum(await kvGet(robLastResetKey(userId)))
    const maxCount = config.maxRobAttempts ?? 5
    const count = safeNum(await kvGet(robCountKey(userId)))
    if (lastReset === 0) {
      // First time: full count, start the (never-resetting) timer.
      await kvSet(robCountKey(userId), maxCount)
      await kvSet(robLastResetKey(userId), Date.now())
    }

    // net: daily reset (like sendToday/recvToday) — auto-rollover on day change
    const date = await kvGet(robDateKey(userId))
    let net
    if (date == null || !isSameDay(date)) {
      await kvSet(robDateKey(userId), todayISO())
      await kvSet(robNetKey(userId), 0)
      net = 0
    } else {
      net = safeNum(await kvGet(robNetKey(userId)))
    }

    return { count, net }
  }
  // Persist count after a rob. `count` is the value the caller has
  // already computed (= prior count - 1). This fn also handles
  // replenishment: ticks that have passed since the first rob (i.e.
  // lastReset) are added back, capped at maxCount. lastReset itself
  // is intentionally NOT updated — the countdown to the next +1
  // stays anchored to the first rob so the display keeps ticking down
  // even across rapid-fire robs.
  // Persist count after a rob. `count` is the value the caller has
  // already computed (= prior count - 1). This fn also handles
  // replenishment: ticks that have passed since the first rob (i.e.
  // lastReset) are added back. lastReset itself is intentionally NOT
  // updated — the countdown to the next +1 stays anchored to the
  // first rob so the display keeps ticking down even across rapid-fire
  // robs.
  //
  // No hard cap is applied: maxCount is only used as the initial value
  // in getRobState's first-time setup. Admin `设置抢次数` can grant
  // any positive count, and accrual ticks simply add on top.
  //
  // Cooldown model: lastReset is the timestamp of the last *action* (a
  // rob or admin override). Accrual happens lazily in getRobState,
  // capped at maxCount, so a 49h break doesn't dump 49 ticks on the
  // next call. setRobCount always rewrites lastReset=now so two
  // rapid-fire robs don't double-count the cooldown.
  async function setRobCount(userId, count) {
    await kvSet(robCountKey(userId), Math.max(0, count))
    // Only seed lastReset if it has never been set (count just went from
    // 0 to maxCount on first-ever rob).  Once set, leave it alone — it
    // is the anchor for the continuous 1h-per-count recovery timer.
    const existing = await kvGet(robLastResetKey(userId))
    if (!existing) {
      await kvSet(robLastResetKey(userId), Date.now())
    }
  }
  async function setRobNet(userId, net) {
    await kvSet(robNetKey(userId), net)
    // Stamp today's date so the daily-reset in getRobState doesn't fire
    // on the next call and wipe out the freshly-written net.
    await kvSet(robDateKey(userId), todayISO())
  }

  // Next 2h-boundary timestamp at which the user's rob count goes up by
  // 1. Returns null when the timer hasn't started yet or the count is
  // already at maxCount.
  async function getNextRobRefillAt(userId) {
    const lastReset = safeNum(await kvGet(robLastResetKey(userId)))
    if (lastReset === 0) return null
    const count = safeNum(await kvGet(robCountKey(userId)))
    const maxCount = config.maxRobAttempts ?? 5
    if (count >= maxCount) return null
    const restoreMs = (config.robRestoreHours ?? 1) * 3600 * 1000
    const elapsed = Date.now() - lastReset
    const ticks = Math.floor(elapsed / restoreMs)
    return lastReset + (ticks + 1) * restoreMs
  }

  // Format a millisecond duration as "X小时Y分Z秒" with second-level
// precision. Zero-valued leading components are omitted (so 30s
// renders as "30秒", 5m as "5分0秒", 1h 0m 0s as "1小时0分0秒").
// No rounding — what you see is the actual second-accurate remainder
// (Math.floor, so "1分59秒" stays as is until the second ticks over).
  function formatDuration(ms) {
    if (ms <= 0) return "0秒"
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    const parts = []
    if (h > 0) parts.push(`${h}小时`)
    if (h > 0 || m > 0) parts.push(`${m}分`)
    parts.push(`${s}秒`)
    return parts.join("")
  }

  // Pity counter for gacha draws. Increments on every draw attempt;
  // resets to 0 when a 4星 (r=3) or FES (r=4) drops. At pity == 100
  // (the 100th draw), the draw is forced to 4星 or FES.
  function pityKey(userId) {
    return `${POINTS_NS}.${userId}${SUFFIX.pity}`
  }
  async function getPity(userId) {
    return safeNum(await kvGet(pityKey(userId)))
  }
  async function setPity(userId, value) {
    await kvSet(pityKey(userId), Math.max(0, value | 0))
  }
  async function resetPity(userId) {
    await kvSet(pityKey(userId), 0)
  }
  async function getSignDate(userId) {
    return await kvGet(signDateKey(userId))
  }
  async function setSignDate(userId) {
    await kvSet(signDateKey(userId), todayISO())
  }

  // Deck helpers (gacha) — use NS = 插件前缀 (passed in by gacha-bot)
  function deckKey(pluginPrefix, userId, suffix) {
    return `${pluginPrefix}.${userId}${suffix}`
  }
  function parseDeck(s) {
    if (!s) return null
    return String(s).split(",")
  }
  function serializeDeck(arr) {
    return Array.isArray(arr) ? arr.join(",") : ""
  }
  function emptyDeck(size) {
    return new Array(size).fill("0")
  }
  function fillDeckSlots(deck) {
    if (!Array.isArray(deck)) return deck
    for (let i = 0; i < deck.length; i++) {
      if (deck[i] == null) deck[i] = "0"
    }
    return deck
  }
  function findFirstEmpty(deck) {
    if (!Array.isArray(deck)) return -1
    for (let i = 0; i < deck.length; i++) {
      if (deck[i] === "0" || deck[i] == null) return i
    }
    return -1
  }
  function isDeckFull(deck) {
    return findFirstEmpty(deck) === -1
  }

  // Try to auto-fill the first empty slot. Returns { filled, slot, deck }.
  // filled = true if a slot was filled and the caller should return.
  // On success, persists the new deck and clears the gacha cache.
  async function tryAutoFillDeck(pluginPrefix, userId, cardValue) {
    const raw = await kvGet(deckKey(pluginPrefix, userId, "卡组"))
    let deck = parseDeck(raw)
    if (!deck) deck = emptyDeck(config.maxDeckSize || 8)
    deck = fillDeckSlots(deck)
    const slot = findFirstEmpty(deck)
    if (slot === -1) {
      return { filled: false, slot: -1, deck }
    }
    deck[slot] = cardValue
    await kvSet(deckKey(pluginPrefix, userId, "卡组"), serializeDeck(deck))
    await kvDel(deckKey(pluginPrefix, userId, "的抽卡缓存"))
    return { filled: true, slot: slot + 1, deck }
  }

  // Wrap a command action with try/catch — sends a friendly error and
  // logs the underlying cause, instead of letting koishi throw raw.
  async function withErrorBoundary(session, fn, label = "操作") {
    try {
      return await fn()
    } catch (err) {
      ctx.logger("blockly-shared").error(err)
      try {
        await session.send(`${label}失败：${err && err.message ? err.message : err}`)
      } catch (_) {
        // swallow secondary error
      }
      return null
    }
  }

  // Send a merged forward message via raw onebot API (bypasses satorijs
  // encoder so the `user_id` / `nickname` field names reach LLOneBot
  // correctly). The bot is the author of every node; pass an array of
  // node objects, each `{type:'node',data:{user_id,nickname,content:[...]}}`.
  //
  // nodes: Array<{type:'node', data:{user_id:number, nickname:string, content:Array<CQCode>}}>
  // (Use buildHelpNode() to construct each node.)
  async function sendHelpForward(session, nodes) {
    const internal = session.bot?.internal
    if (!internal) throw new Error("session.bot.internal not available")
    const isDirect = session.isDirect
    const channelId = session.event?.channel?.id || session.channelId
    if (isDirect) {
      const peerUid = channelId.startsWith("private:")
        ? channelId.slice("private:".length)
        : String(session.userId)
      await internal.sendPrivateForwardMsg(peerUid, nodes)
    } else {
      await internal.sendGroupForwardMsg(channelId, nodes)
    }
  }

  // Build one node for sendHelpForward. text is a string; the bot is
  // always the author.
  function buildHelpNode(session, text) {
    const botName = session.bot?.user?.name || String(session.selfId) || "bot"
    const botUserId = parseInt(session.selfId) || 0
    return {
      type: "node",
      data: {
        user_id: botUserId,
        nickname: botName,
        content: [{ type: "text", data: { text } }],
      },
    }
  }

// Parse the first integer from raw message content, ignoring any XML-like
// element tags (notably <at id="123456789"/>, whose qq number would
// otherwise be picked up by \d+). Returns null if no digits found.
function parseAmountFromContent(content) {
  const text = String(content || "").replace(/<[^>]+>/g, "")
  const m = text.match(/-?\d+/)
  return m ? Math.floor(Number(m[0])) : null
}

// Match the 设置p点 / similar operation keyword from the message text.
// Returns the longest matching op ("设置" / "扣除" / "添加") found in any
// token, or null if none. Robust against "设@xxx 设置 10000" where the
// first token is a 1-char prefix truncated by the at element.
function matchSettingOp(text) {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const ops = ["设置", "扣除", "添加"]
  for (const tok of tokens) {
    for (const op of ops) {
      if (tok.startsWith(op)) return op
    }
  }
  return null
}

// Strip all XML-like element tags from raw message content, leaving only
// human-readable text. Useful when you want to regex over the message but
// don't care about at/image/etc. tags.
function stripElements(content) {
  return String(content || "").replace(/<[^>]+>/g, "")
}

// Math
function randInt(a, b) {
    if (a > b) { const t = a; a = b; b = t }
    return Math.floor(Math.random() * (b - a + 1) + a)
  }

  // Build a onebot @-element for a user id. Replaces the noisy
  // `h("at", { id: String(uid) })` blockly-style pattern.
  function at(id) {
    return h("at", { id: String(id) })
  }
  // Send a reply that starts with an @-mention of `uid`. `lines` is
  // an array of strings or h() elements that get joined together.
  // Replaces the `await session.send([h("at", { id: uid }), ...].join(""))`
  // pattern that appears dozens of times in the bots.
  async function replyAt(session, uid, lines) {
    await session.send([at(uid), ...lines].join(""))
  }

  return {
    // IDs
    POINTS_NS, SUFFIX,
    isAdmin, isPrivileged, atTarget, isAtTargetBot, isSelfOrBot,
    // KV
    kvGet, kvSet, kvDel, safeNum,
    // Date
    todayISO, isSameDay, dayOfMonth,
    // P点 + key builders
    pointsKey, sendDateKey, sendTodayKey, recvDateKey, recvTodayKey,
    robDateKey, robCountKey, robLastResetKey, robNetKey, signDateKey,
    getPoints, addPoints, setPoints,
    getTodayCounter, addTodayCounter,
    getRobState, setRobCount, setRobNet, getNextRobRefillAt, formatDuration,
    getSignDate, setSignDate,
    // Pity (gacha)
    pityKey, getPity, setPity, resetPity,
    // Deck
    deckKey, parseDeck, serializeDeck, emptyDeck, fillDeckSlots,
    findFirstEmpty, isDeckFull, tryAutoFillDeck,
    // Util
    withErrorBoundary, randInt, sendHelpForward, buildHelpNode,
    at, replyAt,
    parseAmountFromContent, stripElements, matchSettingOp,
    // Gacha config helpers (consumed by gacha-bot)
    parseRarity, rarityName, rollRarity,
    // Config (for downstream consumers)
    config,
  }
}

module.exports = {
  createHelpers,
  parseRarity,
  rarityName,
  rollRarity,
  POINTS_NS,
  SUFFIX,
  // Stub plugin metadata so @koishijs/plugin-config can parse this
  // package (it scans every koishi-plugin-* under node_modules and
  // chokes on packages without name/apply).
  name: "blockly-shared",
  apply: async () => { /* no-op: this is a require-only library */ },
}
