const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp, drainGenerator } = require('./helpers/load-app.js')

const ALGORITHMS = ['bubble', 'selection', 'insertion', 'merge', 'quick']

function isSorted(arr) {
  return arr.every((v, i, a) => i === 0 || a[i - 1] <= v)
}
function sameMultiset(a, b) {
  return JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y))
}

for (const algo of ALGORITHMS) {
  test(`${algo} sort produces a sorted array without losing elements`, () => {
    const win = loadApp()
    win.openViz('sorting')
    win.document.getElementById('sort-algo').value = algo
    win.sortAlgoChange()
    const before = [...win.__test.getSortArr()]

    drainGenerator(win.sortGenerator())
    const after = win.__test.getSortArr()

    assert.ok(isSorted(after), `${algo}: result is not sorted: ${after}`)
    assert.ok(sameMultiset(before, after), `${algo}: result has different elements than input`)
  })

  test(`${algo} sort handles an already-sorted array`, () => {
    const win = loadApp()
    win.openViz('sorting')
    win.document.getElementById('sort-algo').value = algo
    win.sortAlgoChange()
    win.__test.getSortArr().splice(0, Infinity, ...[1, 2, 3, 4, 5, 6, 7, 8])

    drainGenerator(win.sortGenerator())

    assert.ok(isSorted(win.__test.getSortArr()))
  })

  test(`${algo} sort handles duplicate values`, () => {
    const win = loadApp()
    win.openViz('sorting')
    win.document.getElementById('sort-algo').value = algo
    win.sortAlgoChange()
    win.__test.getSortArr().splice(0, Infinity, ...[5, 3, 5, 1, 5, 3, 1, 5])

    drainGenerator(win.sortGenerator())

    assert.ok(isSorted(win.__test.getSortArr()))
    // Spread into a plain Node array first: getSortArr() returns an Array
    // from jsdom's realm, whose prototype differs from Node's own Array,
    // which deepEqual treats as a mismatch even when contents are identical.
    assert.deepEqual([...win.__test.getSortArr()], [1, 1, 3, 3, 5, 5, 5, 5])
  })
}

test('Step mode and Run mode agree: stepping one generator to completion matches driving another straight through', () => {
  const win = loadApp()
  win.openViz('sorting')
  win.document.getElementById('sort-algo').value = 'quick'
  win.sortAlgoChange()
  const arr = [9, 2, 7, 4, 1, 8, 3, 6, 5]
  win.__test.getSortArr().splice(0, Infinity, ...arr)

  // Reset to the same starting array and drive a second, independent
  // generator straight through, to compare against manual .next() stepping.
  win.__test.getSortArr().splice(0, Infinity, ...arr)
  const stepGen = win.sortGenerator()
  let r
  do { r = stepGen.next() } while (!r.done)
  const stepped = [...win.__test.getSortArr()]

  win.__test.getSortArr().splice(0, Infinity, ...arr)
  drainGenerator(win.sortGenerator())
  const run = [...win.__test.getSortArr()]

  assert.deepEqual(stepped, run)
})
