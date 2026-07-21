// lib/check-words.js
//
// Periodic word-DB integrity checker for koishi-plugin-random-answer.
//
// Why this exists
// ---------------
// `什么N` and friends look up words in `dataDir/words.json` by char-count
// bucket. If a word ever ends up in the wrong bucket (e.g. trailing
// punctuation that bumps the count from 7 to 12, or zero-width chars
// the plugin counted as one but the user sees as none), every `什么<bucket>`
// pick is wrong for that word. The extractor and addWord paths share
// `[...str].length` so it shouldn't happen in theory — but in practice
// historical drift from older code, manual `加词` calls, or future
// regressions can put words in the wrong bucket.
//
// What this script does
// ---------------------
// Reads `<dataDir>/words.json`, computes `[...word].length` for each
// entry, and reports / fixes any that don't match their bucket key.
//
// Usage:
//   const { auditWordsDb, startWordsAudit } = require('./lib/check-words')
//   await auditWordsDb('/path/to/data/random-answer/words.json', { fix: true })
//   startWordsAudit({ dataDir: '/path/to/data/random-answer', intervalMin: 30 })
//
// Output (returned object):
//   {
//     total: number,
//     misplaced: [{ word, expectedBucket, actualLen, currentBucket }],
//     fixed: number,        // count actually moved to correct bucket
//     removed: number,      // count dropped because actualLen > max bucket (10)
//     ok: number,           // count already in correct bucket
//     bucketsBefore: { '1': 76, '2': 390, ... },
//     bucketsAfter:  { '1': 76, '2': 390, ... },
//   }

const fs = require("fs/promises")
const path = require("path")

// Same length semantics as the plugin: `[...str].length` (UTF-16 code
// points via JS spread). Using spread means a single emoji like `😭`
// counts as 1, the same way the plugin's `countChars` does.
function countChars(s) {
  return [...String(s)].length
}

// The plugin's loadDb accepts any numeric bucket key. We treat buckets
// > 10 as "out of range" — words of length > 10 either came in via
// legacy manual `加词` calls (when maxWordLen used to be 20) or via a
// regression. Auto-fix mode drops them; audit-only mode reports them.
const MAX_BUCKET = 15

async function readWordsDb(dbFile) {
  try {
    const raw = await fs.readFile(dbFile, "utf-8")
    const obj = JSON.parse(raw)
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj
    return {}
  } catch {
    return {}
  }
}

async function writeWordsDb(dbFile, data) {
  // Sort keys numerically so the file stays human-readable.
  const sorted = {}
  for (const k of Object.keys(data).sort((a, b) => Number(a) - Number(b))) {
    sorted[k] = data[k].slice().sort()
  }
  await fs.writeFile(dbFile, JSON.stringify(sorted, null, 2), "utf-8")
}

/**
 * Audit (and optionally fix) the word DB.
 *
 * @param {string} dbFile - absolute path to words.json
 * @param {object} [opts]
 * @param {boolean} [opts.fix=false] - if true, move misplaced words to
 *   their correct bucket and persist. Words with actualLen > MAX_BUCKET
 *   are removed (the plugin can't surface them anyway).
 * @param {(msg:string)=>void} [opts.log] - log line sink; defaults to
 *   no-op. The koishi logger is typically passed in here.
 * @returns {Promise<object>} summary
 */
async function auditWordsDb(dbFile, opts = {}) {
  const { fix = false, log = () => {} } = opts
  const data = await readWordsDb(dbFile)
  const misplaced = []
  const bucketsBefore = {}
  for (const k of Object.keys(data)) {
    bucketsBefore[k] = data[k].length
  }

  // Build the new layout. Use a temp copy so we can move words without
  // double-counting when the same word appears in multiple buckets
  // (extremely rare but defensible).
  const next = {}
  for (const [k, words] of Object.entries(data)) {
    if (!Array.isArray(words)) continue
    next[k] = words.slice()
  }

  for (const bucketStr of Object.keys(next)) {
    const bucket = Number(bucketStr)
    const keep = []
    // Bucket keys themselves shouldn't be > MAX_BUCKET — those are
    // historical artifacts from when maxWordLen used to be 20. Drop
    // the entire bucket.
    if (bucket > MAX_BUCKET) {
      for (const w of next[bucketStr]) {
        misplaced.push({ word: w, currentBucket: bucket, actualLen: countChars(w) })
        if (fix) log(`[check-words] drop out-of-range bucket ${bucket}: "${w}"`)
      }
      // Don't keep any of these.
      next[bucketStr] = []
      continue
    }
    for (const w of next[bucketStr]) {
      const actual = countChars(w)
      if (actual === bucket) {
        keep.push(w)
        continue
      }
      misplaced.push({ word: w, currentBucket: bucket, actualLen: actual })
      if (!fix) continue
      if (actual > MAX_BUCKET) {
        log(`[check-words] drop "${w}" (actual ${actual} chars, exceeds max bucket ${MAX_BUCKET})`)
        // drop — don't keep
      } else {
        ;(next[String(actual)] ||= []).push(w)
        log(`[check-words] move "${w}" from bucket ${bucket} → ${actual}`)
      }
    }
    next[bucketStr] = keep
  }

  let fixed = 0
  let removed = 0
  if (fix) {
    for (const m of misplaced) {
      if (m.actualLen > MAX_BUCKET) removed++
      else if (m.actualLen !== m.currentBucket) fixed++
    }
    // Drop empty buckets for tidiness
    for (const k of Object.keys(next)) {
      if (next[k].length === 0) delete next[k]
    }
    await writeWordsDb(dbFile, next)
  }

  const bucketsAfter = {}
  for (const k of Object.keys(next)) bucketsAfter[k] = next[k].length

  return {
    total: Object.values(bucketsBefore).reduce((s, n) => s + n, 0),
    misplaced,
    fixed,
    removed,
    ok: Object.values(bucketsBefore).reduce((s, n) => s + n, 0) - misplaced.length,
    bucketsBefore,
    bucketsAfter,
    bucketsChanged: fix && (fixed > 0 || removed > 0),
  }
}

/**
 * Start a periodic audit. Audit runs immediately on first tick, then
 * every `intervalMin` minutes.
 *
 * @param {object} opts
 * @param {string} opts.dataDir - the plugin's dataDir (e.g. './data/random-answer')
 * @param {number} [opts.intervalMin=30]
 * @param {(msg:string)=>void} [opts.log] - logger sink
 * @param {boolean} [opts.fix=true] - auto-fix mode
 * @returns {{stop: () => void, auditNow: () => Promise<object>}}
 */
function startWordsAudit(opts) {
  const { dataDir, intervalMin = 30, log = () => {}, fix = true } = opts
  const dbFile = path.join(dataDir, "words.json")
  let timer = null

  async function tick() {
    try {
      const result = await auditWordsDb(dbFile, { fix, log })
      if (result.misplaced.length > 0) {
        log(`[check-words] audit done: ${result.ok}/${result.total} ok, ${result.misplaced.length} misplaced (${fix ? `fixed=${result.fixed} removed=${result.removed}` : "no-fix mode"})`)
      } else {
        log(`[check-words] audit clean: ${result.total} words across ${Object.keys(result.bucketsAfter).length} buckets`)
      }
      return result
    } catch (e) {
      log(`[check-words] audit failed: ${e?.message || e}`)
      return null
    }
  }

  // First audit happens immediately so we surface existing drift on
  // every koishi restart. Then schedule recurring.
  tick()
  const ms = Math.max(1, intervalMin) * 60 * 1000
  timer = setInterval(tick, ms)

  return {
    stop() { if (timer) clearInterval(timer); timer = null },
    auditNow: tick,
  }
}

module.exports = {
  auditWordsDb,
  startWordsAudit,
  countChars,
  MAX_BUCKET,
}