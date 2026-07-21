// koishi-plugin-random-answer
//
// Triggered by messages starting with "问" (configurable). Detects and
// replaces these keywords with random answers pulled from a per-length
// word DB (kept in koishi's own sqlite via ctx.model.extend):
//
//   什么N / 干什么N        → random word of exactly N chars
//   为什么N              → "因为" + random word of N chars
//                            (the "因为" itself does NOT count toward N)
//   什么 / 干什么 (no N)  → random word of any length
//   为什么 (no N)         → "因为" + random word (2–5 chars)
//   谁                   → random group member's nickname
//   多少 / 几             → random integer (1–9999 or 1–9)
//   A还是B还是C…         → random pick from the choices
//   X不X                  → "X是X" or "X不是X" (50/50)
//   X的概率 / X的几率      → random integer 0–100 with % suffix
//
// Commands:
//   加词 <word>           — append a word to the DB, auto-bucketed by length
//   词库 [length]         — list words, optionally filtered by length
//   删词 <word>           — remove a word (admin only)
//
// Char-count rule: 1 grapheme = 1 char (punctuation, ASCII letter,
// digit, CJK ideograph, emoji all count as 1).

const { Schema } = require("koishi")
const { startExtractor } = require("./extractor")
const { startWordsAudit } = require("./check-words")

module.exports.name = "random-answer"
module.exports.inject = { required: ["database"], optional: ["group-memory"] }

module.exports.Config = Schema.object({
  triggerKeyword: Schema.string().default("问")
    .description('触发前缀：消息以这个字开头时进入随机回答模式'),
  dataDir: Schema.string().default("./data/random-answer")
    .description('词库目录（相对 koishi cwd），按字数分桶的 JSON 索引'),
  openAdd: Schema.boolean().default(true)
    .description('允许任意用户用 加词 命令贡献词库'),
  adminIds: Schema.array(Schema.string()).default([])
    .description('admin userId（不受 openAdd 限制、可删词）'),
  minWordLen: Schema.number().default(1)
    .description('最短词长度（字数下限）'),
  maxWordLen: Schema.number().default(15)
    .description('最长词长度（字数上限）'),
  defaultWhyLen: Schema.number().default(3)
    .description('"为什么"无数字时默认拼的词长度'),
  defaultWhatLen: Schema.number().default(3)
    .description('"什么/干什么"无数字时默认拼的词长度'),
  fallbackText: Schema.string().default("…")
    .description('词库空时占位文字（建议短小）'),
  // ── Responder whitelist (separate from LLM extractor's llmAllowedGroups) ──
  // Controls which group chats the 「问 ...」 middleware responds in.
  // Empty array = respond in every group (legacy behavior). When non-empty,
  // the middleware only fires for group messages whose guildId is in the
  // list, and stays silent in every other group / private chat. This is the
  // safety switch that prevents the bot from spamming replies in groups the
  // admin hasn't opted into.
  allowedGroups: Schema.array(Schema.string()).default([])
    .description('响应白名单群号（字符串数组）。空=所有群都响应；非空=只在列出的群响应，其他群/私聊一律静默'),
  // ── LLM extractor ──────────────────────────────────────────────
  llmEnabled: Schema.boolean().default(false)
    .description('启用 LLM 定时提取（从白名单群拉消息 → LLM 抽短句 → 入库）'),
  llmApiBase: Schema.string().default("https://api.minimaxi.com/anthropic")
    .description('LLM API base URL（Anthropic 兼容，含 /anthropic 则用 Messages API；其他走 OpenAI 兼容 /chat/completions）'),
  llmApiKey: Schema.string().default("")
    .description('LLM API key（留空则从 llmApiKeyEnv 指定的 env 读）'),
  llmApiKeyEnv: Schema.string().default("RANDOM_ANSWER_LLM_KEY")
    .description('若 llmApiKey 留空，从这个 env 变量名读 key'),
  llmModel: Schema.string().default("MiniMax-M3")
    .description('LLM 模型名'),
  llmIntervalMin: Schema.number().default(60).min(1)
    .description('提取间隔（分钟）；可用命令 设置提取间隔 动态改'),
  llmAllowedGroups: Schema.array(Schema.string()).default([])
    .description('白名单群号（字符串数组）；为空则不跑'),
  llmMaxMessagesPerRun: Schema.number().default(200).min(1)
    .description('每轮最多喂给 LLM 的消息条数（所有群合计）'),
  llmMinWordLen: Schema.number().default(1).min(1)
    .description('LLM 抽取的词允许的最短字数'),
  llmMaxWordLen: Schema.number().default(15).min(1)
    .description('LLM 抽取的词允许的最长字数'),
  llmMaxRetries: Schema.number().default(3).min(1)
    .description('LLM 调用失败重试次数（超过则跳过本轮）'),
  llmArchiveRaw: Schema.boolean().default(true)
    .description('是否把每轮的原始消息 + prompt + LLM 输出 + 抽取结果归档到 dataDir/extraction-archive/'),
  llmBotIds: Schema.array(Schema.string()).default([])
    .description('要从 LLM 抽取源里排除的 bot user_id 列表（自动从 ctx.bots 发现当前 bot，额外指定用于多 bot 场景）'),
})

module.exports.apply = async (ctx, config) => {
  // Word DB lives on the filesystem (one JSON file, bucketed by length)
  // — keeps the plugin self-contained and avoids colliding with koishi's
  // own sqlite tables.
  const fs = require("fs/promises")
  const path = require("path")
  const dataDir = path.resolve(process.cwd(), config.dataDir)
  const dbFile = path.join(dataDir, "words.json")
  await fs.mkdir(dataDir, { recursive: true })

  async function loadDb() {
    try {
      const raw = await fs.readFile(dbFile, "utf-8")
      const obj = JSON.parse(raw)
      // shape: { "2": ["湘潭", "阴湿"], "1": ["逊"], ... }
      const out = { byLen: {}, all: [] }
      for (const [lenStr, words] of Object.entries(obj)) {
        if (!Array.isArray(words)) continue
        const len = Number(lenStr)
        out.byLen[len] = words.slice()
        for (const w of words) out.all.push({ len, text: w })
      }
      return out
    } catch {
      return { byLen: {}, all: [] }
    }
  }
  async function saveDb(db) {
    const obj = {}
    for (const [len, words] of Object.entries(db.byLen)) {
      obj[len] = words.slice().sort()
    }
    await fs.writeFile(dbFile, JSON.stringify(obj, null, 2))
  }
  let db = await loadDb()

  function countChars(s) {
    return [...String(s)].length
  }
  // Two ways to be considered an admin for this plugin:
  //   1. The userId is in config.adminIds (manual list — typical for QQ-only ops)
  //   2. The koishi auth user linked to this session has authority >= 5
  //      (i.e. they've logged in as the auth admin in the koishi webui and
  //      bound their QQ account). Default auth admin authority is 5.
  // Without the second clause, anyone who's only ever used QQ commands
  // (never touched the webui / never linked a binding) is locked out.
  async function isAdmin(session) {
    const uid = String(session?.userId || "")
    if (uid && config.adminIds.map(String).includes(uid)) return true
    try {
      const u = await session?.observeUser?.(["authority"])
      if (u && Number(u.authority || 0) >= 5) return true
    } catch (_) {}
    return false
  }
  function isAdminSync(uid) {
    return config.adminIds.map(String).includes(String(uid))
  }
  function canAdd(uid) {
    return config.openAdd || isAdminSync(uid)
  }

  // DB facade exposed to the LLM extractor. Wraps the in-memory db +
  // saveDb so extractor doesn't need direct access to closure state.
  const dbApi = {
    has: (text) => db.all.some(r => r.text === text),
    all: () => db.all.map(r => r.text),
    add: async (text) => {
      const len = await addWord(text, "llm-extractor")
      return len != null
    },
  }
  function pickByLength(len, excludeSet) {
    const arr = db.byLen[len] || []
    const filtered = excludeSet ? arr.filter(t => !excludeSet.has(t)) : arr
    if (filtered.length === 0) return null
    return filtered[Math.floor(Math.random() * filtered.length)]
  }
  function pickRandom(excludeSet) {
    const filtered = excludeSet ? db.all.filter(r => !excludeSet.has(r.text)) : db.all
    if (filtered.length === 0) return null
    return filtered[Math.floor(Math.random() * filtered.length)].text
  }
  async function addWord(text, addedBy) {
    const len = countChars(text)
    if (len < config.minWordLen || len > config.maxWordLen) return null
    ;(db.byLen[len] ||= []).push(text)
    db.all.push({ len, text })
    await saveDb(db)
    return len
  }
  async function removeWord(text) {
    const before = db.all.length
    db.all = db.all.filter(r => r.text !== text)
    for (const lenStr of Object.keys(db.byLen)) {
      db.byLen[lenStr] = db.byLen[lenStr].filter(t => t !== text)
      if (db.byLen[lenStr].length === 0) delete db.byLen[lenStr]
    }
    if (db.all.length === before) return false
    await saveDb(db)
    return true
  }
  // Resolve a specific user's nickname in the current group. Uses the
  // koishi-plugin-adapter-onebot API (bot.getGuildMemberList). Returns
  // null when the API fails, the user isn't in the group, or the field
  // is empty — caller decides what to fall back to.
  async function getUserNickname(session, userId) {
    if (session.isDirect) return null
    const guildId = String(session.guildId || session.channelId || session.event?.channel?.id || "")
    if (!guildId) return null
    const bot = session.bot
    if (!bot || typeof bot.getGuildMemberList !== "function") return null
    const targetId = String(userId)

    let list = null
    try {
      const r = await bot.getGuildMemberList(guildId)
      list = r?.data ?? r
    } catch (_) {}

    if (!Array.isArray(list) || list.length === 0) return null

    const m = list.find(x => String(x.user?.id ?? x.user_id ?? x.userId ?? "") === targetId)
    if (!m) return null
    const user = m.user || m
    // `card` = per-group nickname; `nickname` = global nickname
    return m.card || m.nickname || user.nick || user.name || null
  }

  // Pull a random group member's in-group nickname (`card`) so the reply
  // reflects the per-group display name the user has set for THIS guild
  // (not their global nickname). Excludes the sender and any bot accounts
  // to avoid replying with "you" or the bot's own name.
  //
  // API: koishi-plugin-adapter-onebot exposes
  //   bot.getGuildMemberList(guildId) → { data: GuildMember[] }
  // Member fields vary — `user.id` / `user_id` / `userId` and
  // `card` / `nickname` are the canonical ones we read.
  async function randomNickname(session) {
    if (session.isDirect) return null
    const guildId = String(session.guildId || session.channelId || session.event?.channel?.id || "")
    if (!guildId) return null
    const bot = session.bot
    if (!bot || typeof bot.getGuildMemberList !== "function") return null

    let list = null
    try {
      const r = await bot.getGuildMemberList(guildId)
      list = r?.data ?? r
    } catch (_) {}

    if (!Array.isArray(list) || list.length === 0) return null

    const selfId = String(session.selfId || "")
    const senderId = String(session.userId || "")
    const candidates = list.filter(m => {
      const id = String(m.user?.id ?? m.user_id ?? m.userId ?? "")
      return id && id !== selfId && id !== senderId
    })
    if (candidates.length === 0) return null

    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const user = pick.user || pick
    // `card` = per-group nickname; `nickname` = global nickname; `nick`/`name` = legacy fields
    return pick.card || pick.nickname || user.nick || user.name || null
  }

  // Pre-resolve async-replacement values that need DB / network access
  // (regex .replace callbacks must be synchronous).
  async function buildReplacements(session) {
    return {
      nickname: await randomNickname(session),
    }
  }

  // ── CAPTURE STATE (hoisted to apply() scope) ───────────────────
  // REFS lives at apply() scope, NOT inside replace(), so recursive
  // replace() calls share the same array. The earlier version declared
  // REFS inside replace(), which broke nested captures: when an outer
  // replace triggered `replace(REFS[i].inner)` to resolve a placeholder,
  // the inner replace would re-run extractCaptures on a fresh empty
  // REFS[], then hit `REFS[idx].resolved` in Step 9.5 and throw
  // "Cannot read properties of undefined" — because the placeholders in
  // the inner text reference slots owned by the OUTER REFS[].
  //
  // IMPORTANT: REFS is cleared at the START of each top-level replace()
  // call (not nested recursive ones), so each user message gets its own
  // capture context. Without that, slots from a previous message would
  // leak into the new message's \N back-references.
  const REFS = []
  const DELIMITERS = [
    { open: "(", close: ")" },
    { open: "（", close: "）" },
    { open: "/", close: "/" },
  ]
  function findMatchingClose(text, openIdx, delim) {
    // Walk forward, counting depth. The same-char case (`/`) just
    // toggles depth on every match of the delim char; the asymmetric
    // case (`(` / `（`) requires distinguishing open vs close.
    let depth = 1
    const isSymmetric = delim.open === delim.close
    for (let j = openIdx + 1; j < text.length; j++) {
      const c = text[j]
      if (isSymmetric) {
        if (c === delim.close) depth--
      } else {
        if (c === delim.open) depth++
        else if (c === delim.close) depth--
      }
      if (depth === 0) return j
    }
    return -1
  }
  function extractCaptures(text) {
    // Returns the rewritten string with `\uE000<N>\uE001` placeholders
    // for every opening delimiter found. Side-effect: pushes to REFS[].
    let out = ""
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      const delim = DELIMITERS.find(d => d.open === ch)
      if (delim) {
        const closeIdx = findMatchingClose(text, i, delim)
        if (closeIdx >= 0) {
          const innerText = text.slice(i + 1, closeIdx)
          const innerResolved = extractCaptures(innerText)
          const idx = REFS.length
          REFS.push({ inner: innerResolved, resolved: null })
          out += `\uE000${idx}\uE001`
          i = closeIdx + 1
          continue
        }
        // No matching close — emit as literal text and move on.
      }
      out += ch
      i++
    }
    return out
  }

  // ── The replacement function ────────────────────────────────────
  // Walks `text` once with a single combined regex that captures all
  // the keyword shapes, dispatches each match to the right handler.
  // Order matters (e.g. 什么3 must be tried before 什么, and 为什么3
  // before 为什么).
  //
  // We split this into two functions for the capture-state lifetime:
  //   `replace(text, repl)` — TOP-LEVEL entry called from the middleware.
  //                          Resets REFS[] so captures don't leak between
  //                          user messages, then delegates to _replace.
  //   `_replace(text, repl)` — does the actual work. Recursive calls
  //                           (Step 9.5 / 9.7 for nested captures) go
  //                           HERE so they share the same REFS[].
  //
  // Pattern shapes handled:
  //   为什么(\d+)              → "因为<N字词>，所以<N字词>"
  //   为什么                    → "因为<word>" or "因为<word>，所以<content>"
  //   什么(\d+) / 干什么(\d+)  → N-char word
  //   什么 / 干什么             → random-length word
  //   谁                        → random group nickname
  //   多少 / 几                  → random integer
  //   (X)还是(Y)(还是(Z))*      → random pick from chain
  //   X不X                      → X / 不X (50/50)
  //   (\S{1,12}?)(概率|几率)    → "X的概率是<NN>%"
  //   你 / 我                   → atomic swap (final pass)
  //   `(...)` / `（...）` / `/.../`  → captured slot, recursive resolve
  //   `\N`                      → back-reference to Nth captured slot

  function _replace(text, repl) {
    const M = repl
    const fall = () => config.fallbackText

    let s = extractCaptures(text)

    // Step 1: A还是B还是C… — greedy left-to-right scan.
    s = s.replace(/[\u4e00-\u9fa5A-Za-z0-9]+(?:还是[\u4e00-\u9fa5A-Za-z0-9]+)+/g, (m) => {
      const parts = m.split("还是")
      if (parts.length < 2) return m
      const pick = parts[Math.floor(Math.random() * parts.length)]
      return pick
    })

    // Step 2: 为什么N → "因为<N字词>，所以<N字词>"
    s = s.replace(/因?为什么(\d+)/g, (m, n) => {
      const len = parseInt(n, 10)
      const w1 = pickByLength(len) || pickByLength(Math.max(config.minWordLen, Math.min(len, config.maxWordLen))) || fall()
      const w2 = pickByLength(len) || pickByLength(Math.max(config.minWordLen, Math.min(len, config.maxWordLen))) || fall()
      return "因为" + w1 + "，所以" + w2
    })

    // Step 3: 为什么X → "因为<word>，所以X" or just "因为<word>" when X is empty/punctuation.
    s = s.replace(/因?为什么([\s\S]*)/g, (m, content) => {
      const trimmed = (content || "").trim()
      const PUNCT_ONLY = /^[\s?？!！,，。~～.…]+$/
      if (!trimmed || PUNCT_ONLY.test(trimmed)) {
        return "因为" + (pickRandom() || fall())
      }
      return "因为" + (pickRandom() || fall()) + "，所以" + content
    })

    // ── USER-INPUT TRANSFORMS (must run BEFORE random-word fills) ────
    // Anything below that picks a random word from the DB and splices
    // it into the output CANNOT be processed by these transforms again,
    // otherwise random words containing the trigger substring get
    // double-processed. Concrete bug (2026-07-06): 7-char bucket had
    // `问我被爱的概率` etc.; Step 9 (概率) ran AFTER Step 4 (什么N),
    // so `什么7` → `问我被爱的概率` → Step 9 → `问我被爱的概率是75%`
    // → Step 7.5 你↔我 swap → `问你被爱的概率是75%`. Same hazard for
    // 谁 (~32 words), X不X (~19 words), 概率 (~20 words). 你/我 swap
    // (Step 7.5, ~643 hits) is intentionally kept as the FINAL pass so
    // the bot's reply flips perspective globally.

    // Step 9: X的概率 / X的几率 → "X的概率是<NN>%"
    // MUST be before Step 8 (多少/几) so `几率` isn't half-matched as `几`.
    s = s.replace(/(.{1,12}?)(?:的)?(?:概率|几率)/g, (m, thing) => {
      return thing + "的概率是" + Math.floor(Math.random() * 101) + "%"
    })

    // Step 6: X不X → X / 不X (50/50)
    s = s.replace(/([\u4e00-\u9fa5])不\1/g, (m, x) => {
      return Math.random() < 0.5 ? `${x}` : `不${x}`
    })

    // Step 7: 谁 → random group nickname
    s = s.replace(/(?<!的)谁(?!的)/g, () => {
      return M.nickname || "神秘人"
    })

    // Step 7.5: 你 / 我 atomic swap (moved here from end of pipeline).
    // Was previously the final pass so it would flip user-perspective
    // phrases like "问你打我" → "我打你". But the global swap also
    // mangled random word picks containing 你/我 — concrete case
    // (2026-07-06): bucket 7 has words like `我要去称个体重`,
    // `你给我出去走人`, `我妈：谁教你的`. Old final-pass swap would
    // flip the chars inside these words AND in adjacent slots,
    // producing nonsense outputs (e.g. user typed 4 个 什么7 and got
    // the 2nd slot expanded to 12 chars). Now the swap runs on USER
    // INPUT ONLY — perspective flip still works for literal 你/我 in
    // user messages, and random word picks are left intact.
    s = s.replace(/[你我]/g, (m) => (m === "你" ? "我" : "你"))

    // ── RANDOM WORD FILLS (Steps 4 & 5) ────────────────────────────
    // Anything AFTER this point MUST NOT touch the random words that
    // get spliced in here. The only "post-fill" passes that follow are
    // placeholder resolution (Step 9.5/9.7), which is intentional.

    // Step 4: 什么N / 干什么N → N-char word
    s = s.replace(/(?:什么|干什么)(\d+)/g, (m, n) => {
      const len = parseInt(n, 10)
      return pickByLength(len) || pickByLength(Math.max(config.minWordLen, Math.min(len, config.maxWordLen))) || fall()
    })

    // Step 5: 什么 / 干什么 (no N) → random-length word
    s = s.replace(/(?:什么|干什么)(?!\d)/g, () => {
      return pickRandom() || fall()
    })

    // Step 8: 多少 / 几 → random integer
    // MUST be after Step 9 so `几率` isn't half-matched as `几`.
    s = s.replace(/(多少|几)(?!\d)/g, (m, kw) => {
      if (kw === "多少") return String(Math.floor(Math.random() * 101))
      return String(Math.floor(Math.random() * 10))
    })

    // Step 9.5: resolve `(...)` placeholders recursively (shares REFS).
    s = s.replace(/\uE000(\d+)\uE001/g, (_, idxStr) => {
      const idx = Number(idxStr)
      if (REFS[idx].resolved == null) {
        REFS[idx].resolved = _replace(REFS[idx].inner, repl)
      }
      return REFS[idx].resolved
    })

    // Step 9.7: back-references `\N` → REFS[N-1].resolved.
    s = s.replace(/\\(\d+)/g, (m, n) => {
      const idx = parseInt(n, 10) - 1
      if (idx < 0 || idx >= REFS.length) return m
      if (REFS[idx].resolved == null) {
        REFS[idx].resolved = _replace(REFS[idx].inner, repl)
      }
      return REFS[idx].resolved
    })

    return s
  }

  // Top-level entry: clear REFS first so captures don't leak across
  // user messages. Then delegate to the inner implementation.
  function replace(text, repl) {
    REFS.length = 0
    return _replace(text, repl)
  }

  // ── 监听问开头的消息 ───────────────────────────────────────────
  // Use a koishi middleware so we intercept BEFORE any command matcher
  // runs. Returning (without calling next()) prevents the same message
  // from also triggering a command if the body happens to look like one.
  //
  // Trigger detection is intentionally lenient: strip any leading/trailing
  // whitespace AND zero-width chars (U+200B–U+200F, U+FEFF) before checking
  // startsWith, and also allow zero-width/whitespace between the trigger
  // and the body. This handles QQ mobile IMEs that sometimes inject
  // invisible characters around the first typed char.
  ctx.middleware(async (session, next) => {
    // Responder whitelist gate. Runs BEFORE the trigger check so we don't
    // even bother parsing messages from groups we don't serve. Empty
    // allowedGroups = open to all (legacy / dev mode). Non-empty = strict:
    //   · group messages whose guildId is in the set → continue
    //   · everything else (other groups, private chats) → return next()
    //     so the message keeps flowing to other middlewares/commands.
    // IMPORTANT: this does NOT gate the commands (加词/删词/etc.) — those
    // use koishi's own auth.adminIds / authority check instead, so the
    // admin can still manage the dictionary from any chat.
    const allowed = Array.isArray(config.allowedGroups) ? config.allowedGroups.map(String) : []
    if (allowed.length > 0) {
      const gid = String(session.guildId || session.channelId || "")
      if (!gid || !allowed.includes(gid)) return next()
    }

    const raw = (session.content || "").trim()
    if (!raw) return next()

    // Special rule: a paired set of users asking "问我喜欢谁" gets the
    // OTHER half's nickname as the answer. Mapping (asker → subject):
    //   user 2141971921 (nene) → 你喜欢<nick of 29053789 (Lezska)>
    //   user 29053789  (Lezska) → 你喜欢<nick of 2141971921 (nene)>
    // Reply format mirrors the natural 你/我 swap: "我喜欢谁" → "你喜欢X".
    // Runs BEFORE normal replace() so the random-word path doesn't fire.
    const lovePairs = { "2141971921": "29053789", "29053789": "2141971921" }
    const subjectId = lovePairs[String(session.userId)]
    if (subjectId) {
      const stripped0 = raw.replace(/^[^\p{L}\p{N}]+/u, "")
      const body0 = stripped0.replace(/^问[\s\u00A0\u3000]*/, "").trim()
      if (body0 === "我喜欢谁") {
        try {
          const nick = await getUserNickname(session, subjectId)
          if (nick) {
            await session.send("你喜欢" + nick)
            return
          }
        } catch (_) {}
      }
    }

    const trigger = config.triggerKeyword
    // Strip ALL leading non-letter/non-number chars (whitespace, controls,
    // zero-width, BOM, full-width space, etc) then check the trigger.
    // This is more robust than enumerating invisible-char ranges because
    // it just asks "is this a visible char?" and skips everything else.
    const stripped = raw.replace(/^[^\p{L}\p{N}]+/u, "")
    if (!stripped.startsWith(trigger)) return next()
    // After the trigger, also strip a single optional whitespace run so
    // "问 今天吃什么" and "问今天吃什么" behave the same.
    const body = stripped.slice(trigger.length).replace(/^[\s\u00A0\u3000]+/, "")
    if (!body) return next()

    try {
      const repl = await buildReplacements(session)
      const result = replace(body, repl)
      await session.send(result)
    } catch (err) {
      ctx.logger("random-answer").error(err)
    }
    // Don't call next() — we've answered the user's question.
  })

  // ── 加词 ────────────────────────────────────────────────────────
  ctx.command("加词 <word:text>").action(async ({ session }, word) => {
    if (!word) return "用法：加词 [词]"
    if (!canAdd(session.userId)) return "当前不允许普通用户添加词"
    const len = await addWord(word, session.userId)
    if (len == null) {
      return `词长度需在 ${config.minWordLen}-${config.maxWordLen} 字之间（"${word}" = ${countChars(word)}字）`
    }
    return `已添加词 "${word}" (${len}字)`
  })

  // ── 词库 ────────────────────────────────────────────────────────
  // When a single bucket has too many words the line gets truncated by
  // QQ. Two solutions:
  //   1. Specific bucket (词库 N): if words > CHUNK_THRESHOLD, send as
  //      merged-forward with CHUNK_SIZE words per node so each node is
  //      tappable. Otherwise plain text (short enough to fit in one msg).
  //   2. No length (词库): always forward — one node per bucket so the
  //      user can tap into each bucket's preview instead of scrolling a
  //      wall of text.
  // Falls back to plain text if the bot adapter doesn't expose
  // sendGroupForwardMsg / sendPrivateForwardMsg.
  const CHUNK_THRESHOLD = 80  // below this, plain text is fine
  const CHUNK_SIZE = 80       // words per forwarded node
  async function tryForward(session, titlePrefix, sections) {
    // sections: [{title, lines: string[]}]
    const isGroup = !!session.guildId && !session.isDirect
    const target = isGroup ? session.guildId : session.userId
    const messages = sections.map(sec => ({
      type: "node",
      data: {
        name: titlePrefix,
        uin: String(session.selfId || "0"),
        content: [sec.title, "", ...sec.lines].join("\n"),
      },
    }))
    const method = isGroup ? "sendGroupForwardMsg" : "sendPrivateForwardMsg"
    try {
      if (session.bot?.internal?.[method]) {
        await session.bot.internal[method](target, messages)
        return true
      }
    } catch (err) {
      ctx.logger("random-answer").warn(`合并转发失败，回退到普通消息: ${err.message}`)
    }
    return false
  }

  ctx.command("词库 [length:number]").action(async ({ session }, length) => {
    if (length != null) {
      const arr = db.byLen[length] || []
      if (arr.length === 0) return `${length}字词库为空`

      // Short bucket → plain text (single message, readable inline).
      if (arr.length <= CHUNK_THRESHOLD) {
        return `${length}字词库 (${arr.length}个)：\n${arr.join("、")}`
      }

      // Long bucket → merged-forward, chunked so each node is tappable.
      const sections = []
      for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
        const slice = arr.slice(i, i + CHUNK_SIZE)
        const idx = `${i + 1}-${i + slice.length}`
        sections.push({
          title: `${length}字词库 · 第 ${idx} 个 / 共 ${arr.length}`,
          lines: [slice.join("、")],
        })
      }
      const ok = await tryForward(session, "随机回答 · 词库", sections)
      if (ok) return  // forwarded; no further text needed
      // Fallback to plain text if forwarding isn't available
      return `${length}字词库 (${arr.length}个)：\n${arr.join("、")}`
    }

    if (db.all.length === 0) return "词库为空"

    // No length → one node per bucket so each bucket is tappable.
    const sections = Object.keys(db.byLen)
      .map(Number)
      .sort((a, b) => a - b)
      .map(l => {
        const arr = db.byLen[l]
        const preview = arr.slice(0, 12).join("、")
        return {
          title: `${l}字词库 (共 ${arr.length} 个)`,
          lines: [
            `预览（前 ${Math.min(12, arr.length)} 个）：`,
            preview + (arr.length > 12 ? " …" : ""),
            "",
            `用 「词库 ${l}」 查看完整列表`,
          ],
        }
      })
    const ok = await tryForward(session, "随机回答 · 词库", sections)
    if (ok) return
    // Fallback (no forward support)
    const lines = sections.map(s => `[${s.title}]\n${s.lines.join("\n")}`).join("\n\n")
    return lines
  })

  // ── 删词（admin） ──────────────────────────────────────────────
  ctx.command("删词 <word:text>").action(async ({ session }, word) => {
    if (!await isAdmin(session)) return "需要管理员权限"
    const ok = await removeWord(word)
    return ok ? `已删除词 "${word}"` : `词 "${word}" 不存在`
  })

  // ── 帮助（合并转发消息） ──────────────────────────────────────
  // Send the help text as a merged-forward card so users can tap into
  // a single readable message instead of a wall of plain text. Uses
  // onebot's sendGroupForwardMsg / sendPrivateForwardMsg (raw onebot
  // API via session.bot.internal).
  const helpSections = [
    {
      // Card 1 — overview / trigger rules
      title: "① 怎么用",
      lines: [
        "群里发「问 + 内容」，插件会按词库和关键字替换给出一个随机回答。",
        "",
        "▸ 触发前缀：「问」，不区分前后空格",
        "  问今天吃什么          问 今天吃什么          问今天吃什么",
        "  三种写法等价。",
        "",
        "▸ 没有任何关键字的纯问句：随机抽一个 N 字词当回答",
        "  问今天心情          → 今天心情<词>",
        "",
        "▸ 没收到回复？通常是这些原因：",
        "  · 不在白名单群（仅在 koishi.yml 里 allowedGroups 列出的群响应）",
        "  · 没加「问」前缀",
        "  · 触发了别的前缀占用（如 anti-space）",
      ],
    },
    {
      // Card 2 — basic slot substitutions
      title: "② 基础关键字",
      lines: [
        "以下关键字可在「问」之后任意位置出现，触发后被替换：",
        "",
        "什么 / 干什么               → 随机抽一个 N 字词",
        "  问今天吃什么              → 今天吃阴湿",
        "什么N / 干什么N             → 指定字数的词",
        "  问为什么什么4            → 因为<4字词>",
        "",
        "谁                          → 随机抽一个群友（排除自己 + bot）",
        "  问谁最帅                  → 神秘人最帅",
        "",
        "多少                        → 0–100 的整数",
        "几                          → 0–9 的整数（不接数字）",
        "  问今天要跑多少公里       → 今天要跑42公里",
        "",
        "X 还是 Y 还是 Z             → 随机选其中之一",
        "  问今天还是明天还是后天    → 今天",
        "",
        "X 的概率 / X 的几率         → X 的概率是 NN%",
        "  问中500万的概率           → 中500万的概率是7%",
      ],
    },
    {
      // Card 3 — 因 / 不 / 你我 (semantic transforms)
      title: "③ 语义改写",
      lines: [
        "为什么 / 因为什么            → 因为<词>，所以<原句>",
        "  问为什么好吃              → 因为阴湿，所以好吃",
        "  问为什么好吃吗？          → 因为阴湿，所以好吃吗？（标点保留）",
        "  问为什么                  → 因为阴湿（没有「所以」半句）",
        "",
        "为什么N / 因为什么N          → 因为<N字词>，所以<N字词>",
        "  问为什么3                 → 因为<3字词>，所以<3字词>",
        "",
        "X不X                        → X 或 不X（50/50）",
        "  问行不行                  → 行 / 不行",
        "",
        "你 / 我                      → 整句里你和我互换（原子）",
        "  问你打我                  → 我打你",
      ],
    },
    {
      // Card 4 — capture / back-reference (the headline feature)
      title: "④ 捕获与反向引用（高级）",
      lines: [
        "用 (...) / （...） / /.../ 把一段文本存起来，后面用 \\N 反向引用：",
        "",
        "三种 delimiter 都行：",
        "  (什么2)  (什么2)  /什么2/",
        "",
        "▸ 反向引用 \\N（N 从 1 开始）",
        "  问\\1(什么2)喜欢\\1",
        "  → 阴湿喜欢阴湿",
        "  （同一个词在句子里复用，不会重复随机）",
        "",
        "▸ 嵌套捕获（最多 7 层实测 OK，更深也行）",
        "  问\\7\\6\\5\\4\\3\\2(什么2(什么2(什么2(什么2(什么2(什么2(什么2)))))))",
        "  → 把 7 个独立的 2 字词展开",
        "",
        "▸ 越界保护：写错的 \\N 不会被静默吞掉",
        "  问\\99                  → \\99（保持字面，方便你看到打错了）",
        "",
        "▸ 注意：",
        "  · /.../ 的开闭符相同，内容里不能再含 /",
        "  · 反向引用指向「本条消息」里的捕获槽，不会跨消息串味",
      ],
    },
    {
      // Card 5 — commands split into 普通用户 + admin
      title: "⑤ 命令列表",
      lines: [
        "【任意用户可用】",
        "  加词 <词>          加一个词到词库",
        "    例：加词 不想上班",
        "  词库 [字数]        查看词库（不填字数 = 列出所有桶的总数）",
        "    例：词库 3        → 列出所有 3 字词",
        "  随机回答帮助        本条消息",
        "",
        "【仅 admin】",
        "  删词 <词>          从词库里删一个词",
        "  词库统计           总数 + 各字数桶数量",
        "  立即提取           立刻跑一轮 LLM 抽取（不等间隔）",
        "  提取状态           上次抽取时间（UTC + 本地）+ 当前间隔",
        "  设置提取间隔 <分>   改自动抽取间隔，立刻生效并持久化",
        "  设置api <k> [b] [m]  改 LLM key / base / model，立刻生效+持久化",
        "  查看api             看当前生效配置（key 脱敏）",
        "  重置api             清空覆盖文件（完全回退需重启 koishi）",
        "",
        "admin 列表取决于 koishi.yml 配置（adminIds）+ auth.authority≥5。",
      ],
    },
  ]
  ctx.command("随机回答帮助").action(async ({ session }) => {
    const isGroup = !!session.guildId && !session.isDirect
    const target = isGroup ? session.guildId : session.userId
    const messages = helpSections.map((sec) => ({
      type: "node",
      data: {
        name: "随机回答",
        uin: String(session.selfId || "0"),
        content: [sec.title, "", ...sec.lines].join("\n"),
      },
    }))
    const method = isGroup ? "sendGroupForwardMsg" : "sendPrivateForwardMsg"
    try {
      if (session.bot?.internal?.[method]) {
        await session.bot.internal[method](target, messages)
        return
      }
    } catch (err) {
      ctx.logger("random-answer").warn(`合并转发失败，回退到普通消息: ${err.message}`)
    }
    // Fallback: plain text concatenation if merged-forward isn't available
    const text = helpSections.map(s => `[${s.title}]\n${s.lines.join("\n")}`).join("\n\n")
    return text
  })

  // ── 统计 ────────────────────────────────────────────────────────
  ctx.command("词库统计").action(async ({ session }) => {
    const total = db.all.length
    if (total === 0) return "词库为空"
    return `词库总计 ${total} 个词，覆盖 ${Object.keys(db.byLen).length} 个字数桶`
  })

  // ── LLM 提取器 ──────────────────────────────────────────────────
  // LLM API config can be overridden at runtime via admin commands
  // (`设置api ...`). Overrides persist to <dataDir>/llm-config.json so
  // they survive koishi restarts. The file is applied here BEFORE the
  // extractor starts so the very first run uses the user's latest key.
  //
  // File shape:
  //   { "llmApiKey": "...", "llmApiBase": "...", "llmModel": "..." }
  // Any field present overrides the koishi.yml / env value. Absent
  // fields keep the original. Empty string for a field means "revert
  // to koishi.yml / env" (used by `重置api`).
  const llmConfigFile = path.join(dataDir, "llm-config.json")
  async function loadLLMOverrides() {
    try {
      const raw = await fs.readFile(llmConfigFile, "utf-8")
      const obj = JSON.parse(raw)
      const out = {}
      if (typeof obj.llmApiKey === "string") out.llmApiKey = obj.llmApiKey
      if (typeof obj.llmApiBase === "string") out.llmApiBase = obj.llmApiBase
      if (typeof obj.llmModel === "string") out.llmModel = obj.llmModel
      return out
    } catch {
      return {}
    }
  }
  async function saveLLMOverrides(overrides) {
    // Merge with existing file so partial updates don't wipe other fields.
    let current = {}
    try {
      current = JSON.parse(await fs.readFile(llmConfigFile, "utf-8"))
    } catch {}
    const merged = { ...current, ...overrides }
    // Strip undefined so the JSON doesn't carry noise; keep empty strings
    // so `重置api` can null-out a field.
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined) delete merged[k]
    }
    await fs.writeFile(llmConfigFile, JSON.stringify(merged, null, 2), "utf-8")
  }
  async function clearLLMOverrides() {
    try { await fs.unlink(llmConfigFile) } catch {}
  }
  const llmOverrides = await loadLLMOverrides()
  if (llmOverrides.llmApiKey !== undefined) config.llmApiKey = llmOverrides.llmApiKey
  if (llmOverrides.llmApiBase !== undefined) config.llmApiBase = llmOverrides.llmApiBase
  if (llmOverrides.llmModel !== undefined) config.llmModel = llmOverrides.llmModel

  // Start the scheduled extractor (no-op if llmEnabled=false). Expose
  // the controller on ctx so admin commands can drive it.
  const extractor = startExtractor(ctx, config, dbApi)
  ctx.randomAnswerExtractor = extractor

  // ── 词库自检 ────────────────────────────────────────────────────
  // Periodically re-bucket any word whose actual char count drifted
  // away from its bucket key (zero-width chars left in by older
  // versions, manual `加词` mistakes, etc). Runs immediately on
  // startup so any drift from the previous run gets surfaced in the
  // log; then every 30 minutes. Audits also happen on each saveDb call
  // implicitly (since addWord re-checks length), but this catches
  // pre-existing bad buckets that were stored under the old code path.
  const wordsAudit = startWordsAudit({
    dataDir,
    intervalMin: 30,
    log: (m) => ctx.logger("random-answer").info(m),
    fix: true,
  })
  ctx.randomAnswerWordsAudit = wordsAudit

  ctx.command("设置提取间隔 <min:number>", "设置 LLM 提取间隔（分钟，admin）")
    .action(async ({ session }, min) => {
      if (!await isAdmin(session)) return "需要管理员权限"
      if (!extractor) return "extractor 未启用（llmEnabled=false 或 llmApiBase 未配置）"
      if (!min || min < 1) return "请提供 ≥1 的分钟数"
      await extractor.setInterval(min)
      return `提取间隔已更新为 ${min} 分钟`
    })

  ctx.command("立即提取", "立刻跑一次 LLM 提取（admin）")
    .action(async ({ session }) => {
      if (!await isAdmin(session)) return "需要管理员权限"
      if (!extractor) return "extractor 未启用"
      const result = await extractor.runNow()
      return JSON.stringify(result, null, 2)
    })

  ctx.command("提取状态", "查看 extractor 当前状态")
    .action(async () => {
      const stateFile = path.join(dataDir, "extractor-state.json")
      let state
      try {
        state = JSON.parse(await fs.readFile(stateFile, "utf-8"))
      } catch {
        state = { lastExtractionTs: 0, intervalMin: config.llmIntervalMin }
      }
      const ts = state.lastExtractionTs
      // Show BOTH UTC and local time so the user can spot it regardless
      // of how their mental clock works. Local uses server's TZ.
      const localStr = ts ? new Date(ts).toLocaleString("zh-CN", { hour12: false }) : null
      return JSON.stringify({
        enabled: !!extractor,
        ...state,
        lastExtractionAt: ts ? new Date(ts).toISOString() : null,
        lastExtractionAtLocal: localStr,
        allowedGroups: config.llmAllowedGroups,
      }, null, 2)
    })

  // ── 运行时改 LLM API 配置（admin）────────────────────────────
  // The extractor reads `config.llmApiKey` / `config.llmApiBase` /
  // `config.llmModel` at every LLM call, so mutating them in place +
  // persisting to llm-config.json is enough. The next `立即提取` /
  // scheduled run will use the new values without restart.
  //
  // Usage:
  //   设置api <key>                       改 key（保留 base / model）
  //   设置api <key> <base>                改 key + base
  //   设置api <key> <base> <model>        改 key + base + model
  //   查看api                              显示当前生效配置（key 脱敏）
  //   重置api                              清空覆盖，回退到 koishi.yml / env
  ctx.command("设置api <text:text>", "设置 LLM API 配置：<key> [base] [model]（admin）")
    .action(async ({ session }, text) => {
      if (!await isAdmin(session)) return "需要管理员权限"
      const parts = (text || "").trim().split(/\s+/).filter(Boolean)
      if (parts.length === 0) return "用法：设置api <key> [base] [model]\n例：设置api sk-xxxxxx https://api.example.com/anthropic claude-3-5-sonnet"
      if (parts.length > 3) return "参数过多：<key> [base] [model]，最多 3 个，用空格分隔"

      const updates = {}
      updates.llmApiKey = parts[0] || ""
      if (parts[1]) updates.llmApiBase = parts[1]
      if (parts[2]) updates.llmModel = parts[2]

      // Mutate live config so the next LLM call sees the new values.
      config.llmApiKey = updates.llmApiKey
      if (updates.llmApiBase !== undefined) config.llmApiBase = updates.llmApiBase
      if (updates.llmModel !== undefined) config.llmModel = updates.llmModel

      // Persist. To preserve existing fields not being changed, saveLLMOverrides
      // merges with whatever's already on disk. So a partial update
      // (just key) leaves base / model from the previous override (or yml
      // if no prior override) untouched.
      await saveLLMOverrides(updates)

      const fmt = (k, v) => v ? `${k}=${v}` : `${k}=(空)`
      const lines = [
        "已更新 LLM API 配置：",
        `  ${fmt("key",  maskKey(updates.llmApiKey))}`,
        `  ${fmt("base", updates.llmApiBase || config.llmApiBase)}`,
        `  ${fmt("model", updates.llmModel || config.llmModel)}`,
        `  持久化到：${llmConfigFile}`,
        "",
        "立即生效：下次 「立即提取」 / 定时任务会用新值。",
      ]
      return lines.join("\n")
    })

  ctx.command("查看api", "查看当前 LLM API 配置（key 脱敏）")
    .action(async ({ session }) => {
      if (!await isAdmin(session)) return "需要管理员权限"
      const fmt = (k, v) => v ? `${k}=${v}` : `${k}=(空/回退到 koishi.yml 或 env)`
      const lines = [
        "当前 LLM API 配置：",
        `  key  (脱敏): ${maskKey(config.llmApiKey)}`,
        `  base:        ${fmt("base",  config.llmApiBase).replace(/^base=\s*/, "")}`,
        `  model:       ${fmt("model", config.llmModel).replace(/^model=\s*/, "")}`,
        `  来源优先级：llm-config.json > config.llmApiKey > env[config.llmApiKeyEnv]`,
        `  持久化文件：${llmConfigFile}`,
      ]
      // If overrides file doesn't exist, the current values are from yml / env.
      try {
        await fs.access(llmConfigFile)
        lines.push("  当前有覆盖文件 (llm-config.json 存在)")
      } catch {
        lines.push("  无覆盖文件 (使用 koishi.yml / env 值)")
      }
      return lines.join("\n")
    })

  ctx.command("重置api", "清空 LLM API 覆盖文件，回退到 koishi.yml / env（admin）")
    .action(async ({ session }) => {
      if (!await isAdmin(session)) return "需要管理员权限"
      await clearLLMOverrides()
      // Mutate in-memory config back to yml / env values. We can't read the
      // ORIGINAL yml values here (config object only has runtime values), so
      // we set safe empty strings and tell the user to restart for full revert.
      // For the extractor this means: key/base/model will be empty until restart,
      // which makes the next call fail — that's actually a useful safety net so
      // the user notices the reset.
      config.llmApiKey = ""
      return [
        "已删除覆盖文件：" + llmConfigFile,
        "内存中的 config.llmApiKey 已清空（next LLM call 会因 key 空而失败 —— 这是预期行为）",
        "完全回退到 koishi.yml / env：请 重启 koishi",
      ].join("\n")
    })

  // Mask an API key for safe display: show first 4 + last 4 chars, mask the rest.
  // Empty string → "(空)". Strings shorter than 8 chars → fully masked.
  function maskKey(k) {
    if (!k) return "(空)"
    if (k.length <= 8) return "*".repeat(k.length)
    return k.slice(0, 4) + "*".repeat(Math.max(4, k.length - 8)) + k.slice(-4)
  }

  ctx.on("dispose", () => {
    if (extractor) extractor.stop()
  })
}