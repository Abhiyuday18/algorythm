const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

const $ = (win, id) => win.document.getElementById(id)
const open = (hash) => loadApp({ url: 'http://localhost/' + hash })
const shown = (win, viz) => win.document.getElementById('viz-' + viz).style.display === 'block'
const arr = (a) => [...a]

// ─── parsing ──────────────────────────────────────────────────

test('parseShareHash reads route and params, and rejects non-route hashes', () => {
  const win = loadApp()
  const p = win.parseShareHash('#/sorting?algo=quick&arr=5,3,8')
  assert.equal(p.route, 'sorting')
  assert.equal(p.params.algo, 'quick')
  assert.equal(p.params.arr, '5,3,8')
  for (const bad of ['', '#', '#sorting', '#/', '#/Sorting', '#/sort1ng', null, undefined]) {
    assert.equal(win.parseShareHash(bad), null, String(bad))
  }
})

test('malformed percent-encoding and prototype-polluting keys are harmless', () => {
  const win = loadApp()
  const p = win.parseShareHash('#/sorting?algo=%E0%A4%A&__proto__=x&constructor=y&speed=3')
  assert.equal(p.params.speed, '3')
  assert.equal(p.params.algo, undefined)
  assert.equal(Object.getPrototypeOf(p.params), null)
  assert.equal(win.Object.prototype.x, undefined)
})

test('shareBase uses the live site for file: and the page URL otherwise', () => {
  const win = loadApp()
  assert.equal(win.shareBase({ protocol: 'file:', origin: 'null', pathname: '/Users/x/index.html' }), 'https://abhiyuday18.github.io/algorythm/')
  assert.equal(win.shareBase({ protocol: 'https:', origin: 'https://a.io', pathname: '/algo/' }), 'https://a.io/algo/')
})

test('wall bitmask round-trips and is empty for no walls', () => {
  const win = loadApp()
  const grid = Array.from({ length: win.__test.getRows() }, () => Array(win.__test.getCols()).fill('empty'))
  assert.equal(win.wallsToHex(grid), '')
  const cells = [[0, 0], [0, 1], [3, 7], [10, 20], [16, 27]]
  cells.forEach(([r, c]) => { grid[r][c] = 'wall' })
  const hex = win.wallsToHex(grid)
  assert.match(hex, /^[0-9a-f]+$/)
  assert.ok(hex.length <= Math.ceil((16 + 1) * 28 / 4))
  assert.deepEqual([...win.hexToWalls(hex)].map((x) => [...x]), cells)
})

// ─── round trips ──────────────────────────────────────────────

test('sorting link: algorithm, exact array and speed survive a round trip', () => {
  const win = open('#/sorting?algo=merge&arr=9,2,7,4,1&speed=8')
  assert.ok(shown(win, 'sorting'))
  assert.equal($(win, 'sort-algo').value, 'merge')
  assert.equal($(win, 'sort-speed').value, '8')
  assert.equal($(win, 'sort-speed-val').textContent, '8')
  assert.deepEqual(arr(win.__test.getSortArr()), [9, 2, 7, 4, 1])
  const link = win.buildShareLink('sorting')
  assert.match(link, /#\/sorting\?algo=merge&arr=9,2,7,4,1&speed=8$/)
})

test('the shared array is the pre-run array, even after sorting has mutated the display', async () => {
  const win = open('#/sorting?algo=bubble&arr=9,2,7,4,1')
  await win.runSort()
  assert.deepEqual(arr(win.__test.getSortArr()), [1, 2, 4, 7, 9])
  assert.match(win.buildShareLink('sorting'), /arr=9,2,7,4,1/)
})

test('compare, challenge and benchmark modes round trip', () => {
  let win = open('#/sorting?mode=compare&a=quick&b=insertion&arr=6,5,4,3,2,1')
  assert.ok(win.__test.getCompareMode())
  assert.equal($(win, 'sort-algo-a').value, 'quick')
  assert.equal($(win, 'sort-algo-b').value, 'insertion')
  assert.match(win.buildShareLink('sorting'), /mode=compare&a=quick&b=insertion&arr=6,5,4,3,2,1/)

  win = open('#/sorting?mode=challenge&algo=selection&arr=4,3,2,1')
  assert.ok(win.__test.getChallengeMode())
  assert.equal($(win, 'sort-algo').value, 'selection')
  assert.match(win.buildShareLink('sorting'), /mode=challenge&algo=selection/)

  win = open('#/sorting?mode=bench&pattern=reversed&metric=swaps')
  assert.ok(win.__test.getBenchMode())
  assert.equal($(win, 'bench-pattern').value, 'reversed')
  assert.equal($(win, 'bench-metric').value, 'swaps')
  assert.match(win.buildShareLink('sorting'), /mode=bench&pattern=reversed&metric=swaps$/)
})

test('binary search link restores the array and target', () => {
  const win = open('#/bsearch?arr=40,3,17,25,9,60&target=25')
  assert.ok(shown(win, 'bsearch'))
  assert.deepEqual(arr(win.__test.getBsArr()), [3, 9, 17, 25, 40, 60])
  assert.equal($(win, 'bs-target-sel').value, '25')
  assert.match(win.buildShareLink('bsearch'), /arr=3,9,17,25,40,60&target=25$/)
})

test('pathfinder link restores algorithm, endpoints, walls and Dijkstra weights', () => {
  const win = open('#/pathfinder?algo=dijkstra&start=1.1&end=10.20&walls=f&weights=abc')
  assert.ok(shown(win, 'pathfinder'))
  assert.equal($(win, 'path-algo').value, 'dijkstra')
  assert.deepEqual(arr(win.__test.getPathStart()), [1, 1])
  assert.deepEqual(arr(win.__test.getPathEnd()), [10, 20])
  const g = win.__test.getPathGrid()
  assert.deepEqual([g[0][0], g[0][1], g[0][2], g[0][3]], ['wall', 'wall', 'wall', 'wall'])
  assert.equal(win.__test.getPathWeightSeed(), parseInt('abc', 36))
  const flat = (w) => w.map((r) => [...r].join(',')).join(';')
  const w1 = flat(win.__test.getPathWeights())
  const again = open('#/pathfinder?algo=dijkstra&start=1.1&end=10.20&walls=f&weights=abc')
  assert.equal(flat(again.__test.getPathWeights()), w1, 'same seed gives same weights')
  assert.match(win.buildShareLink('pathfinder'), /algo=dijkstra&start=1\.1&end=10\.20&walls=f&weights=abc$/)
})

test('walls never overwrite the start or end cell', () => {
  const win = open('#/pathfinder?start=0.0&end=0.1&walls=ffff')
  const g = win.__test.getPathGrid()
  assert.notEqual(g[0][0], 'wall')
  assert.notEqual(g[0][1], 'wall')
  assert.equal(g[0][2], 'wall')
})

test('hanoi, n-queens and sudoku links', () => {
  let win = open('#/hanoi?disks=5&speed=9')
  assert.equal($(win, 'hanoi-disks').value, '5')
  assert.equal($(win, 'hanoi-speed').value, '9')
  assert.match(win.buildShareLink('hanoi'), /#\/hanoi\?disks=5&speed=9$/)

  win = open('#/nqueen?size=6&speed=2')
  assert.equal($(win, 'nq-size').value, '6')
  assert.equal(win.__test.getNqBoard().length, 6)

  win = open('#/sudoku?puzzle=2')
  assert.equal($(win, 'sdk-puzzle-sel').value, '2')
  assert.match(win.buildShareLink('sudoku'), /#\/sudoku\?puzzle=2&speed=\d+$/)
})

// ─── hostile / invalid input ──────────────────────────────────

test('invalid values are ignored with a note, never applied', () => {
  const win = open('#/sorting?algo=evil&speed=99&arr=a,b,c&mode=nope')
  assert.ok(shown(win, 'sorting'))
  assert.equal($(win, 'sort-algo').value, 'bubble')
  assert.equal($(win, 'sort-speed').value, '5')
  const note = $(win, 'share-msg-sorting').textContent
  for (const k of ['algo', 'speed', 'array', 'mode']) assert.match(note, new RegExp(k))
})

test('markup in parameters is never rendered as HTML', () => {
  const win = open('#/sorting?algo=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&arr=%3Cscript%3E')
  assert.equal(win.document.querySelectorAll('img[onerror]').length, 0)
  assert.equal(win.document.querySelectorAll('#share-msg-sorting img, #share-msg-sorting script').length, 0)
})

test('out of range pathfinder and binary search values fall back safely', () => {
  let win = open('#/pathfinder?start=99.99&end=0.0&walls=zz&weights=!!!&algo=bfs')
  assert.deepEqual(arr(win.__test.getPathStart()), [2, 2])
  assert.match($(win, 'share-msg-pathfinder').textContent, /start/)
  assert.match($(win, 'share-msg-pathfinder').textContent, /walls/)
  assert.match($(win, 'share-msg-pathfinder').textContent, /weights/)

  win = open('#/pathfinder?start=3.3&end=3.3')
  assert.notDeepEqual(arr(win.__test.getPathStart()), arr(win.__test.getPathEnd()))

  win = open('#/bsearch?arr=1,2&target=2')
  assert.match($(win, 'share-msg-bsearch').textContent, /array/)
  win = open('#/bsearch?arr=1,2,3,4,5&target=77')
  assert.match($(win, 'share-msg-bsearch').textContent, /target/)
})

test('oversized sorting arrays are clamped by the same rules as manual input', () => {
  const big = Array.from({ length: 200 }, (_, i) => i + 1).join(',')
  const win = open('#/sorting?arr=' + big)
  assert.ok(win.__test.getSortArr().length <= 60)
})

test('unknown routes fall through to the hub and the tour is allowed', () => {
  const win = open('#/nothing?x=1')
  assert.equal(win.applyHashRoute(), false)
  assert.ok(!shown(win, 'sorting'))
})

test('docs and progress routes open their pages', () => {
  assert.equal(open('#/docs').document.getElementById('docs').style.display, 'block')
  assert.equal(open('#/progress').document.getElementById('progress').style.display, 'block')
})

test('hashchange applies a new scenario', () => {
  const win = loadApp()
  win.location.hash = '#/hanoi?disks=4'
  win.dispatchEvent(new win.HashChangeEvent('hashchange'))
  assert.ok(shown(win, 'hanoi'))
  assert.equal($(win, 'hanoi-disks').value, '4')
})

test('opening a plain sorting link resets any mode left on', () => {
  const win = open('#/sorting?mode=compare&a=quick&b=bubble')
  win.applyScenario('sorting', win.parseShareHash('#/sorting?algo=quick').params)
  assert.equal(win.__test.getCompareMode(), false)
})

// ─── share button ─────────────────────────────────────────────

test('share button copies the link, updates the hash and confirms', async () => {
  const win = open('#/sorting?algo=quick&arr=3,1,2')
  let copied = ''
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t } }, configurable: true })
  const link = await win.shareScenario('sorting')
  assert.equal(copied, link)
  assert.equal(win.location.hash, '#/sorting?algo=quick&arr=3,1,2&speed=5')
  assert.match($(win, 'share-msg-sorting').textContent, /Link copied/)
})

test('share button falls back to a readonly field when copying is unavailable', async () => {
  const win = loadApp()
  win.openViz('hanoi')
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied') } }, configurable: true })
  win.document.execCommand = () => false
  await win.shareScenario('hanoi')
  const inp = $(win, 'share-msg-hanoi').querySelector('input')
  assert.ok(inp)
  assert.equal(inp.readOnly, true)
  assert.match(inp.value, /#\/hanoi\?disks=3/)
})

test('share buttons exist in every visualizer and messages clear on navigation', () => {
  const win = open('#/hanoi?disks=4')
  for (const v of ['sorting', 'bsearch', 'pathfinder', 'hanoi', 'nqueen', 'sudoku']) {
    assert.ok($(win, 'share-msg-' + v), v)
    assert.match(win.document.getElementById('viz-' + v).innerHTML, new RegExp("shareScenario\\('" + v + "'\\)"))
  }
  assert.match($(win, 'share-msg-hanoi').textContent, /shared link/)
  win.goHub()
  assert.equal($(win, 'share-msg-hanoi').textContent, '')
})
