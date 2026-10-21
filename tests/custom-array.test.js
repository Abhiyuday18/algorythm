const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

// parseCustomArray returns arrays from jsdom's realm; spread into plain
// arrays before deepEqual, which treats cross-realm prototypes as unequal.
function parse(win, text) {
  const r = win.parseCustomArray(text)
  return { ...r, values: [...r.values] }
}

function load(win, text) {
  win.document.getElementById('custom-array-input').value = text
  win.useCustomArray()
}
const msg = (win) => win.document.getElementById('custom-msg')

test('parses the documented example, tolerating spaces', () => {
  const win = loadApp()
  assert.deepEqual(parse(win, '5, 3, 8, 1, 9').values, [5, 3, 8, 1, 9])
  assert.deepEqual(parse(win, '  5 ,3,  8 ').values, [5, 3, 8])
})

test('non-numbers are ignored and counted, not fatal', () => {
  const win = loadApp()
  const r = parse(win, '5, abc, 3, 12abc, , 0x10, 1e2, Infinity, 8')
  assert.deepEqual(r.values, [5, 3, 8])
  assert.equal(r.ignored, 5, 'abc, 12abc, 0x10, 1e2, Infinity')
})

test('values are capped into 1-100 and the capping is counted', () => {
  const win = loadApp()
  const r = parse(win, '0, -7, 50, 100, 101, 5000')
  assert.deepEqual(r.values, [1, 1, 50, 100, 100, 100])
  assert.equal(r.clamped, 4)
})

test('decimals round to whole bars; rounding up past the cap is still capped', () => {
  const win = loadApp()
  assert.deepEqual(parse(win, '3.4, 3.6, 100.4, 100.6').values, [3, 4, 100, 100])
})

test('input longer than the 60-bar limit is truncated and reported', () => {
  const win = loadApp()
  const r = parse(win, Array.from({ length: 75 }, (_, i) => (i % 100) + 1).join(','))
  assert.equal(r.values.length, 60)
  assert.equal(r.truncated, 15)
})

test('empty input shows an error and loads nothing', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '   ')
  assert.equal(win.__test.getCustomArr(), null)
  assert.match(msg(win).textContent, /Type some numbers/)
  assert.ok(msg(win).classList.contains('error'))
  assert.equal(win.document.getElementById('custom-array-input').getAttribute('aria-invalid'), 'true')
})

test('input with no valid numbers shows an error and keeps the current array', () => {
  const win = loadApp()
  win.openViz('sorting')
  const before = [...win.__test.getSortArr()]
  load(win, 'foo, bar, baz')
  assert.equal(win.__test.getCustomArr(), null)
  assert.match(msg(win).textContent, /No valid numbers/)
  assert.deepEqual([...win.__test.getSortArr()], before, 'the random array should be untouched')
})

test('a single number is rejected: there is nothing to sort', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '42')
  assert.equal(win.__test.getCustomArr(), null)
  assert.match(msg(win).textContent, /at least 2/)
})

test('Use Array loads exactly those numbers into the single-mode visualizer', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '5, 3, 8, 1, 9')
  assert.deepEqual([...win.__test.getSortArr()], [5, 3, 8, 1, 9])
  assert.ok(msg(win).classList.contains('ok'))
  assert.match(msg(win).textContent, /Loaded 5 numbers/)
  assert.equal(win.document.getElementById('custom-array-input').getAttribute('aria-invalid'), 'false')
  assert.equal(win.document.getElementById('sort-size-val').textContent, '5 (custom)')
})

test('the success message reports what was ignored and capped', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '5, x, 300, 3')
  assert.deepEqual([...win.__test.getSortArr()], [5, 100, 3])
  assert.match(msg(win).textContent, /1 entry was not a number and ignored/)
  assert.match(msg(win).textContent, /1 value was kept within 1-100/)
})

test('every algorithm sorts the custom array correctly, duplicates included', () => {
  const win = loadApp()
  win.openViz('sorting')
  for (const algo of ['bubble', 'selection', 'insertion', 'merge', 'quick']) {
    win.document.getElementById('sort-algo').value = algo
    win.sortAlgoChange()
    load(win, '9, 2, 7, 2, 100, 1, 55')
    const gen = win.sortGenerator()
    let r
    do { r = gen.next() } while (!r.done)
    assert.deepEqual([...win.__test.getSortArr()], [1, 2, 2, 7, 9, 55, 100], `${algo} should sort the custom array`)
  }
})

test('changing algorithm keeps the custom array; it is not re-randomized', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '5, 3, 8, 1, 9')
  win.document.getElementById('sort-algo').value = 'quick'
  win.sortAlgoChange()
  assert.deepEqual([...win.__test.getSortArr()], [5, 3, 8, 1, 9])
})

test('Randomize still works as before: it discards the custom array for a random one', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '5, 3, 8, 1, 9')
  assert.match(win.document.getElementById('sort-rand-btn').getAttribute('onclick'), /handleRandomize\(\)/)
  win.handleRandomize()
  assert.equal(win.__test.getCustomArr(), null)
  const size = parseInt(win.document.getElementById('sort-size').value, 10)
  assert.equal(win.__test.getSortArr().length, size, 'random array should use the Size slider again')
  assert.equal(msg(win).textContent, '')
  assert.equal(win.document.getElementById('sort-size-val').textContent, String(size))
})

test('Compare Mode races both algorithms on the same custom array', () => {
  const win = loadApp()
  win.openViz('sorting')
  win.document.getElementById('compare-toggle').checked = true
  win.toggleCompareMode()
  load(win, '5, 3, 8, 1, 9')
  assert.deepEqual([...win.__test.getCmpA().arr], [5, 3, 8, 1, 9])
  assert.deepEqual([...win.__test.getCmpB().arr], [5, 3, 8, 1, 9])
})

test('Challenge Mode quizzes on the custom array and keeps it across Start', async () => {
  const win = loadApp()
  win.sleep = () => new Promise(r => setTimeout(r, 0))
  win.openViz('sorting')
  win.document.getElementById('sort-algo').value = 'bubble'
  win.document.getElementById('challenge-toggle').checked = true
  win.toggleChallengeMode()
  load(win, '9, 4, 7, 2, 8, 1')
  assert.deepEqual([...win.__test.getChState().arr], [9, 4, 7, 2, 8, 1])

  const bot = setInterval(() => {
    const opts = win.document.querySelectorAll('#ch-options .ch-opt:not(.locked)')
    if (opts.length) opts[0].click()
    const cont = [...win.document.querySelectorAll('#ch-options .ctrl-btn.primary')].pop()
    if (cont) cont.click()
  }, 2)
  try { await win.runChallenge() } finally { clearInterval(bot) }

  assert.equal(win.document.getElementById('cmp-status-ch').textContent, 'Done ✓')
  assert.deepEqual([...win.__test.getChState().arr], [1, 2, 4, 7, 8, 9], 'Start must not swap in a random array')
})

test('Benchmark Mode hides the custom input; leaving it brings it back', () => {
  const win = loadApp()
  win.openViz('sorting')
  const row = win.document.getElementById('sort-custom-row')
  assert.equal(row.style.display, 'flex')
  win.document.getElementById('bench-toggle').checked = true
  win.toggleBenchMode()
  assert.equal(row.style.display, 'none')
  win.document.getElementById('bench-toggle').checked = false
  win.toggleBenchMode()
  assert.equal(row.style.display, 'flex')
})

test('reopening the Sorting view starts fresh: custom array, field, and message are cleared', () => {
  const win = loadApp()
  win.openViz('sorting')
  load(win, '5, 3, 8, 1, 9')
  win.goHub()
  win.openViz('sorting')
  assert.equal(win.__test.getCustomArr(), null)
  assert.equal(win.document.getElementById('custom-array-input').value, '')
  assert.equal(msg(win).textContent, '')
})

test('the field and button are labeled and Enter is wired to submit', () => {
  const win = loadApp()
  const input = win.document.getElementById('custom-array-input')
  assert.ok(win.document.querySelector('label[for="custom-array-input"]'))
  assert.equal(input.getAttribute('aria-describedby'), 'custom-msg')
  assert.match(input.getAttribute('onkeydown') || '', /Enter/)
  assert.match(input.getAttribute('onkeydown') || '', /useCustomArray\(\)/)
  assert.equal(win.document.getElementById('custom-msg').getAttribute('aria-live'), 'polite')
})
