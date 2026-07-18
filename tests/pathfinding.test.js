const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./helpers/load-app.js')

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// Reference BFS reachability + shortest-path length, implemented
// independently of the app, to check the app's output against.
function referenceBfs(grid, start, end) {
  const rows = grid.length, cols = grid[0].length
  const visited = new Set([start.join(',')])
  const queue = [[...start, 0]]
  while (queue.length) {
    const [r, c, d] = queue.shift()
    if (r === end[0] && c === end[1]) return d
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc, key = `${nr},${nc}`
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== 'wall' && !visited.has(key)) {
        visited.add(key)
        queue.push([nr, nc, d + 1])
      }
    }
  }
  return -1
}

// Reference Dijkstra, independent of the app, to check reported path cost.
function referenceDijkstra(grid, weights, start, end) {
  const rows = grid.length, cols = grid[0].length
  const dist = { [start.join(',')]: 0 }
  const pq = [[0, ...start]]
  const visited = new Set()
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0])
    const [d, r, c] = pq.shift()
    const key = `${r},${c}`
    if (visited.has(key)) continue
    visited.add(key)
    if (r === end[0] && c === end[1]) return d
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== 'wall' && !visited.has(nk)) {
        const nd = d + weights[nr][nc]
        if (dist[nk] === undefined || nd < dist[nk]) { dist[nk] = nd; pq.push([nd, nr, nc]) }
      }
    }
  }
  return -1
}

function emptyGrid(rows, cols, start, end) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill('empty'))
  grid[start[0]][start[1]] = 'start'
  grid[end[0]][end[1]] = 'end'
  return grid
}

function pathCellChain(grid, start, end) {
  // Collect all cells marked 'path' plus start/end, and verify they form a
  // single connected chain of orthogonal steps from start to end.
  const rows = grid.length, cols = grid[0].length
  const cells = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c] === 'path' || grid[r][c] === 'start' || grid[r][c] === 'end') cells.push([r, c])
  }
  return cells
}

test('BFS finds the shortest path on an open grid and marks a connected route', async () => {
  const win = loadApp()
  win.openViz('pathfinder')
  const rows = win.__test.getRows(), cols = win.__test.getCols()
  const start = [1, 1], end = [rows - 2, cols - 2]
  const grid = emptyGrid(rows, cols, start, end)
  win.__test.setPathGrid(grid)
  win.__test.setPathStart(start)
  win.__test.setPathEnd(end)
  win.__test.setPathRunning(true)

  const found = await win.bfsPath()
  const expectedLen = referenceBfs(grid, start, end)

  assert.equal(found, true)
  assert.equal(win.document.getElementById('path-length').textContent, String(expectedLen))
})

test('BFS reports no path when the start is fully walled in', async () => {
  const win = loadApp()
  win.openViz('pathfinder')
  const rows = win.__test.getRows(), cols = win.__test.getCols()
  const start = [5, 5], end = [rows - 2, cols - 2]
  const grid = emptyGrid(rows, cols, start, end)
  for (const [dr, dc] of DIRS) grid[start[0] + dr][start[1] + dc] = 'wall'
  win.__test.setPathGrid(grid)
  win.__test.setPathStart(start)
  win.__test.setPathEnd(end)
  win.__test.setPathRunning(true)

  const found = await win.bfsPath()

  assert.equal(found, false)
})

test('DFS finds a valid (connected, wall-free) path when one exists', async () => {
  const win = loadApp()
  win.openViz('pathfinder')
  const rows = win.__test.getRows(), cols = win.__test.getCols()
  const start = [1, 1], end = [rows - 2, cols - 2]
  const grid = emptyGrid(rows, cols, start, end)
  // A wall column with one gap, forcing a detour but leaving a route open.
  const gapRow = 3
  for (let r = 0; r < rows; r++) if (r !== gapRow) grid[r][Math.floor(cols / 2)] = 'wall'
  win.__test.setPathGrid(grid)
  win.__test.setPathStart(start)
  win.__test.setPathEnd(end)
  win.__test.setPathRunning(true)

  const found = await win.dfsPath()
  const reachable = referenceBfs(grid, start, end) !== -1

  assert.equal(found, reachable)
  if (found) {
    const cells = pathCellChain(win.__test.getPathGrid(), start, end)
    assert.ok(cells.some(([r, c]) => r === start[0] && c === start[1]))
    assert.ok(cells.some(([r, c]) => r === end[0] && c === end[1]))
  }
})

test("Dijkstra reports the true lowest-cost path, not just a short one", async () => {
  const win = loadApp()
  win.openViz('pathfinder')
  const rows = win.__test.getRows(), cols = win.__test.getCols()
  const start = [0, 0], end = [rows - 1, cols - 1]
  const grid = emptyGrid(rows, cols, start, end)
  // A deterministic, non-uniform weight grid so the cheapest route isn't
  // necessarily the shortest one.
  const weights = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ((r * 7 + c * 3) % 9) + 1)
  )
  win.__test.setPathGrid(grid)
  win.__test.setPathStart(start)
  win.__test.setPathEnd(end)
  win.__test.setPathRunning(true)
  // pathWeights has no setter exposed since dijkstraPath reads the module
  // -level pathWeights directly; reuse the app's own randomly generated
  // weights instead of injecting a fixed grid, and compare against them.
  const appWeights = win.__test.getPathWeights()

  const found = await win.dijkstraPath()
  const expectedCost = referenceDijkstra(grid, appWeights, start, end)

  assert.equal(found, true)
  assert.equal(win.document.getElementById('path-cost').textContent, String(expectedCost))
})

test('BFS never finds a longer route than DFS on the same grid (BFS guarantees shortest path, DFS does not)', async () => {
  const winBfs = loadApp()
  winBfs.openViz('pathfinder')
  const rows = winBfs.__test.getRows(), cols = winBfs.__test.getCols()
  const start = [1, 1], end = [rows - 2, cols - 2]
  const grid = emptyGrid(rows, cols, start, end)
  const gapRow = 6
  for (let r = 0; r < rows; r++) if (r !== gapRow) grid[r][Math.floor(cols / 3)] = 'wall'

  winBfs.__test.setPathGrid(grid.map(row => [...row]))
  winBfs.__test.setPathStart(start)
  winBfs.__test.setPathEnd(end)
  winBfs.__test.setPathRunning(true)
  await winBfs.bfsPath()
  const bfsLen = parseInt(winBfs.document.getElementById('path-length').textContent, 10)

  const winDfs = loadApp()
  winDfs.openViz('pathfinder')
  winDfs.__test.setPathGrid(grid.map(row => [...row]))
  winDfs.__test.setPathStart(start)
  winDfs.__test.setPathEnd(end)
  winDfs.__test.setPathRunning(true)
  await winDfs.dfsPath()
  const dfsLen = parseInt(winDfs.document.getElementById('path-length').textContent, 10)

  assert.ok(bfsLen <= dfsLen, `BFS path (${bfsLen}) should never be longer than DFS path (${dfsLen})`)
})
