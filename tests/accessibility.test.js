const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

// jsdom only compiles inline on*="" attributes into real event listeners
// when runScripts is 'dangerously' -- which would also auto-execute
// index.html's <script> before the canvas-getContext stub is in place (see
// load-app.js). So instead of dispatching DOM events and hoping jsdom
// routes them through the attribute, these tests call the exact handler
// the attribute invokes with a minimal fake event, and separately assert
// the attribute text so a typo in the wiring itself would still be caught.
function fakeEvent(key) {
  return { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
}

test('skip link points at a focusable main landmark', () => {
  const win = loadApp()
  const skip = win.document.querySelector('.skip-link')
  assert.ok(skip, 'skip link should exist')
  const targetId = skip.getAttribute('href').replace('#', '')
  const target = win.document.getElementById(targetId)
  assert.ok(target, 'skip link target should exist')
  assert.equal(target.tagName, 'MAIN')
  assert.equal(target.getAttribute('tabindex'), '-1')
})

test('activateOnKey invokes the callback on Enter and Space, and only those keys', () => {
  const win = loadApp()
  let calls = 0
  win.activateOnKey(fakeEvent('Enter'), () => calls++)
  win.activateOnKey(fakeEvent(' '), () => calls++)
  win.activateOnKey(fakeEvent('Tab'), () => calls++)
  assert.equal(calls, 2)
})

test('every algo-card is keyboard operable (role, tabindex, label) and its onkeydown wiring targets activateOnKey', () => {
  const win = loadApp()
  const cards = win.document.querySelectorAll('.algo-card')
  assert.equal(cards.length, 6)
  for (const card of cards) {
    assert.equal(card.getAttribute('role'), 'button')
    assert.equal(card.getAttribute('tabindex'), '0')
    assert.ok(card.getAttribute('aria-label'), 'card should have an accessible name')
    assert.match(card.getAttribute('onkeydown') || '', /activateOnKey\(event/)
  }

  // Exercise the real behavior the wiring above delegates to.
  win.document.getElementById('viz-panel').style.display = 'none'
  win.activateOnKey(fakeEvent(' '), () => win.openViz('pathfinder'))
  assert.equal(win.document.getElementById('viz-panel').style.display, 'block')
  assert.equal(win.document.getElementById('viz-pathfinder').style.display, 'block')
})

test('nav-logo and nav-back are keyboard-wired to goHub and actually return to the hub', () => {
  const win = loadApp()
  assert.match(win.document.querySelector('.nav-logo').getAttribute('onkeydown') || '', /activateOnKey\(event,goHub\)/)
  assert.match(win.document.getElementById('nav-back').getAttribute('onkeydown') || '', /activateOnKey\(event,goHub\)/)

  win.openViz('sorting')
  assert.equal(win.document.getElementById('hub').classList.contains('hidden'), true)
  win.activateOnKey(fakeEvent('Enter'), win.goHub)
  assert.equal(win.document.getElementById('hub').classList.contains('hidden'), false)
})

test('pathfinder grid is keyboard-navigable: arrow keys move the cursor, Enter applies the current mode', () => {
  const win = loadApp()
  win.openViz('pathfinder')
  const grid = win.document.getElementById('path-grid')
  assert.equal(grid.getAttribute('role'), 'application')
  assert.ok(grid.getAttribute('aria-label'))
  assert.match(grid.getAttribute('onkeydown') || '', /handlePathGridKey\(event\)/)

  const before = [...win.__test.getPathCursor()]
  win.handlePathGridKey(fakeEvent('ArrowRight'))
  win.handlePathGridKey(fakeEvent('ArrowRight'))
  win.handlePathGridKey(fakeEvent('ArrowDown'))
  assert.deepEqual([...win.__test.getPathCursor()], [before[0] + 1, before[1] + 2])

  // Default path-mode is 'wall'; Enter at the cursor should place one.
  win.handlePathGridKey(fakeEvent('Enter'))
  const [r, c] = win.__test.getPathCursor()
  assert.equal(win.__test.getPathGrid()[r][c], 'wall')

  const kfocusCell = grid.querySelector('.pcell.kfocus')
  assert.equal(+kfocusCell.dataset.r, r)
  assert.equal(+kfocusCell.dataset.c, c)

  const announcement = win.document.getElementById('path-kb-status').textContent
  assert.match(announcement, /Row \d+, column \d+: wall/)
})

test('pathfinder keyboard cursor cannot move out of grid bounds', () => {
  const win = loadApp()
  win.openViz('pathfinder')
  win.__test.setPathCursor(0, 0)
  win.handlePathGridKey(fakeEvent('ArrowUp'))
  win.handlePathGridKey(fakeEvent('ArrowLeft'))
  assert.deepEqual([...win.__test.getPathCursor()], [0, 0])
})

test('pathfinder keyboard input is ignored while an algorithm is running or in step mode', () => {
  const win = loadApp()
  win.openViz('pathfinder')
  win.__test.setPathCursor(2, 2)
  win.__test.setPathRunning(true)
  win.handlePathGridKey(fakeEvent('ArrowRight'))
  assert.deepEqual([...win.__test.getPathCursor()], [2, 2], 'cursor should not move while pathRunning')
})

test('pathfinder cells are aria-hidden (interaction is exposed via the grid container + live region, not per-cell)', () => {
  const win = loadApp()
  win.openViz('pathfinder')
  const cells = win.document.querySelectorAll('#path-grid .pcell')
  assert.ok(cells.length > 0)
  for (const cell of cells) assert.equal(cell.getAttribute('aria-hidden'), 'true')
})

test('decorative canvases are hidden from assistive tech', () => {
  const win = loadApp()
  for (const id of ['sort-canvas', 'cmp-canvas-a', 'cmp-canvas-b', 'bench-canvas', 'hanoi-canvas']) {
    assert.equal(win.document.getElementById(id).getAttribute('aria-hidden'), 'true', `${id} should be aria-hidden`)
  }
})

test('narration and status text use aria-live so screen readers hear updates automatically', () => {
  const win = loadApp()
  for (const id of ['sort-explain', 'bs-explain', 'path-explain', 'hanoi-explain', 'nq-explain', 'sdk-explain']) {
    assert.equal(win.document.getElementById(id).getAttribute('aria-live'), 'polite', `${id} should be aria-live`)
  }
  for (const id of ['sort-status', 'bs-status', 'path-status', 'hanoi-status', 'nq-status', 'sdk-status', 'bench-status', 'cmp-status-a', 'cmp-status-b']) {
    assert.equal(win.document.getElementById(id).getAttribute('aria-live'), 'polite', `${id} should be aria-live`)
  }
})

test('form controls without visible programmatic labels have an aria-label', () => {
  const win = loadApp()
  const ids = [
    'sort-algo', 'sort-algo-a', 'sort-algo-b', 'bench-pattern', 'bench-metric',
    'sort-size', 'sort-speed', 'bs-target-sel', 'path-algo', 'path-mode',
    'hanoi-disks', 'hanoi-speed', 'nq-size', 'nq-speed', 'sdk-puzzle-sel', 'sdk-speed'
  ]
  for (const id of ids) {
    const el = win.document.getElementById(id)
    assert.ok(el.getAttribute('aria-label'), `${id} should have an aria-label`)
  }
})

test('easter egg close button is keyboard operable', () => {
  const win = loadApp()
  const egg = win.document.getElementById('easter-egg')
  egg.classList.add('visible')
  const closeBtn = win.document.querySelector('.egg-close')
  assert.equal(closeBtn.getAttribute('role'), 'button')
  assert.equal(closeBtn.getAttribute('tabindex'), '0')
  assert.match(closeBtn.getAttribute('onkeydown') || '', /activateOnKey\(event,closeEasterEgg\)/)

  win.activateOnKey(fakeEvent('Enter'), win.closeEasterEgg)
  assert.equal(egg.classList.contains('visible'), false)
  assert.equal(egg.getAttribute('aria-hidden'), 'true')
})
