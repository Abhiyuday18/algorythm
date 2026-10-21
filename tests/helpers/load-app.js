const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const HTML_PATH = path.join(__dirname, '..', '..', 'index.html')
const html = fs.readFileSync(HTML_PATH, 'utf8')

const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/)
if (!scriptMatch) throw new Error('Could not find inline <script> in index.html')
const appScript = scriptMatch[1]

// index.html's top-level state (sortArr, pathGrid, nqBoard, ...) is declared
// with let/const, so it is NOT exposed as a window property and is invisible
// to any eval() call other than the one that originally declared it (this
// matches real browser eval semantics, not a jsdom quirk). To let tests read
// that state, this hook is appended to the SAME eval invocation as the app
// script, so it closes over the real, live bindings rather than copies.
const TEST_HOOKS = `
// The guided tour auto-starts on a 700ms timer in real browsers; in tests
// that timer could fire mid-test and call goHub(), aborting async runs.
// This flag is checked inside the timer callback, and TEST_HOOKS runs long
// before 700ms elapse, so setting it here reliably suppresses auto-start.
window.__disableTour = true
window.__test = {
  getSortArr: () => sortArr,
  getBsArr: () => bsArr,
  getPathGrid: () => pathGrid,
  getPathWeights: () => pathWeights,
  getPathStart: () => pathStart,
  getPathEnd: () => pathEnd,
  getRows: () => ROWS,
  getCols: () => COLS,
  getNqBoard: () => nqBoard,
  getSdkBoard: () => sdkBoard,
  getSdkGiven: () => sdkGiven,
  getSdkPuzzles: () => SDK_PUZZLES,
  getCmpA: () => cmpA,
  getCmpB: () => cmpB,
  setPathRunning: (v) => { pathRunning = v },
  setPathGrid: (g) => { pathGrid = g },
  setPathStart: (s) => { pathStart = s },
  setPathEnd: (e) => { pathEnd = e },
  getPathCursor: () => pathCursor,
  setPathCursor: (r, c) => { pathCursor[0] = r; pathCursor[1] = c },
  getCustomArr: () => customArr,
  getQuizState: () => quizState,
  getQuizBank: () => QUIZ_BANK,
  getQuizTitles: () => QUIZ_TITLES,
  getChState: () => chState,
  getChPlan: () => chPlan
}
`

// jsdom has no real 2D canvas backend; stub just enough of the Canvas API
// surface for the drawing code (bars, Hanoi disks) to run without throwing.
// None of these are exercised for correctness -- only the algorithm state is.
function makeFakeCtx() {
  return {
    fillRect() {}, clearRect() {}, beginPath() {}, fill() {}, fillText() {},
    roundRect() {}, save() {}, restore() {}, translate() {},
    moveTo() {}, lineTo() {}, stroke() {}, arc() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: ''
  }
}

// Loads index.html into a fresh jsdom window and runs its inline script,
// giving tests direct access to the app's real functions (sortGenerator,
// bfsPath, nqGenerator, ...) exactly as a browser would expose them, plus
// a __test hook for reading otherwise-private top-level state.
function loadApp() {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/'
  })
  const { window } = dom
  window.HTMLCanvasElement.prototype.getContext = () => makeFakeCtx()
  window.eval(appScript + '\n' + TEST_HOOKS)
  // The app's async runX()/bfsPath()/etc. await sleep(ms) between visual
  // steps for animation timing. sleep is a plain function declaration
  // (attached to window), so overriding it here removes those real delays
  // for every caller without touching index.html or algorithm correctness.
  window.sleep = () => Promise.resolve()
  return window
}

// Drives any generator (the app's own step-generator functions) to
// completion, exactly as runX() does internally with its sleep() loop
// stripped out -- tests don't need real delays.
function drainGenerator(gen) {
  let r
  do { r = gen.next() } while (!r.done)
  return r
}

module.exports = { loadApp, drainGenerator }
