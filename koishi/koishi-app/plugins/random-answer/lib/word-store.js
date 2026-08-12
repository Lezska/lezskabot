const TABLE = "random_answer_words"

function countChars(value) {
  return [...String(value)].length
}

function createWordStore(database, options = {}) {
  const legacy = options.legacy || {}
  const model = options.model
  const minLen = Math.max(1, Number(options.minLen) || 1)
  const maxLen = Math.max(minLen, Number(options.maxLen) || 15)
  let rows = []
  let byText = new Map()

  function rebuildIndex() {
    byText = new Map()
    for (const row of rows) {
      if (!byText.has(row.text)) byText.set(row.text, row)
    }
    rows = [...byText.values()]
  }

  async function initialize() {
    ;(model?.extend || database.extend)?.call(model || database, TABLE, {
      id: "unsigned",
      text: "string",
      length: "unsigned",
      source: "string",
      createdAt: "timestamp",
    }, { autoInc: true, unique: ["text"] })

    rows = await database.get(TABLE, {})
    rebuildIndex()
    let imported = 0
    if (rows.length === 0) {
      const seen = new Set()
      for (const [bucket, words] of Object.entries(legacy)) {
        if (!Array.isArray(words)) continue
        for (const text of words) {
          const value = String(text)
          const length = countChars(value)
          if (seen.has(value) || length < minLen || length > maxLen) continue
          seen.add(value)
          await database.create(TABLE, {
            text: value,
            length,
            source: "legacy-json",
            createdAt: new Date(),
          })
          imported++
        }
      }
      rows = await database.get(TABLE, {})
      rebuildIndex()
    }
    return { imported, count: rows.length }
  }

  function all() {
    return rows.map(row => ({ ...row }))
  }

  async function add(text, source = "manual") {
    const value = String(text)
    const length = countChars(value)
    if (length < minLen || length > maxLen || byText.has(value)) return null
    await database.create(TABLE, {
      text: value,
      length,
      source,
      createdAt: new Date(),
    })
    rows = await database.get(TABLE, {})
    rebuildIndex()
    return length
  }

  async function remove(text) {
    if (!byText.has(String(text))) return false
    await database.remove(TABLE, { text: String(text) })
    rows = await database.get(TABLE, {})
    rebuildIndex()
    return true
  }

  return { initialize, all, add, remove, countChars, table: TABLE }
}

module.exports = { createWordStore, countChars, TABLE }
