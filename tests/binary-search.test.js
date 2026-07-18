const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp, drainGenerator } = require('./helpers/load-app.js')

test('binary search finds every value that is actually present', () => {
  const win = loadApp()
  win.openViz('bsearch')
  const arr = win.__test.getBsArr()

  for (const target of arr) {
    drainGenerator(win.bsGenerator(target))
    assert.equal(win.document.getElementById('bs-status').textContent, 'Found ✓', `target ${target} should be found`)
  }
})

test('binary search correctly reports absent values as not found', () => {
  const win = loadApp()
  win.openViz('bsearch')
  const arr = win.__test.getBsArr()
  const maxVal = Math.max(...arr)

  // arr entries are unique 3-97; a value one above the max is guaranteed absent.
  const absent = maxVal + 1
  drainGenerator(win.bsGenerator(absent))

  assert.equal(win.document.getElementById('bs-status').textContent, 'Not found')
})

test('binary search never takes more than ceil(log2(n)) + 1 steps', () => {
  const win = loadApp()
  win.openViz('bsearch')
  const arr = win.__test.getBsArr()
  const maxSteps = Math.ceil(Math.log2(arr.length)) + 1

  for (const target of arr) {
    drainGenerator(win.bsGenerator(target))
    const steps = parseInt(win.document.getElementById('bs-steps').textContent, 10)
    assert.ok(steps <= maxSteps, `target ${target} took ${steps} steps, expected <= ${maxSteps}`)
  }
})
