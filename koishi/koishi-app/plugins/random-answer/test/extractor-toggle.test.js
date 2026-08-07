const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")

const { startExtractor } = require("../lib/extractor")

async function withController(run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "random-answer-toggle-"))
  const handles = []
  const originals = {
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  }

  global.setInterval = (fn, ms) => {
    const handle = { type: "interval", fn, ms, cleared: false }
    handles.push(handle)
    return handle
  }
  global.clearInterval = (handle) => { if (handle) handle.cleared = true }
  global.setTimeout = (fn, ms) => {
    const handle = { type: "timeout", fn, ms, cleared: false }
    handles.push(handle)
    return handle
  }
  global.clearTimeout = (handle) => { if (handle) handle.cleared = true }

  const messages = []
  const ctx = {
    logger: () => ({
      info: (message) => messages.push(["info", message]),
      warn: (message) => messages.push(["warn", message]),
      error: (message) => messages.push(["error", message]),
    }),
  }
  const config = {
    dataDir,
    llmEnabled: true,
    llmApiBase: "https://example.invalid",
    llmIntervalMin: 17,
    llmAllowedGroups: [],
  }
  const dbApi = { has: () => false, all: () => [], add: async () => true }

  try {
    await run({ dataDir, handles, ctx, config, dbApi })
  } finally {
    global.setInterval = originals.setInterval
    global.clearInterval = originals.clearInterval
    global.setTimeout = originals.setTimeout
    global.clearTimeout = originals.clearTimeout
    await fs.rm(dataDir, { recursive: true, force: true })
  }
}

test("disabling automatic extraction persists and keeps manual extraction available", async () => {
  await withController(async ({ dataDir, handles, ctx, config, dbApi }) => {
    const extractor = await startExtractor(ctx, config, dbApi)
    assert.equal(extractor.isAutoEnabled(), true)
    assert.equal(handles[0].ms, 17 * 60 * 1000)

    assert.equal(await extractor.setAutoEnabled(false), true)
    assert.equal(extractor.isAutoEnabled(), false)
    assert.equal(handles.filter((handle) => handle.cleared).length, 2)

    const manual = await extractor.runNow()
    assert.equal(manual.skipped, true)
    assert.equal(manual.reason, "llmAllowedGroups 为空")

    extractor.stop()
    const restarted = await startExtractor(ctx, config, dbApi)
    assert.equal(restarted.isAutoEnabled(), false)
    assert.equal(handles.filter((handle) => !handle.cleared).length, 0)

    const state = JSON.parse(await fs.readFile(path.join(dataDir, "extractor-state.json"), "utf8"))
    assert.equal(state.autoEnabled, false)
  })
})

test("enabling schedules the interval without running immediately", async () => {
  await withController(async ({ dataDir, handles, ctx, config, dbApi }) => {
    await fs.writeFile(path.join(dataDir, "extractor-state.json"), JSON.stringify({
      lastExtractionTs: 0,
      intervalMin: 15,
      autoEnabled: false,
    }))
    const extractor = await startExtractor(ctx, config, dbApi)

    assert.equal(await extractor.setAutoEnabled(true), true)
    assert.equal(extractor.isAutoEnabled(), true)
    assert.equal(handles.filter((handle) => handle.type === "interval" && !handle.cleared).length, 1)
    assert.equal(handles.filter((handle) => handle.type === "timeout" && !handle.cleared).length, 0)
  })
})

test("changing interval while disabled persists without scheduling", async () => {
  await withController(async ({ dataDir, handles, ctx, config, dbApi }) => {
    await fs.writeFile(path.join(dataDir, "extractor-state.json"), JSON.stringify({
      lastExtractionTs: 0,
      intervalMin: 60,
      autoEnabled: false,
    }))
    const extractor = await startExtractor(ctx, config, dbApi)

    await extractor.setInterval(20)
    assert.equal(handles.filter((handle) => handle.type === "interval" && !handle.cleared).length, 0)
    const state = JSON.parse(await fs.readFile(path.join(dataDir, "extractor-state.json"), "utf8"))
    assert.equal(state.intervalMin, 20)
    assert.equal(state.autoEnabled, false)
  })
})
