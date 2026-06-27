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
  minRobTargetPoints: Schema.number().default(400)
    .description('目标用户低于该 P 点数禁止抢（保护低积分用户）'),
  robFailPenaltyMax: Schema.number().default(600).description('抢劫失败最多损失 P 点'),
  robWinMax: Schema.number().default(1000).description('抢p点成功最多获得 P 点（0~该值 闭区间）'),
})

module.exports.usage = '每日签到 / P点系统 / 抢劫 / 赠送 / 设置（管理员）'

module.exports.apply = async (ctx, config) => {
  ctx.database.extend("blockly_key_value", { key: "string", value: "string" }, { primary: "key" })
  const logger = ctx.logger("签到")
  const H = createHelpers(ctx, config)

  // ── 签到帮助 ─────────────────────────────────────────────────────
  ctx.command("签到帮助").action(async ({ session }) => {
    return [
      "“签到”——每日签到获得P点（可以用来抽卡，见“抽卡帮助”）",
      "“我的p点”——看自己P点与今日状态",
      "“查看p点@用户”——看别人有多少P点",
      `“抢p点@用户”——50%成功 50%失败（失败会扣的哦）`,
      `     ↑每天有${config.maxRobAttempts}次机会`,
      "“送p点 [数量] @用户”——赠送p点（一次发完，不要等bot再问）",
      "“十倍抢p点 @用户”——特权用户专属",
    ].join("\n")
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
      const m = (session.content || "").match(/-?\d+/)
      if (!m) return "请写明次数，例如：设置抢次数 5 @xxx"
      const n = H.safeNum(m[0], -1)
      if (n < 0) {
        return "输入错误"
      }
      await H.kvSet(`${H.POINTS_NS}.${target}${SUFFIX.robCount}`, n)
      await session.send(`已将TA的抢P点次数设置为${n}`)
      return null
    }, "设置抢次数")
  })

  // ── 送p点 [数量] @用户 ────────────────────────────────────────
  ctx.command("送p点").action(async ({ session }) => {
    return await H.withErrorBoundary(session, async () => {
      // [SPLIT-BOT-MSG]
      if (H.isSelfOrBot(session)) {
        const _t = H.atTarget(session)
        if (_t === String(session.userId)) return "哪有送自己的？"
        if (_t === String(session.selfId) || H.isAtTargetBot(session)) return "谢谢你嗷"
        return "不能送自己或bot"
      }
      const target = H.atTarget(session)
      if (!target) return "请 @ 一个用户"
      // Parse amount from session.content (text after "送p点", before any @)
      const m = (session.content || "").match(/\d+/)
      if (!m) return "请在消息中写明赠送点数，例如：送p点 100 @xxx"
      const amt = Math.floor(Number(m[0]))
      if (amt < 0) return "休想卡bug！baka！"
      if (amt === 0) return "你搁这搁这呢baka"
      const uid = String(session.userId)
      const sendToday = await H.getTodayCounter(uid, H.sendDateKey, H.sendTodayKey)
      const recvToday = await H.getTodayCounter(target, H.recvDateKey, H.recvTodayKey)
      const myPoints = await H.getPoints(uid)
      const targetPoints = await H.getPoints(target)

      if (myPoints === 0) {
        return "你一个P点都没有还送！baka！"
      }
      if (amt > 0) {
        if (amt > myPoints) {
          return [
            h("at", { id: uid }),
            `  你现在总共就${myPoints}的P点，你想送他${amt}个P点，舔之前也要先看看自己钱包吧baka！`,
          ].join("")
        } else if (amt === myPoints) {
          // all-in
          await H.setPoints(uid, 0)
          await H.addTodayCounter(uid, H.sendDateKey, H.sendTodayKey, amt)
          await H.setPoints(target, targetPoints + amt)
          await H.addTodayCounter(target, H.recvDateKey, H.recvTodayKey, amt)
          await session.send([
            h("at", { id: uid }),
            "  你把你的所有P点都送给了TA！\n",
            "→",
            [
              h("at", { id: target }),
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
            h("at", { id: uid }),
            `  你送出了${amt}P点！\n你还剩${myPoints - amt}的P点\n`,
            "→",
            [
              h("at", { id: target }),
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
      // [SPLIT-BOT-MSG]
      if (H.isSelfOrBot(session)) {
        const _t = H.atTarget(session)
        if (_t === String(session.userId)) return "你抢自己干什么？"
        if (_t === String(session.selfId) || H.isAtTargetBot(session)) return "抢我干什么？坏蛋baka！"
        return "不能抢自己或bot"
      }
      const target = H.atTarget(session)
      const uid = String(session.userId)
      const rob = await H.getRobState(uid)
      const myPoints = await H.getPoints(uid)
      const targetPoints = await H.getPoints(target)
      if (targetPoints === 0) return "他已经没有P点了！"
      if (!H.isAdmin(uid) && targetPoints <= config.minRobTargetPoints) {
        return `他的P点已经不到${config.minRobTargetPoints}了你还抢！大坏蛋！`
      }
      const won = H.randInt(0, config.robWinMax)
      let newCount = rob.count
      if (!H.isAdmin(uid)) {
        newCount = rob.count - 1
        await H.setRobCount(uid, newCount)
      }
      // success: bottom half of [0, robWinMax] → won, top half → lost
      const success = H.isAdmin(uid) || (won > 0 && won <= Math.floor(config.robWinMax / 2))
      if (success) {
        if (won >= targetPoints) {
          // strip target
          const newNet = rob.net + targetPoints
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, myPoints + targetPoints)
          await H.setPoints(target, 0)
          await session.send([
            h("at", { id: uid }),
            `   你抢到了${targetPoints}P点！`,
            `因为对方只有${targetPoints}P点，所以他被你扒光了！\n`,
            `你现在有${myPoints + targetPoints}P点`,
            H.isAdmin(uid) ? "" : `\n你还剩${newCount}次抢P点次数！`,
          ].join(""))
        } else {
          const newNet = rob.net + won
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, myPoints + won)
          await H.setPoints(target, targetPoints - won)
          await session.send([
            h("at", { id: uid }),
            `   恭喜你从对方手里抢到${won}P点！\n`,
            `你现在有${myPoints + won}P点\n对方还剩${targetPoints - won}P点`,
            H.isAdmin(uid) ? "" : `\n你还剩${newCount}次抢P点次数！`,
          ].join(""))
        }
        logger.success(`${uid} 抢了 ${target} 的 ${won}P点！`)
      } else {
        // fail
        if (myPoints === 0) {
          return "你啥也没抢到，还是一无所有呢~"
        }
        const lost = H.randInt(1, config.robFailPenaltyMax)
        if (lost >= myPoints) {
          const newNet = rob.net - myPoints
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, 0)
          await session.send([
            h("at", { id: uid }),
            "   抢劫失败！你由于P点太少所以失去了全部",
            `P点！\n你现在一丝不挂啦！`,
            H.isAdmin(uid) ? "" : `\n你还剩${newCount}次抢P点次数！`,
          ].join(""))
          logger.success(`${uid} 抢劫 ${target} 失败！失去了所有P点！`)
        } else {
          const newNet = rob.net - lost
          await H.setRobNet(uid, newNet)
          await H.setPoints(uid, myPoints - lost)
          await session.send([
            h("at", { id: uid }),
            `   抢劫失败！你失去了${lost}P点！\n`,
            `你现在有${myPoints - lost}P点`,
            H.isAdmin(uid) ? "" : `\n你还剩${newCount}次抢P点次数！`,
          ].join(""))
          logger.success(`${uid} 抢劫 ${target} 失败！失去了 ${lost}P点！`)
        }
      }
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
          h("at", { id: uid }),
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
          h("at", { id: uid }),
          `签到成功！你收到了${awarded}P点！ `,
          `现在你已经有${total}P点力！`,
        ].join(""))
      } else {
        await session.send([
          h("at", { id: uid }),
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
        return `${h("at", { id: uid })}你有权限吗你就抢？baka!`
      }
      // [SPLIT-BOT-MSG]
      if (H.isSelfOrBot(session)) {
        const _t = H.atTarget(session)
        if (_t === String(session.userId)) return "你抢自己干什么？"
        if (_t === String(session.selfId) || H.isAtTargetBot(session)) return "抢我干什么？坏蛋baka！"
        return "不能抢自己或bot"
      }
      const target = H.atTarget(session)
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
          h("at", { id: uid }),
          `   你抢到了${targetPoints}P点！`,
          `因为对方只有${targetPoints}P点，所以他被你扒光了！\n`,
          `你现在有${myPoints + targetPoints}P点`,
        ].join(""))
      } else {
        await H.setPoints(uid, myPoints + won)
        await H.setPoints(target, targetPoints - won)
        await session.send([
          h("at", { id: uid }),
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
      const text = (session.content || "").trim()
      // Parse: leading word (操作) + first number (数值)
      const opMatch = text.match(/^([^\d\s]+)/)
      const numMatch = text.match(/-?\d+/)
      if (!opMatch || !numMatch) {
        return "用法：设置p点 添加/扣除/设置 [数值] @用户，例如：设置p点 添加 100 @xxx"
      }
      const op = opMatch[1]
      const value = H.safeNum(numMatch[0])
      const current = await H.getPoints(target)
      if (op === "添加") {
        const next = current + value
        await H.setPoints(target, next)
        if (target === String(session.userId)) {
          await session.send(`添加成功！主人你现在有${next}个P点了`)
        } else {
          await session.send(`${h("at", { id: target })}主人送了你${value}个P点，你现在有${next}个P点了，快感谢主人！！`)
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
          await session.send(`${h("at", { id: target })}主人扣了你${value}个P点，你现在有${next}个P点了，哈哈活该！`)
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
          await session.send(`${h("at", { id: target })}主人将你的P点设置为了${value}，${msg}`)
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