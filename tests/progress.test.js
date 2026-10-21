const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

const KEY = 'algorythm-progress-v1'
const $ = (win, id) => win.document.getElementById(id)

function withStorage(value) {
  return loadApp({
    beforeParse(w) { if (value !== undefined) w.localStorage.setItem(KEY, value) }
  })
}

// Answer the current question on a section right or wrong.
function answer(win, section, wantRight) {
  const st = win.__test.getQuizState()[section]
  const item = win.__test.getQuizBank()[st.key][st.idx]
  const correctPos = st.order.indexOf(item.a)
  const pos = wantRight ? correctPos : (correctPos + 1) % st.order.length
  win.quizAnswer(section, pos)
}

// Show a specific question for an algorithm.
function ask(win, section, key, idx) {
  win.quizReset(section)
  win.quizPickIndex = () => idx
  win.quizShow(section, key)
}

test('a correct answer is recorded and persisted to localStorage', () => {
  const win = loadApp()
  ask(win, 'hanoi', 'hanoi', 0)
  answer(win, 'hanoi', true)
  const m = win.masteryOf('hanoi')
  assert.equal(m.attempts, 1)
  assert.equal(m.correct, 1)
  assert.equal(m.solved, 1)
  const saved = JSON.parse(win.localStorage.getItem(KEY))
  assert.equal(saved.algos.hanoi.attempts, 1)
})

test('a wrong answer counts as an attempt but does not solve the question', () => {
  const win = loadApp()
  ask(win, 'hanoi', 'hanoi', 0)
  answer(win, 'hanoi', false)
  const m = win.masteryOf('hanoi')
  assert.equal(m.attempts, 1)
  assert.equal(m.correct, 0)
  assert.equal(m.solved, 0)
  assert.equal(m.level, 'learning')
})

test('levels: none, learning, familiar, mastered', () => {
  const win = loadApp()
  const total = win.__test.getQuizBank().hanoi.length
  assert.equal(win.masteryOf('hanoi').level, 'none')
  ask(win, 'hanoi', 'hanoi', 0); answer(win, 'hanoi', false)
  assert.equal(win.masteryOf('hanoi').level, 'learning')
  ask(win, 'hanoi', 'hanoi', 0); answer(win, 'hanoi', true)
  assert.equal(win.masteryOf('hanoi').level, total > 1 ? 'familiar' : 'mastered')
  for (let i = 1; i < total; i++) { ask(win, 'hanoi', 'hanoi', i); answer(win, 'hanoi', true) }
  const m = win.masteryOf('hanoi')
  assert.equal(m.level, 'mastered')
  assert.equal(m.pct, 100)
})

test('streak and best streak track consecutive correct answers', () => {
  const win = loadApp()
  for (const right of [true, true, false, true]) {
    ask(win, 'hanoi', 'hanoi', 0); answer(win, 'hanoi', right)
  }
  const p = win.__test.getProgress()
  assert.equal(p.best, 2)
  assert.equal(p.streak, 1)
})

test('progress is restored from storage on load', () => {
  const stored = JSON.stringify({ best: 4, streak: 1, algos: { bfs: { attempts: 3, correct: 2, solved: { 0: true }, last: 1700000000000 } } })
  const win = withStorage(stored)
  const m = win.masteryOf('bfs')
  assert.equal(m.attempts, 3)
  assert.equal(m.correct, 2)
  assert.equal(m.solved, 1)
  assert.equal(win.__test.getProgress().best, 4)
})

test('corrupt or hostile stored data is sanitized, not trusted', () => {
  for (const bad of ['not json', '[]', 'null', '"x"', '{"algos":5}']) {
    const win = withStorage(bad)
    assert.equal(win.masteryOf('bfs').attempts, 0, bad)
  }
  const win = withStorage(JSON.stringify({
    best: -5, streak: 'x',
    algos: {
      bfs: { attempts: 2, correct: 99, solved: { 0: true, 77: true, x: true, 1: 'yes' }, last: 'now' },
      evil: { attempts: 9 },
      __proto__: { attempts: 1 }
    }
  }))
  const m = win.masteryOf('bfs')
  assert.equal(m.correct, 2, 'correct is capped at attempts')
  assert.equal(m.solved, 1, 'only valid, true question indexes count')
  assert.equal(win.__test.getProgress().best, 0)
  assert.equal(win.__test.getProgress().algos.evil, undefined)
})

test('unknown algorithm keys are ignored when recording', () => {
  const win = loadApp()
  win.recordQuizResult('nope', 0, true)
  assert.equal(win.__test.getProgress().algos.nope, undefined)
})

test('the app still works when localStorage throws', () => {
  const win = loadApp({
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked') }, configurable: true })
    }
  })
  ask(win, 'hanoi', 'hanoi', 0)
  assert.doesNotThrow(() => answer(win, 'hanoi', true))
  assert.equal(win.masteryOf('hanoi').attempts, 1)
})

test('the Progress view shows an empty state, then real numbers', () => {
  const win = loadApp()
  win.openProgress()
  assert.equal($(win, 'progress').style.display, 'block')
  assert.equal($(win, 'progress-empty').style.display, 'block')
  assert.equal(win.document.querySelectorAll('.pg-card').length, 12)

  ask(win, 'hanoi', 'hanoi', 0); answer(win, 'hanoi', true)
  win.openProgress()
  assert.equal($(win, 'progress-empty').style.display, 'none')
  const text = $(win, 'progress-summary').textContent
  assert.match(text, /Questions answered/)
  assert.match(text, /100%/)
  const bar = win.document.querySelector('.pg-bar[aria-label^="Towers"]')
  assert.ok(bar)
  assert.equal(bar.getAttribute('role'), 'progressbar')
})

test('hub chips appear only for algorithms with attempts', () => {
  const win = loadApp()
  assert.equal($(win, 'pchip-hanoi').hidden, true)
  ask(win, 'hanoi', 'hanoi', 0); answer(win, 'hanoi', false)
  assert.equal($(win, 'pchip-hanoi').hidden, false)
  assert.equal($(win, 'pchip-hanoi').textContent, 'in progress')
  assert.equal($(win, 'pchip-sorting').hidden, true)
})

test('reset needs two clicks and then erases everything', () => {
  const win = loadApp()
  ask(win, 'hanoi', 'hanoi', 0); answer(win, 'hanoi', true)
  win.openProgress()
  win.armOrResetProgress()
  assert.equal(win.masteryOf('hanoi').attempts, 1, 'first click only arms')
  assert.match($(win, 'progress-reset-btn').textContent, /again/i)
  win.armOrResetProgress()
  assert.equal(win.masteryOf('hanoi').attempts, 0)
  assert.equal(JSON.parse(win.localStorage.getItem(KEY)).algos.hanoi, undefined)
  assert.equal($(win, 'pchip-hanoi').hidden, true)
})

test('Practice jumps to the right visualizer and algorithm', () => {
  const win = loadApp()
  win.practiceAlgo('merge')
  assert.equal($(win, 'viz-sorting').style.display, 'block')
  assert.equal($(win, 'sort-algo').value, 'merge')
  win.practiceAlgo('dijkstra')
  assert.equal($(win, 'path-algo').value, 'dijkstra')
})
