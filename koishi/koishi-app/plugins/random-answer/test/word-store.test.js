const test = require("node:test")
const assert = require("node:assert/strict")

const { createWordStore } = require("../lib/word-store")

function createFakeDatabase(rows = []) {
  const data = rows.map(row => ({ ...row }))
  return {
    async get(table, query) {
      assert.equal(table, "random_answer_words")
      if (!query || Object.keys(query).length === 0) return data.map(row => ({ ...row }))
      return data.filter(row => Object.entries(query).every(([key, value]) => row[key] === value))
    },
    async create(table, row) {
      assert.equal(table, "random_answer_words")
      if (data.some(item => item.text === row.text)) return data.find(item => item.text === row.text)
      const saved = { id: data.length + 1, ...row }
      data.push(saved)
      return saved
    },
    async remove(table, query) {
      assert.equal(table, "random_answer_words")
      const before = data.length
      for (let i = data.length - 1; i >= 0; i--) {
        if (Object.entries(query).every(([key, value]) => data[i][key] === value)) data.splice(i, 1)
      }
      return before - data.length
    },
    rows: data,
  }
}

test("empty sqlite store imports unique words from legacy buckets", async () => {
  const database = createFakeDatabase()
  const store = createWordStore(database, {
    legacy: { "2": ["你好", "你好"], "3": ["世界啊"] },
    minLen: 1,
    maxLen: 15,
  })

  const loaded = await store.initialize()
  assert.equal(loaded.imported, 2)
  assert.deepEqual(store.all().map(row => row.text).sort(), ["世界啊", "你好"])
  assert.equal(database.rows.length, 2)
})

test("adding and removing words updates sqlite-backed cache", async () => {
  const database = createFakeDatabase([{ text: "你好", length: 2, source: "legacy" }])
  const store = createWordStore(database, { legacy: {}, minLen: 1, maxLen: 15 })

  await store.initialize()
  assert.equal(await store.add("测试", "manual"), 2)
  assert.equal(await store.add("测试", "manual"), null)
  assert.equal(await store.remove("你好"), true)
  assert.equal(await store.remove("不存在"), false)
  assert.deepEqual(store.all().map(row => row.text), ["测试"])
})
