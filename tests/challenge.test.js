const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

const ALGORITHMS = ['bubble', 'selection', 'insertion', 'merge', 'quick']
const FIXED = [42, 17, 88, 5, 63, 29, 71, 10, 55, 34, 90, 23, 48, 66]

test('challengeSilentLog produces a non-empty log for every algorithm', () => {
  const win = loadApp()
  for (const algo of ALGORITHMS) {
    const log = win.challengeSilentLog(algo, FIXED)
    assert.ok(log.length > 0, `${algo}: log should not be empty`)
  }
})

test('every logged answer is mathematically correct for its question type', () => {
  const win = loadApp()
  const checks = {
    bubble: e => e.ans === (e.a > e.b),
    selection: e => e.ans === (e.cand < e.min),
    insertion: e => e.ans === (e.left > e.key),
    merge: e => e.ans === (e.a <= e.b),
    quick: e => e.ans === (e.a < e.pivot)
  }
  for (const algo of ALGORITHMS) {
    const log = win.challengeSilentLog(algo, FIXED)
    for (const entry of log) {
      assert.ok(checks[entry.q], `${algo}: unknown question type ${entry.q}`)
      assert.ok(checks[entry.q](entry), `${algo}: wrong answer in entry ${JSON.stringify(entry)}`)
    }
  }
})

test('the silent log is deterministic: same array in, identical log out', () => {
  const win = loadApp()
  for (const algo of ALGORITHMS) {
    const a = win.challengeSilentLog(algo, FIXED)
    const b = win.challengeSilentLog(algo, FIXED)
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${algo}: log should be deterministic`)
  }
})

test('logging does not change sorting behavior: logged run still sorts correctly', () => {
  const win = loadApp()
  for (const algo of ALGORITHMS) {
    // challengeSilentLog drains a compareGen with log enabled; re-derive the
    // sorted result through the same path and verify it.
    const st = { canvas: null, ctx: null, algo, arr: [...FIXED], colors: new Array(FIXED.length).fill('default'), comps: 0, swaps: 0, suffix: null, silent: true, log: [] }
    let r; const gen = win.compareGen(st)
    do { r = gen.next() } while (!r.done)
    assert.ok(st.arr.every((v, i, a) => i === 0 || a[i - 1] <= v), `${algo}: array should end sorted with logging on`)
    assert.ok(st.log.length > 0)
  }
})

test('buildChallengePrompt maps every answer to the correct option index', () => {
  const win = loadApp()
  const entries = [
    { q: 'bubble', a: 9, b: 3, ans: true }, { q: 'bubble', a: 3, b: 9, ans: false },
    { q: 'selection', cand: 2, min: 7, ans: true }, { q: 'selection', cand: 8, min: 7, ans: false },
    { q: 'insertion', left: 9, key: 4, ans: true }, { q: 'insertion', left: 2, key: 4, ans: false },
    { q: 'merge', a: 3, b: 8, ans: true }, { q: 'merge', a: 8, b: 3, ans: false },
    { q: 'quick', a: 2, pivot: 5, ans: true }, { q: 'quick', a: 9, pivot: 5, ans: false }
  ]
  for (const e of entries) {
    const q = win.buildChallengePrompt(e)
    assert.equal(q.opts.length, 2, `${e.q}: should offer exactly two options`)
    assert.equal(q.correct, e.ans ? 0 : 1, `${e.q} ans=${e.ans}: correct index mismatch`)
    assert.ok(q.prompt.length > 0 && q.why.length > 0)
  }
})

test('resetChallenge builds a fresh quiz plan sized to the sampled question count', () => {
  const win = loadApp()
  win.openViz('sorting')
  win.document.getElementById('challenge-toggle').checked = true
  win.toggleChallengeMode()

  const st = win.__test.getChState()
  assert.equal(st.arr.length, 14)
  assert.equal(st.suffix, 'ch')
  assert.equal(st.showValues, true)
  const plan = win.__test.getChPlan()
  assert.ok(plan.indices.size > 0 && plan.indices.size <= 8)
  assert.match(win.document.getElementById('ch-score').textContent, /^0\/\d+$/)
})

test('Challenge toggle is mutually exclusive with Compare and Benchmark', () => {
  const win = loadApp()
  win.openViz('sorting')
  win.document.getElementById('compare-toggle').checked = true
  win.toggleCompareMode()
  win.document.getElementById('challenge-toggle').checked = true
  win.toggleChallengeMode()

  assert.equal(win.document.getElementById('compare-toggle').checked, false)
  assert.equal(win.document.getElementById('sort-challenge-layout').style.display, 'block')
  assert.equal(win.document.getElementById('sort-compare-layout').style.display, 'none')
  // Algorithm select stays visible in challenge mode: the quiz is per-algorithm.
  assert.equal(win.document.getElementById('sort-single-controls').style.display, 'contents')

  win.document.getElementById('bench-toggle').checked = true
  win.toggleBenchMode()
  assert.equal(win.document.getElementById('challenge-toggle').checked, false)
  assert.equal(win.document.getElementById('sort-challenge-layout').style.display, 'none')
})

test('a full challenge run pauses at quiz points, accepts answers, and finishes with a score', async () => {
  const win = loadApp()
  // load-app.js stubs sleep() as an already-resolved promise, which makes
  // runChallenge's await loops pure microtask spins that starve the timer
  // queue -- the answer bot below would never fire. Use a real 0ms timer
  // here so awaits actually yield to the event loop.
  win.sleep = () => new Promise(r => setTimeout(r, 0))
  win.openViz('sorting')
  win.document.getElementById('sort-algo').value = 'bubble'
  win.document.getElementById('challenge-toggle').checked = true
  win.toggleChallengeMode()

  // Auto-answer: whenever option buttons appear, click the first option,
  // then click Continue.
  const answerBot = setInterval(() => {
    const opts = win.document.querySelectorAll('#ch-options .ch-opt:not(.locked)')
    if (opts.length) { opts[0].click() }
    const cont = [...win.document.querySelectorAll('#ch-options .ctrl-btn.primary')].pop()
    if (cont) cont.click()
  }, 2)

  try {
    await win.runChallenge()
  } finally {
    clearInterval(answerBot)
  }

  assert.equal(win.document.getElementById('cmp-status-ch').textContent, 'Done ✓')
  assert.match(win.document.getElementById('ch-question').textContent, /Challenge complete: \d+\/\d+ correct/)
  const st = win.__test.getChState()
  assert.ok(st.arr.every((v, i, a) => i === 0 || a[i - 1] <= v), 'challenge run should end with a sorted array')
})
