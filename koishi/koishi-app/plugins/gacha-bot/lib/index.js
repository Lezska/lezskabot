// Source: refactored from koishi-plugin-blockly-null's compiled code (id=4)
// Original: 2026-06-27, now rewritten with koishi-plugin-blockly-shared helpers.
//
// Behaviour preserved 1:1 with the original blockly-generated code.
//
// Design notes:
//   - All hardcoded card pool / probability / value arrays are now in
//     Config and can be edited without touching code.
//   - "抽卡消耗积分" is the *single source of truth* for the gacha cost;
//     both the draw commands and the sacrifice payout use it.
//   - "积分系统UUID" hardcoded as '每日签到' is now exposed as Config.pointsNS,
//     which must match sign-bot's POINTS_NS (default '每日签到' on both sides).
//   - The 5 "auto-fill deck slot + send result" copy-paste blocks are unified
//     into tryAutoFillDeck + a single buildGachaResult() helper.
//   - All commands run inside H.withErrorBoundary().

const { Schema, h } = require("koishi")
const { createHelpers } = require("koishi-plugin-blockly-shared")

module.exports.name = "抽卡与卡组"
module.exports.inject = {
  required: ["database"],
  optional: []
}

module.exports.Config = Schema.object({
  pluginPrefix: Schema.string().default('抽卡与卡组系统')
    .description('本插件命名空间前缀（卡组/缓存等 key 用）'),
  pointsNS: Schema.string().default('每日签到')
    .description('积分系统命名空间（应与 sign-bot 的 POINTS_NS 一致）'),
  cardCount: Schema.tuple([Number, Number, Number, Number])
    .default([289, 193, 707, 24])
    .description('各稀有度卡牌总数 [2星, 3星, 4星(?), FES]'),
  drawThresholds: Schema.tuple([Number, Number, Number, Number])
    .default([700, 940, 990, 1000])
    .description('普通抽卡累积概率阈值（基数 1000）'),
  sacrificeThresholds: Schema.tuple([Number, Number, Number, Number])
    .default([0, 0, 950, 1000])
    .description('献祭抽卡累积概率阈值（基数 1000）'),
  rarityNames: Schema.tuple([String, String, String, String])
    .default(['☆二星★', '❀三星☄', '♔♕四星(?)♕♔', '☂FES☃'])
    .description('各稀有度显示名'),
  rarityValues: Schema.tuple([Number, Number, Number, Number])
    .default([0.7, 1.4, 3, 5])
    .description('献祭时各稀有度 P点 倍数（乘以 drawCost）'),
  drawCost: Schema.number().default(400).description('单次抽卡消耗 P 点'),
  maxDeckSize: Schema.number().default(10).description('卡组最大数'),
  imageDir: Schema.string().default('/root/lezskabot/cards').description('卡牌图片目录'),
  imageExt: Schema.string().default('png').description('卡牌图片扩展名'),
  // Borrowed from sign-bot — referenced in 抽卡帮助 only. Keep values
  // in sync with sign-bot's Config (or move to a shared config schema
  // later if you actually want them to diverge).
  robWinMax: Schema.number().default(1000).description('抢p点成功最多获得 P 点（仅用于帮助文案展示）'),
  robFailPenaltyMax: Schema.number().default(600).description('抢劫失败最多损失 P 点（仅用于帮助文案展示）'),
})

module.exports.usage = '抽卡 / 卡组 / 献祭'

module.exports.apply = async (ctx, config) => {
  ctx.database.extend("blockly_key_value", { key: "string", value: "string" }, { primary: "key" })
  const logger = ctx.logger("抽卡与卡组")
  const H = createHelpers(ctx, { ...config, pointsNS: config.pointsNS })

  // Local aliases for the gacha namespace
  const P = config.pluginPrefix          // '抽卡与卡组系统'
  const NS = config.pointsNS             // '每日签到'
  const deckKey = (uid, suf) => `${P}.${uid}${suf}`
  const cacheKey = (uid) => `${P}.${uid}的抽卡缓存`
  const pointsKey = (uid) => `${NS}.${uid}的P点`

  // ── helpers (gacha-local) ────────────────────────────────────────
  function rollCard(rarity) {
    return H.randInt(1, config.cardCount[rarity - 1])
  }
  function cardId(rarity, idx) {
    return `/${rarity}/${idx}.`
  }
  function cardImage(rarity, idx) {
    return `${config.imageDir}/${rarity}/${idx}.${config.imageExt}`
  }
  function rollRarityCustom(thresholds) {
    const r = H.randInt(1, thresholds[3])
    if (r <= thresholds[0]) return 1
    if (r <= thresholds[1]) return 2
    if (r <= thresholds[2]) return 3
    return 4
  }
  function rollRarityDraw() { return rollRarityCustom(config.drawThresholds) }
  function rollRaritySacrifice() { return rollRarityCustom(config.sacrificeThresholds) }

  async function getPoints(uid) {
    return H.safeNum(await H.kvGet(pointsKey(uid)))
  }
  async function addPoints(uid, delta) {
    const cur = await getPoints(uid)
    const next = Math.max(0, cur + delta)
    await H.kvSet(pointsKey(uid), next)
    return next
  }
  async function setPoints(uid, value) {
    await H.kvSet(pointsKey(uid), Math.max(0, value | 0))
  }

  // Build a gacha-result message (used for 抽卡, 连续抽卡, 献祭抽卡)
  // If autoFilledSlot is set, appends "此卡已自动存入你卡组的第N位".
  function buildGachaResult({ rarity, idx, remainingPoints, autoFilledSlot = null, handHint = true }) {
    const lines = [
      h("image", { url: cardImage(rarity, idx) }),
      "\n",
      h("at", { id: this.session.userId }),
      "",
      H.rarityName(rarity, { rarityNames: config.rarityNames }),
      "",
    ]
    if (handHint) {
      lines.push(`此卡在你手中，请手动加入卡组\n`)
    }
    lines.push(`你还有${remainingPoints}P点\n`)
    lines.push(`也就是${Math.floor(remainingPoints / config.drawCost)}抽。\n`)
    lines.push(`请仔细阅读"抽卡帮助"！\n`)
    if (autoFilledSlot) {
      lines.push(`此卡已自动存入你卡组的第${autoFilledSlot}位`)
    }
    return lines.join("")
  }

  // Card store / load / fill logic
  async function getDeck(uid) {
    const raw = await H.kvGet(deckKey(uid, "卡组"))
    return H.parseDeck(raw)
  }
  async function setDeck(uid, deck) {
    await H.kvSet(deckKey(uid, "卡组"), H.serializeDeck(deck))
  }
  async function loadOrInitDeck(uid) {
    let deck = await getDeck(uid)
    if (!deck) deck = H.emptyDeck(config.maxDeckSize)
    return H.fillDeckSlots(deck)
  }
  async function clearCache(uid) {
    await H.kvDel(cacheKey(uid))
  }
  // Read a stored card (string '/X/Y.') and return its rarity number (1..4)
  function rarityOfCard(cardStr) {
    if (!cardStr || cardStr === "0") return 0
    return Number(cardStr.charAt(1)) || 0
  }

  // ── 抽卡帮助（合并转发消息，raw onebot API 走 LLOneBot 兼容字段） ─
  ctx.command("抽卡帮助").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const R = config.rarityNames
      const T = config.drawThresholds
      const p1 = T[0] / 10
      const p2 = (T[1] - T[0]) / 10
      const p3 = (T[2] - T[1]) / 10
      const p4 = (T[3] - T[2]) / 10
      const lines = [
        `【抽卡与卡组】\n卡组容量 ${config.maxDeckSize} 张\n单抽消耗 ${config.drawCost} P 点`,

        `【基础抽卡】\n\n抽卡\n→ 1 抽，消耗 ${config.drawCost} P 点\n（别名：进行抽卡）\n\n连续抽卡 [目标]\n→ 一直抽，直到命中目标稀有度\n目标可输：3 / 三 / 三星\n            4 / 四 / 四星\n            FES / fes\n\n快速抽卡\n→ 把卡组抽满\n（每个空位 ${config.drawCost} P 点）`,

        `【查看 & 管理】\n\n卡组\n→ 查看自己的 ${config.maxDeckSize} 张卡\n（合并转发，建议私发 bot）\n\n加入 [位置]\n→ 把刚抽到的卡放进卡组\n（位置范围 1-${config.maxDeckSize}）\n\n交换位置 [A] [B]\n→ 卡组内两张卡交换位置\n（A、B 都是 1-${config.maxDeckSize} 的整数）\n\n我有几抽\n→ 当前 P 点能抽几次`,

        `【献祭】（卡组满 ${config.maxDeckSize} 张后才可用）\n\n献祭 1 2 3 4\n→ 献祭指定位置，按稀有度返 P 点\n（每次 3~${config.maxDeckSize} 张）\n\n献祭 全部\n→ 献祭全部 ${config.maxDeckSize} 张卡\n\n献祭 抽卡\n→ 献祭全部，必中 3 星以上\n（清空卡组）`,

        `【概率】\n普通抽卡\n  ${R[0]} ${p1}%\n  ${R[1]} ${p2}%\n  ${R[2]} ${p3}%\n  ${R[3]} ${p4}%\n献祭抽卡\n  ${R[1]} 0%\n  ${R[2]} 95%\n  ${R[3]} 5%`,

        `【提示】\n· 抽到的卡先放在"手上"\n  再抽一次会覆盖手上的卡\n· 卡组有空格时自动存入\n  没空格就手动用「加入 [位置]」\n· 抢 P 点说明看「签到帮助」`,
      ]
      const nodes = lines.map(t => H.buildHelpNode(session, t))
      await H.sendHelpForward(session, nodes)
      return null
    }, "抽卡帮助")
  })

  // ── 卡组（合并转发消息，绕过 satorijs 渲染用 raw onebot API） ─────
  // Why raw: satorijs onebot adapter encodes forward node authors as
  // `data.uin / data.name` (the go-cqhttp field names). LLOneBot expects
  // `data.user_id / data.nickname` and silently ignores the satorijs
  // fields, falling back to "current message recipient" — so every node
  // renders as if the user themselves sent it.
  // Bypassing the satorijs encoder and calling session.bot.internal
  // directly lets us send the exact field names LLOneBot wants.
  const PRIVATE_PFX = "private:"
  ctx.command("卡组").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      let deck = await getDeck(uid)
      if (!deck) {
        await session.send("你还没有卡组，收集卡牌以组成卡组。")
        return null
      }
      deck = H.parseDeck(deck)
      for (let i = 0; i < config.maxDeckSize; i++) {
        if (deck[i] == null) deck[i] = "0"
      }
      await setDeck(uid, deck)

      const botName = session.bot?.user?.name || String(session.selfId) || "bot"
      const botUserId = parseInt(session.selfId)
      const isDirect = session.isDirect
      const channelId = session.event?.channel?.id || session.channelId

      const nodes = [
        {
          type: "node",
          data: {
            user_id: botUserId,
            nickname: botName,
            content: [
              { type: "at", data: { qq: uid } },
              { type: "text", data: { text: "  你当前的卡组为：" } },
            ],
          },
        },
      ]
      for (let i = 0; i < config.maxDeckSize; i++) {
        const content = []
        if (deck[i] !== "0") {
          const r = rarityOfCard(deck[i])
          content.push(
            { type: "text", data: { text: `第${i + 1}张：${H.rarityName(r, { rarityNames: config.rarityNames })}` } },
            { type: "image", data: { file: `${config.imageDir}${deck[i]}${config.imageExt}` } },
          )
        } else {
          content.push(
            { type: "text", data: { text: `第${i + 1}张：没有卡牌` } },
          )
        }
        nodes.push({
          type: "node",
          data: {
            user_id: botUserId,
            nickname: botName,
            content,
          },
        })
      }

      // Send via raw onebot API. The two flavours differ by isDirect.
      if (isDirect) {
        const peerUid = channelId.startsWith(PRIVATE_PFX)
          ? channelId.slice(PRIVATE_PFX.length)
          : uid
        await session.bot.internal.sendPrivateForwardMsg(peerUid, nodes)
      } else {
        await session.bot.internal.sendGroupForwardMsg(channelId, nodes)
      }
      return null
    }, "卡组")
  })

  // ── 连续抽卡 ────────────────────────────────────────────────────
  ctx.command("连续抽卡 [target:text]").action(async ({ session }, target) => {
    return await H.withErrorBoundary(session, async () => {
      if (!target) {
        await session.send(`${h("at", { id: session.userId })} 输入抽卡目标：3 / 三 / 三星 / 4 / 四 / 四星 / FES / fes`)
        target = await session.prompt(60000)
      }
      const targetRarity = H.parseRarity(target)
      if (targetRarity === 0) {
        return `${h("at", { id: session.userId })}  你输入的啥啊笨蛋`
      }
      if (targetRarity === 2) {
        return `${h("at", { id: session.userId })}抽二星干嘛？我看你是想被抽了`
      }
      // (FES, 3星, 4星 accepted)

      const uid = String(session.userId)
      const startPoints = await getPoints(uid)
      if (startPoints < config.drawCost) {
        if (startPoints === 0) {
          await session.send("没有积分，请先签到获得积分。")
        } else {
          await session.send(`当前积分为${startPoints}点，一抽都不够，你想干啥`)
        }
        logger.error(`${uid} 抽卡失败，积分不足`)
        return null
      }
      const maxDraws = Math.floor(startPoints / config.drawCost)
      let drawsUsed = 0
      let lastRarity = 0
      let lastIdx = 0
      let stopReason = null  // 'hit' | 'exhausted'

      // Roll until target rarity hit or draws exhausted
      for (let i = 1; i <= maxDraws; i++) {
        const r = rollRarityDraw()
        drawsUsed = i
        lastRarity = r
        lastIdx = rollCard(r)
        // Determine if this roll hits or exceeds target
        if (r >= targetRarity) {
          await session.send(`在第${i}次抽到${H.rarityName(r, { rarityNames: config.rarityNames })}，消耗${i * config.drawCost}P点`)
          stopReason = 'hit'
          break
        }
      }
      if (!stopReason) stopReason = 'exhausted'

      const cost = drawsUsed * config.drawCost
      const newPoints = startPoints - cost
      // Cache the card
      await H.kvSet(cacheKey(uid), cardId(lastRarity, lastIdx))
      if (stopReason === 'exhausted') {
        // No hit
        const finalPoints = await H.kvGet(pointsKey(uid))  // re-read to be safe
        await setPoints(uid, newPoints)
        return [
          h("at", { id: uid }),
          `真可惜呢花光了也没抽到\n`,
          `你还有${finalPoints}P点\n`,
          `最后一次抽卡结果：\n`,
          H.rarityName(lastRarity, { rarityNames: config.rarityNames }),
          h("image", { url: cardImage(lastRarity, lastIdx) }),
        ].join("")
      }
      // Hit: persist new points + try auto-fill
      await setPoints(uid, newPoints)
      const deck = await loadOrInitDeck(uid)
      const slot = H.findFirstEmpty(deck)
      if (slot >= 0) {
        deck[slot] = cardId(lastRarity, lastIdx)
        await setDeck(uid, deck)
        await clearCache(uid)
        const finalPoints = await H.kvGet(pointsKey(uid))
        await session.send([
          h("image", { url: cardImage(lastRarity, lastIdx) }), "\n",
          h("at", { id: uid }), "",
          H.rarityName(lastRarity, { rarityNames: config.rarityNames }), "", "\n",
          `你还有${finalPoints}P点\n`,
          `也就是${Math.floor(newPoints / config.drawCost)}抽。\n`,
          `请仔细阅读"抽卡帮助"！\n`,
          `此卡已自动存入你卡组的第${slot + 1}位`,
        ].join(""))
        logger.info(`${uid} 抽到了一张${H.rarityName(lastRarity, { rarityNames: config.rarityNames })}卡，剩余${finalPoints}P点`)
        return null
      } else {
        // Hand: user must 加入卡组 manually
        const finalPoints = await H.kvGet(pointsKey(uid))
        await session.send([
          h("image", { url: cardImage(lastRarity, lastIdx) }), "\n",
          h("at", { id: uid }), "",
          H.rarityName(lastRarity, { rarityNames: config.rarityNames }), "", "\n",
          `此卡在你手中，请手动加入卡组\n`,
          `你还有${finalPoints}P点\n`,
          `也就是${Math.floor(newPoints / config.drawCost)}抽。\n`,
          `请仔细阅读"抽卡帮助"！\n`,
        ].join(""))
        logger.info(`${uid} 抽到了一张${H.rarityName(lastRarity, { rarityNames: config.rarityNames })}卡，剩余${finalPoints}P点`)
        return null
      }
    }, "连续抽卡")
  })

  // ── 抽卡 (alias: 进行抽卡) ──────────────────────────────────────
  // 抽卡是主名（authority 0，最短），"进行抽卡"是历史 alias
  ctx.command("抽卡", { authority: 0 }).alias("进行抽卡").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      const startPoints = await getPoints(uid)
      if (startPoints < config.drawCost) {
        if (startPoints === 0) {
          await session.send("没有积分，请先签到获得积分。")
        } else {
          await session.send(`当前积分为${startPoints}点，不够一抽。一抽要${config.drawCost}呢`)
        }
        logger.error(`${uid} 抽卡失败，积分不足`)
        return null
      }
      const r = rollRarityDraw()
      const idx = rollCard(r)
      const newPoints = startPoints - config.drawCost
      await H.kvSet(cacheKey(uid), cardId(r, idx))
      await setPoints(uid, newPoints)

      const deck = await loadOrInitDeck(uid)
      const slot = H.findFirstEmpty(deck)
      if (slot >= 0) {
        deck[slot] = cardId(r, idx)
        await setDeck(uid, deck)
        await clearCache(uid)
        const finalPoints = await H.kvGet(pointsKey(uid))
        await session.send([
          h("image", { url: cardImage(r, idx) }), "\n",
          h("at", { id: uid }), "",
          H.rarityName(r, { rarityNames: config.rarityNames }), "", "\n",
          `你还有${finalPoints}P点\n`,
          `也就是${Math.floor(newPoints / config.drawCost)}抽。\n`,
          `请仔细阅读"抽卡帮助"！\n`,
          `此卡已自动存入你卡组的第${slot + 1}位`,
        ].join(""))
        logger.info(`${uid} 抽到了一张${H.rarityName(r, { rarityNames: config.rarityNames })}卡，剩余${finalPoints}P点`)
        return null
      } else {
        const finalPoints = await H.kvGet(pointsKey(uid))
        await session.send([
          h("image", { url: cardImage(r, idx) }), "\n",
          h("at", { id: uid }), "",
          H.rarityName(r, { rarityNames: config.rarityNames }), "", "\n",
          `此卡在你手中，请手动加入卡组\n`,
          `你还有${finalPoints}P点\n`,
          `也就是${Math.floor(newPoints / config.drawCost)}抽。\n`,
          `请仔细阅读"抽卡帮助"！\n`,
        ].join(""))
        logger.info(`${uid} 抽到了一张${H.rarityName(r, { rarityNames: config.rarityNames })}卡，剩余${finalPoints}P点`)
        return null
      }
    }, "抽卡")
  })

  // ── 献祭 [抽卡 | 1 2 3 | 全部] ──────────────────────────────────
  // Usage: 献祭 抽卡   → 必中 3星+ 抽卡（清空卡组）
  //        献祭 全部   → 献祭全部 10 张拿 P 点
  //        献祭 1 2 3 4 → 献祭指定位置（3~maxDeckSize 张）
  ctx.command("献祭").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      const deck = await getDeck(uid)
      if (!deck) {
        return `卡组未满，收集${config.maxDeckSize}张卡牌填满卡组，然后你可以献祭其中3张以上获得P点\n或者全部献祭进行一次必定三星以上的抽卡。（用法：献祭 抽卡 / 献祭 全部 / 献祭 1 2 3）`
      }
      // Check all slots filled
      for (let i = 0; i < config.maxDeckSize; i++) {
        if (deck[i] == null || deck[i] === "0") {
          return `卡组未满，收集${config.maxDeckSize}张卡牌填满卡组，然后你可以献祭其中3张以上获得P点\n或者全部献祭进行一次必定三星以上的抽卡。（用法：献祭 抽卡 / 献祭 全部 / 献祭 1 2 3）`
        }
      }

      // Parse args from session.content. Koishi 4.x doesn't always strip the
      // command name from session.content, so defensively remove "献祭"
      // prefix before splitting.
      let text = (session.content || "").trim()
      text = text.replace(/^献祭\s*/, "")
      const tokens = text.length > 0 ? text.split(/\s+/) : []

      if (tokens.length === 0) {
        return `用法：献祭 抽卡 / 献祭 全部 / 献祭 1 2 3 4`
      }

      // Mode 1: 献祭 抽卡
      if (tokens.length === 1 && tokens[0] === "抽卡") {
        const r = rollRaritySacrifice()
        const idx = rollCard(r)
        await H.kvSet(cacheKey(uid), cardId(r, idx))
        await session.send([
          h("image", { url: cardImage(r, idx) }), "\n",
          h("at", { id: uid }),
          `你献祭了卡组抽到了一张${H.rarityName(r, { rarityNames: config.rarityNames })}卡牌！\n`,
          `输入"加入卡组"将这张卡牌加入卡组。`,
        ].join(""))
        await H.kvDel(deckKey(uid, "卡组"))  // 献祭后清空
        return null
      }

      // Mode 2: 献祭 全部
      if (tokens.length === 1 && tokens[0] === "全部") {
        const positions = Array.from({ length: config.maxDeckSize }, (_, i) => i + 1)
        return await doSacrifice(uid, deck, positions, session)
      }

      // Mode 3: 献祭 1 2 3 4 ...  (numeric positions)
      const positions = []
      for (const t of tokens) {
        const n = Number(t)
        if (!Number.isInteger(n) || n < 1 || n > config.maxDeckSize) {
          return `位置 "${t}" 无效，请用 1-${config.maxDeckSize} 的整数、全部、或 抽卡`
        }
        positions.push(n)
      }
      // Dedupe (用户可能重复输入)
      const uniquePositions = [...new Set(positions)]
      if (uniquePositions.length < 3) {
        return `献祭数量不足3个（当前${uniquePositions.length}）`
      }
      return await doSacrifice(uid, deck, uniquePositions, session)
    }, "献祭")
  })

  // Shared sacrifice body — picks up payouts + DB writes
  async function doSacrifice(uid, deck, positions, session) {
    // Validate positions still point at filled slots (defense vs concurrent state)
    for (const p of positions) {
      const r = deck[p - 1]
      if (!r || r === "0") return `位置 ${p} 没有卡牌，请重新输入`
    }
    let payout = 0
    const rarityCount = [0, 0, 0, 0]
    for (const p of positions) {
      const slotIdx = p - 1
      const r = rarityOfCard(deck[slotIdx])
      payout += config.rarityValues[r - 1]
      rarityCount[r - 1]++
      deck[slotIdx] = "0"
    }
    await setDeck(uid, deck)
    const payoutInt = Math.round(config.drawCost * payout)
    const newPoints = await addPoints(uid, payoutInt)

    const summary = []
    summary.push(h("at", { uid }), "你献祭了：\n")
    if (rarityCount[0] > 0) summary.push(`${rarityCount[0]}张二星\n`)
    if (rarityCount[1] > 0) summary.push(`${rarityCount[1]}张三星\n`)
    if (rarityCount[2] > 0) summary.push(`${rarityCount[2]}张四星\n`)
    if (rarityCount[3] > 0) summary.push(`${rarityCount[3]}张FES\n`)
    summary.push(`获得${payoutInt}P点！\n`)
    summary.push(`当前P点数${newPoints}`)
    await session.send(summary.join(""))

    const logSummary = []
    logSummary.push(`${uid} 献祭了：`)
    if (rarityCount[0] > 0) logSummary.push(`${rarityCount[0]}张二星  `)
    if (rarityCount[1] > 0) logSummary.push(`${rarityCount[1]}张三星  `)
    if (rarityCount[2] > 0) logSummary.push(`${rarityCount[2]}张四星  `)
    if (rarityCount[3] > 0) logSummary.push(`${rarityCount[3]}张FES  `)
    logSummary.push(`获得${payoutInt}P点，当前P点数为${newPoints}`)
    logger.success(logSummary.join(""))
    return null
  }

  // ── 交换位置 [A] [B] ────────────────────────────────────────────
  ctx.command("交换位置").action(async ({ session }, ...args) => {
    return await H.withErrorBoundary(session, async () => {
      const p1 = Number(args[0])
      const p2 = Number(args[1])
      if (!(p1 >= 1 && p1 <= config.maxDeckSize) || !(p2 >= 1 && p2 <= config.maxDeckSize)) {
        return `输入位置有误，请输入两个1到${config.maxDeckSize}之间的数`
      }
      if (p2 === p1) return "怎么还原地tp"
      const uid = String(session.userId)
      const deck = await getDeck(uid)
      if (!deck) return "你还没有卡组"
      const tmp = deck[p1 - 1]
      deck[p1 - 1] = deck[p2 - 1]
      deck[p2 - 1] = tmp
      await setDeck(uid, deck)
      await session.send([
        h("at", { id: uid }),
        `已将第${p1}张卡与第${p2}张卡交换位置`,
      ].join(""))
      return null
    }, "交换位置")
  })

  // ── 加入卡组 ────────────────────────────────────────────────────
  ctx.command("加入").action(async ({ session }, ...args) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      const cache = await H.kvGet(cacheKey(uid))
      if (!cache) return "你还没有抽卡！"
      const slot = Math.floor(Number(args[0]))
      if (!(slot >= 1 && slot <= config.maxDeckSize)) {
        return `卡组位置错误，请输入1-${config.maxDeckSize}数值以加入到卡组的指定位置。`
      }
      const deck = await loadOrInitDeck(uid)
      const prev = deck[slot - 1]
      if (prev === "0" || prev == null) {
        await session.send(`已将其保存为卡组的第${slot}张卡牌。`)
      } else {
        await session.send(`已将其替换为卡组的第${slot}张卡牌。`)
      }
      deck[slot - 1] = cache
      await setDeck(uid, deck)
      await clearCache(uid)
      return null
    }, "加入")
  })

  // ── 我有几抽 ────────────────────────────────────────────────────
  ctx.command("我有几抽").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      const points = await getPoints(uid)
      if (points == null || points === 0) {
        await session.send("没有积分，请先获得积分。")
        return null
      }
      await session.send([
        `当前积分为${points}点。\n`,
        `抽卡消耗积分${config.drawCost}点，因此你现在有${Math.floor(points / config.drawCost)}抽。`,
      ].join(""))
      return null
    }, "我有几抽")
  })

  // ── 快速抽卡 ────────────────────────────────────────────────────
  ctx.command("快速抽卡").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      let points = await getPoints(uid)
      if (points < config.drawCost) {
        if (points === 0) {
          await session.send("没有积分，请先签到获得积分。")
        } else {
          await session.send(`当前积分为${points}点，不够一抽。一抽要${config.drawCost}呢`)
        }
        logger.error(`${uid} 抽卡失败，积分不足`)
        return null
      }
      const deck = await loadOrInitDeck(uid)
      const dist = [0, 0, 0, 0]
      const filled = []

      for (let i = 0; i < config.maxDeckSize; i++) {
        if (points < config.drawCost) break
        if (deck[i] === "0") {
          const r = rollRarityDraw()
          const idx = rollCard(r)
          dist[r - 1]++
          points = points - config.drawCost
          await setPoints(uid, points)
          filled.push(i + 1)
          deck[i] = cardId(r, idx)
        }
      }
      await setDeck(uid, deck)
      const distStr = [
        dist[0] > 0 ? `${dist[0]}张二星  \n` : null,
        dist[1] > 0 ? `${dist[1]}张三星  \n` : null,
        dist[2] > 0 ? `${dist[2]}张四星  \n` : null,
        dist[3] > 0 ? `${dist[3]}张FES  \n` : null,
        "一共",
      ].filter(x => x).join("")
      const lowPoints = points < config.drawCost
      const summary = [
        "你抽到了：\n",
        distStr,
        `${filled.length}张卡\n已存入你卡组的第${filled.join(", ")}位\n`,
        lowPoints ? `你只剩${points}P点了，不够抽了` : `你还有${points}P点`,
      ].join("")
      await session.send(summary)
      return null
    }, "快速抽卡")
  })
}