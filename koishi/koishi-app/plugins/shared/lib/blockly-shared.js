// Source: extracted from koishi-plugin-sign-bot + koishi-plugin-gacha-bot
// (originally blockly-generated code, 2026-06-27 refactor)
//
// Shared helpers for all blockly-derived plugins in this app.
// Provides:
//   - createHelpers(ctx, config): factory for ctx-bound helper functions
//   - parseRarity(s): '3星'/'三星'/... -> 1|2|3|4|0
//   - rollRarity(config): returns 1-4 by probability
//   - Constants (POINTS_NS, BUILTIN_KEYS, ...)

const { Schema } = require("koishi")

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
  robNet: "的抢劫记录",           // net P gained/lost today
  sendDate: "送p点日期",
  sendToday: "今日赠送p点",
  recvDate: "收p点日期",
  recvToday: "今日收到p点",
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
  // For rob (抢劫): check date, reset if new day, return count + net
  async function getRobState(userId) {
    const date = await kvGet(robDateKey(userId))
    if (date == null || isSameDay(date)) {
      await kvSet(robDateKey(userId), todayISO())
      const maxCount = config.maxRobAttempts ?? 3
      await kvSet(robCountKey(userId), maxCount)
      await kvSet(robNetKey(userId), 0)
      return { count: maxCount, net: 0 }
    }
    return {
      count: safeNum(await kvGet(robCountKey(userId))),
      net: safeNum(await kvGet(robNetKey(userId))),
    }
  }
  async function setRobCount(userId, count) {
    await kvSet(robCountKey(userId), count)
  }
  async function setRobNet(userId, net) {
    await kvSet(robNetKey(userId), net)
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


  // Math
  function randInt(a, b) {
    if (a > b) { const t = a; a = b; b = t }
    return Math.floor(Math.random() * (b - a + 1) + a)
  }

  return {
    // IDs
    POINTS_NS, SUFFIX,
    isAdmin, isPrivileged, atTarget, isAtTargetBot, isSelfOrBot,
    // KV
    kvGet, kvSet, kvDel, safeNum,
    // Date
    todayISO, isSameDay, dayOfMonth,
    // P点
    getPoints, addPoints, setPoints,
    getTodayCounter, addTodayCounter,
    getRobState, setRobCount, setRobNet,
    getSignDate, setSignDate,
    // Deck
    deckKey, parseDeck, serializeDeck, emptyDeck, fillDeckSlots,
    findFirstEmpty, isDeckFull, tryAutoFillDeck,
    // Util
    withErrorBoundary, randInt,
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
