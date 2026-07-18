const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

const ALGORITHMS = ['bubble', 'selection', 'insertion', 'merge', 'quick']

test('benchMeasure returns positive operation counts for every algorithm', () => {
  const win = loadApp()
  for (const algo of ALGORITHMS) {
    const { comps, swaps } = win.benchMeasure(algo, 32)
    assert.ok(comps > 0, `${algo}: expected comparisons > 0, got ${comps}`)
    assert.ok(comps + swaps > 0)
  }
})

test('measured counts reflect complexity classes: bubble costs more than merge at n=64', () => {
  const win = loadApp()
  // Averaged over a few runs so quick-sort-style pivot luck can't flake it.
  let bubble = 0, merge = 0
  for (let t = 0; t < 3; t++) {
    const b = win.benchMeasure('bubble', 64)
    const m = win.benchMeasure('merge', 64)
    bubble += b.comps + b.swaps
    merge += m.comps + m.swaps
  }
  assert.ok(bubble > merge, `expected bubble (${bubble}) > merge (${merge}) total ops at n=64`)
})

test('measured counts grow superlinearly for bubble sort as n doubles', () => {
  const win = loadApp()
  const at = (n) => {
    let total = 0
    for (let t = 0; t < 3; t++) { const m = win.benchMeasure('bubble', n); total += m.comps + m.swaps }
    return total / 3
  }
  const n64 = at(64), n128 = at(128)
  // O(n²) predicts ~4x when n doubles; 3x is a safe lower bound over noise.
  assert.ok(n128 > n64 * 3, `expected n=128 ops (${n128}) to be >3x n=64 ops (${n64})`)
})

test('silent benchmark states never touch the DOM (no cmp-* elements needed)', () => {
  const win = loadApp()
  // Deliberately do NOT open the sorting view: if benchMeasure reached for
  // any cmp-* element, getElementById would return null and this would throw.
  assert.doesNotThrow(() => win.benchMeasure('quick', 48))
})

test('benchArray produces the intended input shapes for each pattern', () => {
  const win = loadApp()
  const n = 100

  const nearly = win.benchArray(n, 'nearly')
  const outOfOrder = nearly.filter((v, i) => i > 0 && nearly[i - 1] > v).length
  assert.ok(outOfOrder < n * 0.25, `nearly-sorted array has too much disorder: ${outOfOrder}/${n} adjacent inversions`)

  const reversed = win.benchArray(n, 'reversed')
  assert.ok(reversed.every((v, i) => i === 0 || reversed[i - 1] >= v), 'reversed array is not non-increasing')

  const few = win.benchArray(n, 'fewunique')
  assert.ok(new Set(few).size <= 4, `few-unique array has ${new Set(few).size} distinct values, expected <= 4`)

  const random = win.benchArray(n, 'random')
  assert.equal(random.length, n)
})

test('insertion sort exploits nearly sorted input but pays its worst case on reversed input', () => {
  const win = loadApp()
  const at = (pattern) => {
    let total = 0
    for (let t = 0; t < 3; t++) { const m = win.benchMeasure('insertion', 128, pattern); total += m.comps + m.swaps }
    return total / 3
  }
  const nearly = at('nearly'), reversed = at('reversed')
  assert.ok(reversed > nearly * 3, `expected reversed (${reversed}) to cost >3x nearly-sorted (${nearly})`)
})

test('quick sort with last-element pivot degrades on reversed input relative to random', () => {
  const win = loadApp()
  const at = (pattern) => {
    let total = 0
    for (let t = 0; t < 3; t++) { const m = win.benchMeasure('quick', 128, pattern); total += m.comps + m.swaps }
    return total / 3
  }
  const random = at('random'), reversed = at('reversed')
  assert.ok(reversed > random * 3, `expected reversed (${reversed}) to cost >3x random (${random}) for last-pivot quicksort`)
})

test('Benchmark and Compare Mode toggles are mutually exclusive', () => {
  const win = loadApp()
  win.openViz('sorting')
  win.document.getElementById('compare-toggle').checked = true
  win.toggleCompareMode()
  win.document.getElementById('bench-toggle').checked = true
  win.toggleBenchMode()

  assert.equal(win.document.getElementById('compare-toggle').checked, false)
  assert.equal(win.document.getElementById('sort-bench-layout').style.display, 'block')
  assert.equal(win.document.getElementById('sort-compare-layout').style.display, 'none')

  win.document.getElementById('compare-toggle').checked = true
  win.toggleCompareMode()
  assert.equal(win.document.getElementById('bench-toggle').checked, false)
  assert.equal(win.document.getElementById('sort-compare-layout').style.display, 'block')
  assert.equal(win.document.getElementById('sort-bench-layout').style.display, 'none')
})
