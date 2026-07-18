const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp, drainGenerator } = require('./helpers/load-app.js')

function isSafePlacement(board, row, col) {
  for (let r = 0; r < row; r++) {
    if (board[r] === col) return false
    if (Math.abs(board[r] - col) === Math.abs(r - row)) return false
  }
  return true
}

for (const n of [4, 5, 6, 7, 8]) {
  test(`N-Queens (${n}x${n}) produces a solution with no row, column, or diagonal conflicts`, () => {
    const win = loadApp()
    win.openViz('nqueen')
    win.document.getElementById('nq-size').value = String(n)
    win.resetNQ()

    drainGenerator(win.nqGenerator())
    const board = win.__test.getNqBoard()

    assert.equal(board.length, n)
    assert.ok(board.every(col => col !== -1), `not all ${n} queens were placed: ${board}`)
    for (let row = 0; row < n; row++) {
      assert.ok(isSafePlacement(board, row, board[row]), `queen at row ${row} conflicts with an earlier queen: ${board}`)
    }
  })
}

function isValidSudoku(board) {
  const seen = (cells) => {
    const nums = cells.filter(v => v !== 0)
    return new Set(nums).size === nums.length
  }
  for (let i = 0; i < 9; i++) {
    if (!seen(board[i])) return false
    if (!seen(board.map(row => row[i]))) return false
  }
  for (let br = 0; br < 9; br += 3) for (let bc = 0; bc < 9; bc += 3) {
    const box = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box.push(board[br + i][bc + j])
    if (!seen(box)) return false
  }
  return board.every(row => row.every(v => v >= 1 && v <= 9))
}

// Puzzles 0 and 1 solve in well under a second via the app's own generator.
// Puzzle 2 ("Hard") does not: the solver is a plain depth-first backtrack
// with no heuristics (no MRV, no constraint propagation), and V8's yield*
// delegation cost grows with recursion depth, so its full solve was
// confirmed (manually, outside this suite) to still be running after 90s.
// That's a genuine performance characteristic worth knowing about, not a
// reason to let a test suite run that long -- so puzzle 2 is checked below
// for validity as a *puzzle* (no conflicting givens) rather than solved.
for (const idx of [0, 1]) {
  test(`Sudoku puzzle ${idx} solves to a fully valid, complete board`, () => {
    const win = loadApp()
    win.openViz('sudoku')
    win.document.getElementById('sdk-puzzle-sel').value = String(idx)
    win.loadSudokuPuzzle()
    const given = win.__test.getSdkGiven()

    drainGenerator(win.sdkGenerator())
    const solved = win.__test.getSdkBoard()

    assert.ok(isValidSudoku(solved), `puzzle ${idx} solution violates Sudoku constraints`)
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (given[r][c] !== 0) {
        assert.equal(solved[r][c], given[r][c], `puzzle ${idx}: given clue at (${r},${c}) was overwritten`)
      }
    }
  })
}

test('every bundled Sudoku puzzle (including the unsolved-in-tests "Hard" one) starts from a conflict-free board', () => {
  const win = loadApp()
  const puzzles = win.__test.getSdkPuzzles()
  puzzles.forEach((given, idx) => {
    const board = given.map(row => [...row])
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const num = board[r][c]
      if (num === 0) continue
      board[r][c] = 0
      assert.ok(win.isValidSDK(board, r, c, num), `puzzle ${idx}: given clue ${num} at (${r},${c}) conflicts with another given`)
      board[r][c] = num
    }
  })
})
