const test = require("node:test")
const assert = require("node:assert/strict")

const { hasReplaceableKeyword } = require("../lib/keyword-detection")

test("plain question text without a replacement keyword is skipped", () => {
  assert.equal(hasReplaceableKeyword("今天气温不错"), false)
  assert.equal(hasReplaceableKeyword("晚饭准备好了"), false)
})

test("supported replacement forms are detected", () => {
  for (const text of [
    "今天吃什么",
    "为什么好吃",
    "谁最帅",
    "今天多少度",
    "跑几公里",
    "今天还是明天",
    "行不行",
    "中彩票的概率",
    "你打我",
  ]) {
    assert.equal(hasReplaceableKeyword(text), true, text)
  }
})
