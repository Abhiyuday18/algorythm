const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

test('a theme is applied on load and the toggle flips it', () => {
  const win = loadApp()
  const root = win.document.documentElement
  const initial = root.getAttribute('data-theme')
  assert.ok(initial === 'dark' || initial === 'light', 'a data-theme should be set at startup')

  win.toggleTheme()
  const flipped = root.getAttribute('data-theme')
  assert.notEqual(flipped, initial)
  assert.equal(win.localStorage.getItem('algorythm-theme'), flipped, 'choice should be persisted')

  const btn = win.document.getElementById('theme-toggle')
  assert.equal(btn.textContent, flipped === 'light' ? 'Dark' : 'Light', 'toggle label should offer the other theme')
})

test('a saved theme preference wins over the OS default on next load', () => {
  const win = loadApp()
  win.applyTheme('light')
  // Same-window re-init simulates a reload path: initTheme reads storage.
  win.document.documentElement.setAttribute('data-theme', 'dark')
  win.initTheme()
  assert.equal(win.document.documentElement.getAttribute('data-theme'), 'light')
})

test('Docs page opens from the nav and goHub returns from it', () => {
  const win = loadApp()
  win.openDocs()
  assert.equal(win.document.getElementById('docs').style.display, 'block')
  assert.equal(win.document.getElementById('hub').classList.contains('hidden'), true)
  assert.equal(win.document.getElementById('nav-back').classList.contains('visible'), true)

  win.goHub()
  assert.equal(win.document.getElementById('docs').style.display, 'none')
  assert.equal(win.document.getElementById('hub').classList.contains('hidden'), false)
})

test('opening a visualization also closes the Docs page', () => {
  const win = loadApp()
  win.openDocs()
  win.openViz('sorting')
  assert.equal(win.document.getElementById('docs').style.display, 'none')
  assert.equal(win.document.getElementById('viz-sorting').style.display, 'block')
})

test('tour: starts on demand, steps through, and Skip ends it with the done flag set', () => {
  const win = loadApp()
  win.startTour(true)
  let pop = win.document.getElementById('tour-pop')
  assert.ok(pop, 'tour popover should exist after startTour')
  assert.match(pop.textContent, /1 \/ \d+/)
  assert.ok(win.document.querySelector('.tour-highlight'), 'first target should be highlighted')

  win.document.getElementById('tour-next-btn').click()
  pop = win.document.getElementById('tour-pop')
  assert.match(pop.textContent, /2 \/ \d+/)
  assert.equal(win.document.getElementById('viz-sorting').style.display, 'block', 'step 2 should open the sorting view')

  win.document.getElementById('tour-skip-btn').click()
  assert.equal(win.document.getElementById('tour-pop'), null, 'popover should be removed on skip')
  assert.equal(win.document.querySelector('.tour-highlight'), null, 'highlight should be cleared on skip')
  assert.equal(win.localStorage.getItem('algorythm-tour-done'), '1')
})

test('tour: does not auto-start once marked done', () => {
  const win = loadApp()
  win.localStorage.setItem('algorythm-tour-done', '1')
  win.startTour(false)
  assert.equal(win.document.getElementById('tour-pop'), null)
})

test('mode pills still drive the underlying toggles', () => {
  const win = loadApp()
  win.openViz('sorting')
  const pill = win.document.querySelector('#sort-mode-pills .mode-pill input#compare-toggle')
  assert.ok(pill, 'compare toggle should live inside the mode pills')
  pill.checked = true
  win.toggleCompareMode()
  assert.equal(win.document.getElementById('sort-compare-layout').style.display, 'block')
})
