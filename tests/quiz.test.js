const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

const SORT_LABELS = {
  bubble: 'Bubble Sort', selection: 'Selection Sort', insertion: 'Insertion Sort',
  merge: 'Merge Sort', quick: 'Quick Sort'
}
const PATH_LABELS = { bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra' }

const card = (win, section) => win.document.getElementById('quiz-' + section)
const visible = (win, section) => card(win, section).style.display === 'block'
const buttons = (win, section) => [...card(win, section).querySelectorAll('.quiz-opt')]

// Rendering is not what these tests check, and per-step DOM rebuilds dominate
// the runtime on the big boards. The first real render (openViz) creates the
// cells, so replacing the redraw function afterwards is safe.
function skipRendering(win, ...names) {
  for (const n of names) win[n] = () => {}
}
const title = (win, section) => card(win, section).querySelector('.quiz-algo').textContent

function current(win, section) {
  const st = win.__test.getQuizState()[section]
  const item = win.__test.getQuizBank()[st.key][st.idx]
  return { st, item, correctPos: st.order.indexOf(item.a) }
}

function assertWellFormedCard(win, section) {
  assert.ok(visible(win, section), `${section}: card should be visible`)
  const n = buttons(win, section).length
  assert.ok(n >= 3 && n <= 4, `${section}: expected 3-4 options, got ${n}`)
  assert.ok(card(win, section).querySelector('.quiz-q').textContent.length > 10, `${section}: missing question text`)
  assert.equal(card(win, section).querySelector('.quiz-why').textContent, '', `${section}: explanation must stay hidden until answered`)
}

// ─── bank integrity ───────────────────────────────────────────

test('every algorithm in the app has quiz questions, with 3-4 options and a valid answer index', () => {
  const win = loadApp()
  const bank = win.__test.getQuizBank()
  const sortKeys = [...win.document.querySelectorAll('#sort-algo option')].map(o => o.value)
  const pathKeys = [...win.document.querySelectorAll('#path-algo option')].map(o => o.value)
  const expected = [...sortKeys, ...pathKeys, 'bsearch', 'hanoi', 'nqueen', 'sudoku']
  for (const key of expected) {
    assert.ok(bank[key] && bank[key].length >= 1, `${key}: no questions`)
    assert.ok(win.__test.getQuizTitles()[key], `${key}: no display title`)
  }
  for (const [key, items] of Object.entries(bank)) {
    for (const item of items) {
      assert.ok(item.opts.length >= 3 && item.opts.length <= 4, `${key}: "${item.q}" needs 3-4 options`)
      assert.equal(new Set(item.opts).size, item.opts.length, `${key}: duplicate options in "${item.q}"`)
      assert.ok(Number.isInteger(item.a) && item.a >= 0 && item.a < item.opts.length, `${key}: bad answer index`)
      assert.ok(item.q.trim().endsWith('?'), `${key}: question should end with ?`)
    }
  }
})

test('explanations are one line, and no quiz text contains em or en dashes', () => {
  const win = loadApp()
  for (const [key, items] of Object.entries(win.__test.getQuizBank())) {
    for (const item of items) {
      assert.ok(!/\n/.test(item.why), `${key}: explanation must be a single line`)
      assert.ok(item.why.length <= 160, `${key}: explanation too long (${item.why.length}): ${item.why}`)
      for (const text of [item.q, item.why, ...item.opts]) {
        assert.ok(!/[\u2014\u2013]/.test(text), `${key}: dash character in "${text}"`)
      }
    }
  }
})

test('the specified example questions are present', () => {
  const win = loadApp()
  const bank = win.__test.getQuizBank()
  const has = (key, ...needles) => bank[key].some(i => needles.every(n => i.q.toLowerCase().includes(n.toLowerCase())))
  assert.ok(has('bubble', 'adjacent'), 'Bubble Sort: why adjacent elements are compared')
  assert.ok(has('dijkstra', 'bfs', 'weighted'), 'Dijkstra: why BFS would not find the optimal path on a weighted grid')
  assert.ok(has('nqueen', 'no column is safe'), 'N-Queens: what happens when no column is safe in a row')
})

// ─── Sorting: Run and Step ────────────────────────────────────

for (const algo of Object.keys(SORT_LABELS)) {
  test(`${algo}: a quiz about that algorithm appears after a full Run`, async () => {
    const win = loadApp()
    win.openViz('sorting')
    win.document.getElementById('sort-algo').value = algo
    win.sortAlgoChange()
    assert.ok(!visible(win, 'sorting'), 'no quiz before the run')
    await win.runSort()
    assertWellFormedCard(win, 'sorting')
    assert.equal(title(win, 'sorting'), SORT_LABELS[algo])
    assert.equal(win.__test.getQuizState().sorting.key, algo)
  })

  test(`${algo}: a quiz appears only after the last click in Step mode`, () => {
    const win = loadApp()
    win.openViz('sorting')
    win.document.getElementById('sort-algo').value = algo
    win.sortAlgoChange()
    let clicks = 0
    while (!visible(win, 'sorting') && clicks < 20000) { win.stepSort(); clicks++ }
    assert.ok(clicks > 8, `quiz appeared suspiciously early, after ${clicks} clicks`)
    assertWellFormedCard(win, 'sorting')
    assert.equal(title(win, 'sorting'), SORT_LABELS[algo])
  })
}

// ─── Answering ────────────────────────────────────────────────

test('picking the correct option highlights it green and shows the explanation', async () => {
  const win = loadApp()
  win.openViz('sorting')
  await win.runSort()
  const { item, correctPos } = current(win, 'sorting')
  buttons(win, 'sorting')[correctPos].click()

  const btns = buttons(win, 'sorting')
  assert.ok(btns[correctPos].classList.contains('correct'))
  assert.equal(btns.filter(b => b.classList.contains('wrong')).length, 0)
  assert.ok(btns.every(b => b.classList.contains('locked') && b.getAttribute('aria-disabled') === 'true'))
  const why = card(win, 'sorting').querySelector('.quiz-why')
  assert.ok(why.querySelector('.verdict.ok'))
  assert.ok(why.textContent.startsWith('Correct.'))
  assert.ok(why.textContent.includes(item.why))
})

test('picking a wrong option highlights it red, reveals the correct one in green, and says which letter', async () => {
  const win = loadApp()
  win.openViz('sorting')
  await win.runSort()
  const { item, correctPos } = current(win, 'sorting')
  const wrongPos = correctPos === 0 ? 1 : 0
  buttons(win, 'sorting')[wrongPos].click()

  const btns = buttons(win, 'sorting')
  assert.ok(btns[wrongPos].classList.contains('wrong'))
  assert.ok(btns[correctPos].classList.contains('correct'))
  assert.equal(btns.filter(b => b.classList.contains('correct') || b.classList.contains('wrong')).length, 2)
  const why = card(win, 'sorting').querySelector('.quiz-why')
  assert.ok(why.querySelector('.verdict.no'))
  assert.ok(why.textContent.includes('The answer is ' + String.fromCharCode(65 + correctPos)))
  assert.ok(why.textContent.includes(item.why))
})

test('an answered quiz is locked: a second click changes nothing', async () => {
  const win = loadApp()
  win.openViz('sorting')
  await win.runSort()
  const { correctPos } = current(win, 'sorting')
  const wrongPos = correctPos === 0 ? 1 : 0
  buttons(win, 'sorting')[wrongPos].click()
  const before = card(win, 'sorting').innerHTML
  buttons(win, 'sorting')[correctPos].click()
  assert.equal(card(win, 'sorting').innerHTML, before)
})

test('the quiz card is an accessible region with real buttons and a labelled option group', async () => {
  const win = loadApp()
  win.openViz('sorting')
  await win.runSort()
  const c = card(win, 'sorting')
  assert.equal(c.getAttribute('role'), 'region')
  assert.equal(c.getAttribute('aria-live'), 'polite')
  for (const b of buttons(win, 'sorting')) {
    assert.equal(b.tagName, 'BUTTON')
    assert.equal(b.getAttribute('type'), 'button')
    assert.match(b.querySelector('.quiz-letter').textContent, /^[A-D]$/)
  }
  const group = c.querySelector('.quiz-opts')
  assert.equal(group.getAttribute('role'), 'group')
  assert.equal(win.document.getElementById(group.getAttribute('aria-labelledby')), c.querySelector('.quiz-q'))
})

// ─── Reset behavior ───────────────────────────────────────────

test('a new run clears the previous quiz immediately, then shows a fresh one at the end', async () => {
  const win = loadApp()
  win.openViz('sorting')
  await win.runSort()
  const { correctPos } = current(win, 'sorting')
  buttons(win, 'sorting')[correctPos].click()
  assert.ok(card(win, 'sorting').querySelector('.quiz-opt.correct'))

  const run = win.runSort()
  assert.ok(!visible(win, 'sorting'), 'quiz must disappear the moment the new run starts')
  assert.equal(card(win, 'sorting').innerHTML, '')
  await run
  assertWellFormedCard(win, 'sorting')
  assert.ok(!card(win, 'sorting').querySelector('.quiz-opt.correct'), 'the fresh quiz must be unanswered')
})

test('starting Step mode again clears the previous quiz', () => {
  const win = loadApp()
  win.openViz('sorting')
  let clicks = 0
  while (!visible(win, 'sorting') && clicks < 20000) { win.stepSort(); clicks++ }
  assert.ok(visible(win, 'sorting'))
  win.stepSort()
  assert.ok(!visible(win, 'sorting'), 'the first click of a new step-mode run must clear the old quiz')
})

test('Randomize, changing algorithm, and switching mode each clear the quiz', async () => {
  const win = loadApp()
  win.openViz('sorting')

  await win.runSort()
  win.handleRandomize()
  assert.ok(!visible(win, 'sorting'), 'Randomize')

  await win.runSort()
  win.document.getElementById('sort-algo').value = 'quick'
  win.sortAlgoChange()
  assert.ok(!visible(win, 'sorting'), 'algorithm change')

  await win.runSort()
  win.document.getElementById('compare-toggle').checked = true
  win.toggleCompareMode()
  assert.ok(!visible(win, 'sorting'), 'Compare Mode')
})

test('a run that is reset partway through does not produce a quiz', async () => {
  const win = loadApp()
  win.openViz('sorting')
  const run = win.runSort()
  win.resetSort()
  await run
  assert.ok(!visible(win, 'sorting'))

  win.openViz('nqueen')
  const nq = win.runNQ()
  win.resetNQ()
  await nq
  assert.ok(!visible(win, 'nqueen'))
})

test('leaving a visualizer and coming back starts without a stale quiz', async () => {
  const win = loadApp()
  win.openViz('sorting')
  await win.runSort()
  win.goHub()
  win.openViz('sorting')
  assert.ok(!visible(win, 'sorting'))
})

test('consecutive runs of the same algorithm do not repeat the previous question', () => {
  const win = loadApp()
  win.openViz('sorting')
  let last = -1
  for (let i = 0; i < 30; i++) {
    win.quizReset('sorting')
    win.quizShow('sorting', 'bubble')
    const { st } = current(win, 'sorting')
    assert.notEqual(st.idx, last, `run ${i} repeated question ${st.idx}`)
    last = st.idx
  }
})

test('the correct answer does not always sit in the same slot', () => {
  const win = loadApp()
  win.openViz('sorting')
  const slots = new Set()
  for (let i = 0; i < 80; i++) {
    win.quizReset('sorting')
    win.quizShow('sorting', 'quick')
    slots.add(current(win, 'sorting').correctPos)
  }
  assert.ok(slots.size >= 3, `correct answer only ever appeared in slots ${[...slots]}`)
})

// ─── Other visualizers ────────────────────────────────────────

test('Binary Search: quiz after Run and after the last Step', async () => {
  const win = loadApp()
  win.openViz('bsearch')
  await win.runBS()
  assertWellFormedCard(win, 'bsearch')
  assert.equal(title(win, 'bsearch'), 'Binary Search')

  win.resetBS()
  assert.ok(!visible(win, 'bsearch'))
  let clicks = 0
  while (!visible(win, 'bsearch') && clicks < 200) { win.stepBS(); clicks++ }
  assert.ok(clicks >= 2)
  assertWellFormedCard(win, 'bsearch')
})

for (const algo of Object.keys(PATH_LABELS)) {
  test(`Pathfinder (${algo}): quiz after Run, with that algorithm's question`, async () => {
    const win = loadApp()
    win.openViz('pathfinder')
    skipRendering(win, 'renderPathGrid')
    win.document.getElementById('path-algo').value = algo
    win.pathAlgoChange()
    assert.ok(!visible(win, 'pathfinder'))
    await win.runPath()
    assertWellFormedCard(win, 'pathfinder')
    assert.equal(title(win, 'pathfinder'), PATH_LABELS[algo])
    assert.equal(win.__test.getQuizState().pathfinder.key, algo)
  })

  test(`Pathfinder (${algo}): quiz after the last Step`, async () => {
    const win = loadApp()
    win.openViz('pathfinder')
    skipRendering(win, 'renderPathGrid')
    win.document.getElementById('path-algo').value = algo
    win.pathAlgoChange()
    let clicks = 0
    while (!visible(win, 'pathfinder') && clicks < 5000) { await win.stepPath(); clicks++ }
    assert.ok(clicks > 20, `quiz appeared suspiciously early, after ${clicks} clicks`)
    assertWellFormedCard(win, 'pathfinder')
    assert.equal(title(win, 'pathfinder'), PATH_LABELS[algo])
  })
}

test('Pathfinder: a search that finds no path still finishes with a quiz', async () => {
  const win = loadApp()
  win.openViz('pathfinder')
  skipRendering(win, 'renderPathGrid')
  const grid = win.__test.getPathGrid()
  const [sr, sc] = win.__test.getPathStart()
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) grid[sr + dr][sc + dc] = 'wall'
  await win.runPath()
  assert.equal(win.document.getElementById('path-status').textContent, 'No path found')
  assertWellFormedCard(win, 'pathfinder')
})

test('Pathfinder: Clear Path and switching algorithm clear the quiz', async () => {
  const win = loadApp()
  win.openViz('pathfinder')
  skipRendering(win, 'renderPathGrid')
  await win.runPath()
  win.clearPath()
  assert.ok(!visible(win, 'pathfinder'))
  await win.runPath()
  win.document.getElementById('path-algo').value = 'dfs'
  win.pathAlgoChange()
  assert.ok(!visible(win, 'pathfinder'))
})

test('Towers of Hanoi: quiz after Run and after the last Step', async () => {
  const win = loadApp()
  win.openViz('hanoi')
  await win.runHanoi()
  assertWellFormedCard(win, 'hanoi')
  assert.equal(title(win, 'hanoi'), 'Towers of Hanoi')

  win.resetHanoi()
  assert.ok(!visible(win, 'hanoi'))
  let clicks = 0
  while (!visible(win, 'hanoi') && clicks < 100) { win.stepHanoi(); clicks++ }
  assert.equal(clicks, 7, 'a 3-disk solve is 7 moves, so the quiz should appear on exactly the 7th click')
  assertWellFormedCard(win, 'hanoi')
})

test('N-Queens: quiz after Run and after the last Step', async () => {
  const win = loadApp()
  win.openViz('nqueen')
  win.document.getElementById('nq-size').value = '5'
  win.resetNQ()
  await win.runNQ()
  assertWellFormedCard(win, 'nqueen')
  assert.equal(title(win, 'nqueen'), 'N-Queens')

  win.resetNQ()
  assert.ok(!visible(win, 'nqueen'))
  let clicks = 0
  while (!visible(win, 'nqueen') && clicks < 5000) { win.stepNQ(); clicks++ }
  assert.ok(clicks > 5)
  assertWellFormedCard(win, 'nqueen')
})

test('Sudoku: quiz after Run and after the last Step', async () => {
  const win = loadApp()
  win.openViz('sudoku')
  skipRendering(win, 'renderSDK', 'setPseudo', 'setExplain')
  await win.runSudoku()
  assertWellFormedCard(win, 'sudoku')
  assert.equal(title(win, 'sudoku'), 'Sudoku Solver')

  win.loadSudokuPuzzle()
  assert.ok(!visible(win, 'sudoku'))
  let clicks = 0
  while (!visible(win, 'sudoku') && clicks < 200000) { win.stepSudoku(); clicks++ }
  assert.ok(clicks > 50)
  assertWellFormedCard(win, 'sudoku')
})
