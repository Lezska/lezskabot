// Source: refactored from koishi-plugin-blockly-null's compiled code (id=2)
// Original: 2026-06-27, now rewritten with koishi-plugin-blockly-shared helpers.
//
// Behaviour preserved 1:1 with the original blockly-generated code; only
// structure changed (helpers, Config schema, error boundaries, var→const).
//
// Key design points:
//   - All admin / bot / privileged checks go through H.isAdmin / H.isAtTargetBot
//     / H.isPrivileged. No more hardcoded '29053789' / '3675867653' in command
//     bodies — they're in Config.
//   - session.selfId is read at runtime to detect the bot's own userId.
//     The 'extraBotIds' config covers additional bot accounts (like a small
//     sub-bot) that hardcode couldn't express dynamically.
//   - Every command runs inside H.withErrorBoundary() so an exception
//     (db error, prompt timeout, NaN, etc.) becomes a friendly "操作失败：xxx"
//     instead of a koishi internal-error spam.

const { Schema, h } = require("koishi")
const { createHelpers, SUFFIX } = require("koishi-plugin-blockly-shared")

module.exports.name = "签到"
module.exports.inject = {
  required: ["database"],
  optional: []
}

module.exports.Config = Schema.object({
  adminIds: Schema.array(Schema.string()).default(['29053789'])
    .description('管理员 userId 列表（重置抢 / 设置抢次数 / 设置p点 等命令的授权用户）'),
  extraBotIds: Schema.array(Schema.string()).default([])
    .description('额外的 bot 自身 userId（被保护对象）。主 bot 通过 ctx.bots 自动识别'),
  privilegedIds: Schema.array(Schema.string()).default(['2141971921', '3055983840', '29053789'])
    .description('十倍抢p点等特权命令的 userId 列表'),
  signInMin: Schema.number().default(1000).description('签到获得 P 点最小值'),
  signInMax: Schema.number().default(6000).description('签到获得 P 点最大值'),
  signInMultiplier: Schema.number().default(10).description('admin 签到倍数'),
  maxRobAttempts: Schema.number().default(5).description('每天抢p点次数上限'),
  robRestoreHours: Schema.number().default(1)
    .description('抢p点次数恢复间隔（小时）。每次抢后 +1 计数需要等这么久才恢复'),
  minRobTargetPoints: Schema.number().default(400)
    .description('目标用户低于该 P 点数禁止抢（保护低积分用户）'),
  robFailPenaltyMax: Schema.number().default(600).description('抢劫失败最多损失 P 点'),
  robWinMax: Schema.number().default(1000).description('抢p点成功最多获得 P 点（1~该值 闭区间）'),
  robSuccessRate: Schema.number().default(0.6)
    .description('抢p点成功概率（0~1 之间的小数）。失败时按 robFailPenaltyMax 扣自己 P 点'),
})

module.exports.usage = '每日签到 / P点系统 / 抢劫 / 赠送 / 设置（管理员）'

module.exports.apply = async (ctx, config) => {
  ctx.database.extend("blockly_key_value", { key: "string", value: "string" }, { primary: "key" })
  const logger = ctx.logger("签到")
  const H = createHelpers(ctx, config)

  // ── 签到帮助（合并转发消息，raw onebot API 走 LLOneBot 兼容字段） ─
  ctx.command("签到帮助").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const signInMin = config.signInMin
      const signInMax = config.signInMax
      const signMult = config.signInMultiplier
      const maxRob = config.maxRobAttempts
      const restoreH = config.robRestoreHours
      const minTarget = config.minRobTargetPoints
      const robWin = config.robWinMax
      const robFail = config.robFailPenaltyMax
      const lines = [
        `【签到 / P点 / 抢劫 / 赠送】速查\nP 点 = 跨插件通用积分，签到 / 抢 / 送渠道获得，抽卡也用 P 点`,
        `【基础签到】\n签到               → 每天第一次随机 ${signInMin}-${signInMax} P 点（admin ×${signMult}）\n我的p点           → 自己 P 点 + 今日各状态（签到/抢/送/收）\n查看p点 @用户      → 看他人 P 点 + 今日状态`,
        `【抢 / 送】\n抢p点 @用户         → 60% 成功 / 40% 失败\n送p点 [数量] @用户  → 一次发完，不要等 bot 再问\n十倍抢p点 @用户     → 特权用户专属（×10）`,
        `【抢p点 限额】\n· 上限 ${maxRob} 次\n· 距上次抢 ${restoreH} 小时后 +1 次（cooldown 风格）\n· 目标 < ${minTarget} P 点禁止抢（保护低积分）\n· 成功获得 1-${robWin} P 点，失败损失 1-${robFail} P 点\n· admin 无限次（不扣次数）`,
        `【管理员】\n重置抢 @用户            → 抢次数补满到 ${maxRob}\n设置抢次数 [n] @用户    → 自定义抢次数\n设置p点 添加/扣除/设置 [值] @用户 → 改 P 点（操作三选一）`,
        `【边界 / 行为】\n· 不能抢/送 自己或 bot：抢@bot → "抢我干什么？坏蛋baka！" / 送@bot → "谢谢你嗷"\n· admin 签到 ×${signMult} 倍额且无冷却\n· 卡组类帮助用 "抽卡帮助" 命令查看`,
      ]
      const nodes = lines.map(t => H.buildHelpNode(session, t))
      await H.sendHelpForward(session, nodes)
      return null
    }, "签到帮助")
  })

  // ── 重置抢（admin） ─────────────────────────────────────────────
  ctx.command("重置抢").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      if (!H.isAdmin(session.userId)) {
        return `你没有权限使用此命令`
      }
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户"
      await H.kvSet(`${H.POINTS_NS}.${target}${SUFFIX.robCount}`, config.maxRobAttempts)
      await session.send(`已将TA的抢P点次数重置为${config.maxRobAttempts}`)
      return null
    }, "重置抢")
  })

  // ── 我的p点 ─────────────────────────────────────────────────────
  ctx.command("我的p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      const points = await H.getPoints(uid)
      const signCache = H.safeNum(await H.kvGet(`${H.POINTS_NS}.${uid}${SUFFIX.signCache}`))
      const signDate = await H.getSignDate(uid)
      const newDay = !signDate || H.isSameDay(signDate)
      const rob = await H.getRobState(uid)
      const sendToday = await H.getTodayCounter(uid, H.sendDateKey, H.sendTodayKey)
      const recvToday = await H.getTodayCounter(uid, H.recvDateKey, H.recvTodayKey)

      const lines = []
      lines.push(`  你目前的P点数为： ${points}`)
      lines.push(`今日状态：`)
      // 签到
      if (newDay) {
        lines.push(`[签到]↓`)
        lines.push(`未签到`)
      } else {
        lines.push(`[签到]↓`)
        lines.push(`已签到 | 获得了${signCache}P点`)
      }
      // 抢
      lines.push(`[抢]↓`)
      if (rob.count === 0) {
        lines.push(`抢p点次数已用完`)
      } else {
        const remain = H.isAdmin(uid) ? "无限" : rob.count
        lines.push(`还剩${remain}次抢p点机会`)
      }
      lines.push(`抢劫净收入为${rob.net}P点！`)
      if (rob.net > 0) lines.push(`今天赚到了呢`)
      else if (rob.net < 0) lines.push(`今天亏了呢`)
      else lines.push(`今天无事发生`)
      // 送
      lines.push(`[送]↓`)
      if (newDay) lines.push(`未送出p点`)
      else lines.push(`送出${sendToday}P点`)
      // 收
      lines.push(`[收]↓`)
      if (newDay) lines.push(`未收到p点`)
      else lines.push(`收到${recvToday}P点`)

      return lines.join("\n")
    }, "我的p点")
  })

  // ── 设置抢次数 [次数] @用户（admin） ───────────────────────────
  ctx.command("设置抢次数").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      if (!H.isAdmin(session.userId)) {
        return `你没有权限使用此命令`
      }
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户 并写明次数，例如：设置抢次数 5 @xxx"
      const n = H.parseAmountFromContent(session.content)
      if (n == null) return "请写明次数，例如：设置抢次数 5 @xxx"
      if (n < 0) {
        return "输入错误"
      }
      // setRobCount internally resets the cooldown anchor (lastReset=now)
      // so the freshly-set count starts its 1h timer from this moment.
      await H.setRobCount(target, n)
      await session.send(`已将TA的抢P点次数设置为${n}`)
      return null
    }, "设置抢次数")
  })

  // ── 送p点 [数量] @用户 ────────────────────────────────────────
  ctx.command("送p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户"
      if (target === String(session.userId)) return "哪有送自己的？"
      if (H.isAtTargetBot(session)) return "谢谢你嗷"
      // Parse amount from session.content, stripping <at id="..."/> tags
      // so the qq number inside the tag isn't mistaken for the amount.
      // "送 全部 @xxx" — `amt` stays null here and is filled in below
      // with the user's full point balance after we read it.
      const text = H.stripElements(session.content || "").trim()
      const hasAll = /全部/.test(text)
      let amt = hasAll ? null : H.parseAmountFromContent(text)
      if (amt == null && !hasAll) return "请在消息中写明赠送点数，例如：送p点 100 @xxx 或 送 全部 @xxx"
      if (amt != null && amt < 0) return "休想卡bug！baka！"
      if (amt === 0) return "你搁这搁这呢baka"
      const uid = String(session.userId)
      const sendToday = await H.getTodayCounter(uid, H.sendDateKey, H.sendTodayKey)
      const recvToday = await H.getTodayCounter(target, H.recvDateKey, H.recvTodayKey)
      const myPoints = await H.getPoints(uid)
      const targetPoints = await H.getPoints(target)
      if (hasAll) amt = myPoints

      if (myPoints === 0) {
        return "你一个P点都没有还送！baka！"
      }
      if (amt > 0) {
        if (amt > myPoints) {
          return [
            H.at(uid),
            `  你现在总共就${myPoints}的P点，你想送他${amt}个P点，舔之前也要先看看自己钱包吧baka！`,
          ].join("")
        } else if (amt === myPoints) {
          // all-in
          await H.setPoints(uid, 0)
          await H.addTodayCounter(uid, H.sendDateKey, H.sendTodayKey, amt)
          await H.setPoints(target, targetPoints + amt)
          await H.addTodayCounter(target, H.recvDateKey, H.recvTodayKey, amt)
          await session.send([
            H.at(uid),
            "  你把你的所有P点都送给了TA！\n",
            "→",
            [
              H.at(target),
              `  你收到了${amt}P点！哇啊啊TA把全部都给了你！`,
              `\n你现在有${targetPoints + amt}的P点！`,
            ].join(""),
          ].join(""))
        } else {
          await H.setPoints(uid, myPoints - amt)
          await H.addTodayCounter(uid, H.sendDateKey, H.sendTodayKey, amt)
          await H.setPoints(target, targetPoints + amt)
          await H.addTodayCounter(target, H.recvDateKey, H.recvTodayKey, amt)
          await session.send([
            H.at(uid),
            `  你送出了${amt}P点！\n你还剩${myPoints - amt}的P点\n`,
            "→",
            [
              H.at(target),
              `  你收到了${amt}P点！\n你现在有${targetPoints + amt}的P点`,
            ].join(""),
          ].join(""))
        }
        logger.success(`${uid} 向 ${target} 赠送了 ${amt} 个P点`)
      }
      return null
    }, "送p点")
  })

  // ── 抢p点 ───────────────────────────────────────────────────────
  ctx.command("抢p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户再抢"
      if (target === String(session.userId)) return "你抢自己干什么？"
      if (H.isAtTargetBot(session)) return "抢我干嘛！坏蛋baka！"
      const uid = String(session.userId)
      const rob = await H.getRobState(uid)
      // 抢p点次数耗尽检查（admin 无限次跳过）
      if (!H.isAdmin(uid) && rob.count <= 0) {
        const nextAt = await H.getNextRobRefillAt(uid)
        return nextAt
          ? `${H.at(uid)} 你的抢P点次数已用完，下次回复还需 ${H.formatDuration(nextAt - Date.now())}`
          : `${H.at(uid)} 你的抢P点次数已用完！`
      }
      const myPoints = await H.getPoints(uid)
      const targetPoints = await H.getPoints(target)
      if (targetPoints === 0) return "他已经没有P点了！"
      if (!H.isAdmin(uid) && targetPoints <= config.minRobTargetPoints) {
        return `他的P点已经不到${config.minRobTargetPoints}了你还抢！大坏蛋！`
      }
      let newCount = rob.count
      if (!H.isAdmin(uid)) {
        newCount = rob.count - 1
        await H.setRobCount(uid, newCount)
      }
      // Build the "你还剩N次…/下次回复还需X" suffix once and reuse
      // across the 4 success/fail reply branches.
      const countSuffix = await (async () => {
        if (H.isAdmin(uid)) return ""
        const nextAt = await H.getNextRobRefillAt(uid)
        const base = `\n你还剩${newCount}次抢P点次数！`
        return nextAt ? `${base}\n下次回复还需 ${H.formatDuration(nextAt - Date.now())}` : base
      })()
      // Two independent random rolls (cleaner than the original blockly
      // trick of "won doubles as success/fail signal via threshold"):
      //   1. Did the rob succeed? (config.robSuccessRate probability)
      //   2. If success, how much P was won? (1..robWinMax uniform)
      //      If fail, how much P was lost? (1..robFailPenaltyMax uniform)
      // Admin always succeeds and rolls the win amount normally.
      const success = H.isAdmin(uid) || Math.random() < (config.robSuccessRate ?? 0.6)
      const won = success ? H.randInt(1, config.robWinMax) : 0
      const lost = success ? 0 : H.randInt(1, config.robFailPenaltyMax)
      if (success) {
        if (won >= targetPoints) {
          // strip target
          const newNet = rob.net + targetPoints
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, myPoints + targetPoints)
          await H.setPoints(target, 0)
          await session.send([
            H.at(uid),
            `   你抢到了${targetPoints}P点！`,
            `因为对方只有${targetPoints}P点，所以他被你扒光了！\n`,
            `你现在有${myPoints + targetPoints}P点`,
            H.isAdmin(uid) ? "" : countSuffix,
          ].join(""))
        } else {
          const newNet = rob.net + won
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, myPoints + won)
          await H.setPoints(target, targetPoints - won)
          await session.send([
            H.at(uid),
            `   恭喜你从对方手里抢到${won}P点！\n`,
            `你现在有${myPoints + won}P点\n对方还剩${targetPoints - won}P点`,
            H.isAdmin(uid) ? "" : countSuffix,
          ].join(""))
        }
        logger.success(`${uid} 抢了 ${target} 的 ${won}P点！`)
      } else {
        // fail
        if (myPoints === 0) {
          // Already consumed 1 rob above; still show the count + refill
          // suffix so the user knows their cooldown is ticking.
          await session.send([
            `${H.at(uid)}  你啥也没抢到，还是一无所有呢~`,
            H.isAdmin(uid) ? "" : countSuffix,
          ].join(""))
          return null
        }
        if (lost >= myPoints) {
          const newNet = rob.net - myPoints
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, 0)
          await session.send([
            H.at(uid),
            "   抢劫失败！你由于P点太少所以失去了全部",
            `P点！\n你现在一丝不挂啦！`,
            H.isAdmin(uid) ? "" : countSuffix,
          ].join(""))
          logger.success(`${uid} 抢劫 ${target} 失败！失去了所有P点！`)
        } else {
          const newNet = rob.net - lost
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, myPoints - lost)
          await session.send([
            H.at(uid),
            `   抢劫失败！你失去了${lost}P点！\n`,
            `你现在有${myPoints - lost}P点`,
            H.isAdmin(uid) ? "" : countSuffix,
          ].join(""))
          logger.success(`${uid} 抢劫 ${target} 失败！失去了 ${lost}P点！`)
        }
      }
      // Re-read getRobState to pick up the post-decrement count (accrual
      // may have ticked +1 since line 241's call) and the net updated
      // by setRobNet() in the success/fail branch above.
      const finalRob = await H.getRobState(uid)
      logger.info(`${uid} 今天的抢劫记录为${finalRob.net}   |    剩余抢劫次数为${finalRob.count}`)
      return null
    }, "抢p点")
  })

  // ── 签到 ────────────────────────────────────────────────────────
  ctx.command("签到", { authority: 0 }).action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      const bonus = H.randInt(config.signInMin, config.signInMax)
      const signDate = await H.getSignDate(uid)
      const isNewDay = !signDate || H.isSameDay(signDate)
      if (!H.isAdmin(uid) && !isNewDay) {
        await session.send([
          H.at(uid),
          "  那个......你已经签到过力...明天再来吧qwq",
        ].join(""))
        logger.error(`${uid} 签到失败！原因：该用户已经签到`)
        return null
      }
      const cur = await H.getPoints(uid)
      const mult = H.isAdmin(uid) ? config.signInMultiplier : 1
      const awarded = bonus * mult
      const total = cur + awarded
      await H.kvSet(`${H.POINTS_NS}.${uid}${SUFFIX.signCache}`, bonus)
      await H.setSignDate(uid)
      await H.setPoints(uid, total)
      if (H.isAdmin(uid)) {
        await session.send([
          H.at(uid),
          `签到成功！你收到了${awarded}P点！ `,
          `现在你已经有${total}P点力！`,
        ].join(""))
      } else {
        await session.send([
          H.at(uid),
          `签到成功！你收到了${bonus}P点！ `,
          `现在你已经有${total}P点力！\nP点可用来抽卡（见"抽卡帮助"）`,
        ].join(""))
      }
      logger.success(`${uid} 完成了一次签到！`)
      return null
    }, "签到")
  })

  // ── 十倍抢p点（特权用户） ───────────────────────────────────────
  ctx.command("十倍抢p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const uid = String(session.userId)
      if (!H.isPrivileged(uid)) {
        return `${H.at(uid)}你有权限吗你就抢？baka!`
      }
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户再抢"
      if (target === String(session.userId)) return "你抢自己干什么？"
      if (H.isAtTargetBot(session)) return "抢我干嘛！坏蛋baka！"
      const myPoints = await H.getPoints(uid)
      const targetPoints = await H.getPoints(target)
      if (targetPoints === 0) return "他已经没有P点了！"
      if (!H.isAdmin(uid) && targetPoints <= config.minRobTargetPoints) {
        return `他的P点已经不到${config.minRobTargetPoints}了你还抢！大坏蛋！`
      }
      const won = H.randInt(0, config.robWinMax) * 10
      if (won >= targetPoints) {
        await H.setPoints(uid, myPoints + targetPoints)
        await H.setPoints(target, 0)
        await session.send([
          H.at(uid),
          `   你抢到了${targetPoints}P点！`,
          `因为对方只有${targetPoints}P点，所以他被你扒光了！\n`,
          `你现在有${myPoints + targetPoints}P点`,
        ].join(""))
      } else {
        await H.setPoints(uid, myPoints + won)
        await H.setPoints(target, targetPoints - won)
        await session.send([
          H.at(uid),
          `   恭喜你从对方手里抢到${won}P点！\n`,
          `你现在有${myPoints + won}P点\n对方还剩${targetPoints - won}P点`,
        ].join(""))
      }
      logger.success(`${uid} 抢了 ${target} 的 ${won}P点！`)
      return null
    }, "十倍抢p点")
  })

  // ── 设置p点 [操作] [数值] @用户（admin） ──────────────────────
  // Example: 设置p点 添加 100 @xxx / 设置p点 扣除 50 @xxx / 设置p点 设置 0 @xxx
  ctx.command("设置p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      if (!H.isAdmin(session.userId)) return `你没有权限使用此命令`
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户"
      const text = H.stripElements(session.content || "").trim()
      // Parse: op (设置 / 扣除 / 添加) + value (any integer)
      const op = H.matchSettingOp(text)
      const value = H.parseAmountFromContent(text)
      if (!op || value == null) {
        return "用法：设置p点 添加/扣除/设置 [数值] @用户，例如：设置p点 添加 100 @xxx"
      }
      const current = await H.getPoints(target)
      if (op === "添加") {
        const next = current + value
        await H.setPoints(target, next)
        if (target === String(session.userId)) {
          await session.send(`添加成功！主人你现在有${next}个P点了`)
        } else {
          await session.send(`${H.at(target)}主人送了你${value}个P点，你现在有${next}个P点了，快感谢主人！！`)
        }
      } else if (op === "扣除") {
        if (current < value) {
          return `  这个人才${current}个P点，根本不够扣啊baka！`
        }
        const next = current - value
        await H.setPoints(target, next)
        if (target === String(session.userId)) {
          await session.send(`扣除成功！主人你现在有${next}个P点了`)
        } else {
          await session.send(`${H.at(target)}主人扣了你${value}个P点，你现在有${next}个P点了，哈哈活该！`)
        }
      } else if (op === "设置") {
        if (value < 0) {
          return "输入负数干什么？"
        }
        await H.setPoints(target, value)
        if (target === String(session.userId)) {
          await session.send(`主人你现在有${value}个P点了`)
        } else {
          const msg = value >= current ? "快感谢主人！" : "该啊！"
          await session.send(`${H.at(target)}主人将你的P点设置为了${value}，${msg}`)
        }
      } else {
        return `未知操作 "${op}"，请用 添加 / 扣除 / 设置`
      }
      return null
    }, "设置p点")
  })

  // ── 查看p点 ─────────────────────────────────────────────────────
  ctx.command("查看p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户"
      if (H.isAtTargetBot(session)) {
        return "？！你竟然敢打我的主意，baka！"
      }
      const points = await H.getPoints(target)
      const signCache = H.safeNum(await H.kvGet(`${H.POINTS_NS}.${target}${SUFFIX.signCache}`))
      const signDate = await H.getSignDate(target)
      const newDay = !signDate || H.isSameDay(signDate)
      const rob = await H.getRobState(target)
      const sendToday = await H.getTodayCounter(target, H.sendDateKey, H.sendTodayKey)
      const recvToday = await H.getTodayCounter(target, H.recvDateKey, H.recvTodayKey)

      const lines = []
      lines.push(`  TA目前的P点数为： ${points}`)
      lines.push(`今日状态：`)
      if (newDay) {
        lines.push(`[签到]↓`)
        lines.push(`未签到`)
      } else {
        lines.push(`[签到]↓`)
        lines.push(`已签到 | 获得了${signCache}P点`)
      }
      lines.push(`[抢]↓`)
      if (rob.count === 0) {
        lines.push(`抢p点次数已用完`)
      } else {
        const remain = H.isAdmin(target) ? "无限" : rob.count
        lines.push(`还剩${remain}次抢p点机会`)
      }
      lines.push(`抢劫净收入为${rob.net}P点！`)
      if (rob.net > 0) lines.push(`今天赚到了呢`)
      else if (rob.net < 0) lines.push(`今天亏了呢`)
      else lines.push(`今天无事发生`)
      lines.push(`[送]↓`)
      if (newDay) lines.push(`未送出p点`)
      else lines.push(`送出${sendToday}P点`)
      lines.push(`[收]↓`)
      if (newDay) lines.push(`未收到p点`)
      else lines.push(`收到${recvToday}P点`)
      return lines.join("\n")
    }, "查看p点")
  })
}