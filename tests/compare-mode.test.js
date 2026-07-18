const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp, drainGenerator } = require('./helpers/load-app.js')

const ALGORITHMS = ['bubble', 'selection', 'insertion', 'merge', 'quick']

function isSorted(arr) {
  return arr.every((v, i, a) => i === 0 || a[i - 1] <= v)
}

test('Compare Mode gives both sides the exact same starting array', () => {
  const win = loadApp()
  win.openViz('sorting')
  win.document.getElementById('compare-toggle').checked = true
  win.toggleCompareMode()

  const a = win.__test.getCmpA(), b = win.__test.getCmpB()
  assert.deepEqual(a.arr, b.arr)
})

for (const algoA of ALGORITHMS) {
  for (const algoB of ALGORITHMS) {
    if (algoA >= algoB) continue // one direction per unordered pair is enough
    test(`Compare Mode: ${algoA} vs ${algoB} both sort correctly from the same array`, () => {
      const win = loadApp()
      win.openViz('sorting')
      win.document.getElementById('compare-toggle').checked = true
      win.toggleCompareMode()
      win.document.getElementById('sort-algo-a').value = algoA
      win.document.getElementById('sort-algo-b').value = algoB
      win.compareAlgoChange()

      const a = win.__test.getCmpA(), b = win.__test.getCmpB()
      const original = [...a.arr]

      drainGenerator(win.compareGen(a))
      drainGenerator(win.compareGen(b))

      assert.ok(isSorted(a.arr), `${algoA} result not sorted: ${a.arr}`)
      assert.ok(isSorted(b.arr), `${algoB} result not sorted: ${b.arr}`)
      assert.deepEqual([...a.arr].sort((x, y) => x - y), [...original].sort((x, y) => x - y))
    })
  }
}

test('explainCompareResult: two quadratic algorithms are framed as sharing the same growth rate', () => {
  const win = loadApp()
  const html = win.explainCompareResult('bubble', 'selection', 'a', 20)
  assert.match(html, /same growth rate/)
})

test('explainCompareResult: a linearithmic winner over a quadratic loser cites both Big-O classes', () => {
  const win = loadApp()
  const html = win.explainCompareResult('selection', 'quick', 'b', 20)
  assert.match(html, /O\(n log n\)/)
  assert.match(html, /O\(n²\)/)
})

test('explainCompareResult: a tie (no winner) is framed as an exact tie, not a false winner', () => {
  const win = loadApp()
  const html = win.explainCompareResult('merge', 'quick', null, 20)
  assert.match(html, /exact same number of steps/)
})
