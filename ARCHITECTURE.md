# Architecture

AlgoRythm is ~1,900 lines of HTML/CSS/JS in one file. There is no framework and no build step (see [Why Single-File?](README.md#why-single-file) for the reasoning behind that). This document explains how the code is organized so a reviewer - or a future contributor - doesn't have to reverse-engineer it from scratch.

## The core pattern: one generator drives both Run and Step

Every visualization (sorting, binary search, pathfinding, Hanoi, N-Queens, Sudoku) is built around a single idea: **the entire algorithm is written once, as a JavaScript generator function, and that one function powers both the auto-play "Run" button and the manual "Step" button.**

```js
function* bubbleSortGen(){
  const n = sortArr.length
  for(let i=0;i<n;i++){
    for(let j=0;j<n-i-1;j++){
      sortColors[j]='compare'; sortColors[j+1]='compare'; sortComps++
      setExplain('sort-explain', `Comparing ${sortArr[j]} and ${sortArr[j+1]}...`)
      drawSort(); yield                     // <- one "step" for a human to watch
      if(sortArr[j] > sortArr[j+1]){
        [sortArr[j],sortArr[j+1]] = [sortArr[j+1],sortArr[j]]
        drawSort(); yield                   // <- another step
      }
    }
  }
}
```

Each `yield` is a single unit of "what a human would call one step" - one comparison, one swap, one cell visited. Everything downstream (the pseudocode highlight, the plain-English explanation, the stat counters, the redraw) happens right before that `yield`, so the generator *is* the full narration of the algorithm, not just its logic.

That one generator is then driven two different ways:

```js
// Manual: advance exactly one yield per click
function stepSort(){
  if(!sortStepGen) sortStepGen = sortGenerator()
  const r = sortStepGen.next()
  if(r.done) sortStepGen = null
}

// Automatic: advance on a timer until done
async function runSort(){
  sortStepGen = sortGenerator()
  let r
  do{ r = sortStepGen.next(); await sleep(getSortDelay()) } while(!r.done && sortRunning)
}
```

The benefit: there is exactly one implementation of "how Bubble Sort behaves," so Run mode and Step mode can never drift out of sync with each other, and the pseudocode/explanation text is never duplicated between a "fast path" and a "slow path."

This same `init -> reset -> render/draw -> step<Algo>/run<Algo>` shape repeats for every visualization in the app:

| Visualization | Generator(s) | Notes |
|---|---|---|
| Sorting | `bubbleSortGen`, `selectionSortGen`, `insertionSortGen`, `mergeSortGen`/`mergeGen`, `quickSortGen`/`qPartGen` | Merge and Quick Sort recurse by delegating with `yield*` into helper generators |
| Binary Search | `bsGenerator` | |
| Pathfinder | `bfsPath`, `dfsPath`, `dijkstraPath` (Run mode) + a parallel step-mode path in `stepPath` | See below for why this one deviates |
| Towers of Hanoi | precomputed move list (`hanoiMoves`), stepped by index rather than a generator | Recursion here generates the *plan* up front; playback is just an index into it |
| N-Queens | `nqGen`-style backtracking generator | |
| Sudoku | backtracking generator over the grid | |

## Pathfinder: three algorithms, one grid, one set of visuals

BFS, DFS, and Dijkstra all operate on the same `pathGrid` (walls/start/end) and `pathWeights` (a random 1-9 cost per cell, generated once per grid reset). The visual language - visited/path/wall colors - is shared so switching algorithms doesn't change how the grid looks, except:

- BFS/DFS use `visited` as a boolean set and a queue (`shift()`) or stack (`pop()`) to choose the next node.
- Dijkstra needs cost-based ordering, not arrival-based ordering, so it keeps a small priority list (`[cost, row, col]` tuples) and does a linear-scan `popMinDijkstra` instead of `shift()`/`pop()`. At this grid size (17x28) a linear scan is simpler and fast enough; a binary heap would be the next step if the grid grew significantly.
- The weight numbers and cost-shaded coloring (`weightColor()`, an HSL lightness ramp) only render when Dijkstra is selected - `pathWeights` is always generated, but BFS/DFS ignore it entirely, so adding Dijkstra didn't change how BFS/DFS look or behave.

The grid is also the app's one non-trivial accessibility surface: it's a 17x28 array of `div`s driven entirely by mouse events (`mousedown`/`mouseenter` for click-and-drag wall drawing). Rather than giving all 476 cells individual tab stops and accessible names, the container itself is the single interactive element (`tabindex="0" role="application"`), holding a `pathCursor` position moved by arrow keys (`movePathCursor`). Enter/Space calls the exact same `handleCell(r, c)` a mouse click would. A visually-hidden `aria-live` region (`announcePathCursor`) reports the cursor's row, column, and cell state on every move, so a screen reader user gets the same information a sighted user gets from watching the yellow focus ring - one coherent interface instead of 476 individually-exposed cells.

## Compare Mode: isolated by design, not shared

Compare Mode (two sorting algorithms racing on an identical array) does **not** reuse the single-mode generators (`bubbleSortGen`, etc.). It has its own parallel set (`cmpBubbleGen`, `cmpSelectionGen`, ...) that take a plain `state` object (`{arr, colors, comps, swaps, algo, suffix}`) instead of reading module-level globals like `sortArr`/`sortColors`.

This was a deliberate trade-off: reusing the single-mode generators would have meant threading extra parameters through every algorithm function to support two independent, concurrently-running instances, at real risk of subtly changing single-mode behavior. Duplicating a simplified version (no pseudocode/explanation side effects, since Compare Mode doesn't show those panels) kept single-mode provably untouched while still sharing the same core generator-driven-by-a-timer idea:

```js
async function runCompareSort(){
  const genA = compareGen(cmpA), genB = compareGen(cmpB)
  let doneA=false, doneB=false, stepsA=0, stepsB=0
  do{
    if(!doneA){ const r=genA.next(); stepsA++; doneA=r.done }
    if(!doneB){ const r=genB.next(); stepsB++; doneB=r.done }
    await sleep(getSortDelay())
  } while((!doneA||!doneB) && compareRunning)
  if(doneA && doneB) showCompareSummary(stepsA, stepsB)
}
```

Both generators are advanced once per tick, so they run in lockstep, and the number of ticks each one needed to finish (`stepsA`/`stepsB`) becomes the "who finished first, and by how many steps" metric shown in the summary panel.

Benchmark Mode reuses these same compare generators a third way: `benchMeasure(algo, n, pattern)` builds a state object with `silent: true` (which makes `drawCompareState` and `updateCompareStats` no-ops) and drains the generator synchronously with no delays, so the identical algorithm code that animates on screen also produces the measured operation counts plotted in the benchmark chart. One implementation, four consumers: animated single mode is its own generator family, while Compare, Benchmark, and Challenge share the state-object family.

Challenge Mode is the fourth consumer of the same generator family, and it leans on a property the other three get for free: **determinism**. Each compare-family generator optionally pushes a structured entry to `st.log` at every comparison (`{q:'bubble', a, b, ans}` and so on), placed *before* the `yield` that displays the comparison, so at that yield the compared elements are highlighted on screen but the outcome has not happened yet. A silent pre-run on a copy of the array captures the complete log, quiz points are sampled evenly across it, and then the visual run (same array, same deterministic generator, therefore an identical log) pauses exactly at those points: the learner sees the highlighted pair plus the value labels drawn on the bars, predicts the outcome, gets told why they were right or wrong, and then watches the algorithm do it. Every question is generated from the log entry, so the correct answer is computed by the same comparison the algorithm itself is about to make; there is no separate quiz database to drift out of sync.

Two deliberate choices in Benchmark Mode:

- **Operation counts, not wall-clock time.** The generators are instrumented for animation, so timing them would mostly measure generator overhead and JS engine noise rather than algorithmic work, and results would vary per machine. Comparison/swap counts are deterministic and device-independent, which is what makes the plotted curves honest.
- **Input patterns as a teaching axis.** `benchArray(n, pattern)` produces random, nearly sorted, reversed, or few-unique-values input, because the *same* algorithms rank completely differently across them (Insertion approaches O(n) on nearly sorted data; last-element-pivot Quick Sort slides toward O(n²) on ordered input). The explanation under the chart is assembled in `benchDoneNote()` from the measured numbers, with conditional observations that only appear when the data actually shows them, the same lookup-table approach Compare Mode uses.

The summary's plain-English explanation is not hardcoded per algorithm pair - it is generated from two small lookup tables (`SORT_TIER`, classifying each algorithm as `quadratic` or `linearithmic`, and `SORT_MECHANISM`, a one-sentence description of how each algorithm works) and a small decision tree in `explainCompareResult()` that picks the right framing (e.g. "the winner's growth rate beats the loser's" vs. "both share the same growth rate, so the gap came from array-specific behavior"). This is what lets any of the 5x5 algorithm combinations produce a coherent, specific explanation without a hardcoded sentence for every pair.

## Data-driven metadata, not hardcoded HTML

Pseudocode and complexity panels are not written as static HTML per algorithm. Each visualization keeps a small config object (e.g. `SORT_INFO`, `PATH_INFO`) mapping an algorithm key to its pseudocode lines, time/space complexity, and a relative complexity-bar percentage:

```js
const SORT_INFO = {
  bubble: { pseudo: ['for i in 0..n:', '  for j in 0..n-i-1:', ...], tavg:'O(n²)', tbest:'O(n)', space:'O(1)', complexity:62 },
  quick:  { pseudo: [...], tavg:'O(n log n)', ... }
}
```

Switching algorithms re-renders the pseudocode block by mapping over `info.pseudo` into `<div class="pline" id="...">` elements, which is also what makes line-highlighting during execution possible (`setPseudo('sortp', activeLineIndex)` just toggles a class on the matching `id`).

## Post-run quizzes: deciding when a run is really finished

When an algorithm finishes, a multiple-choice card appears below its visualizer. The content is plain data (`QUIZ_BANK`, keyed by algorithm, each item `{q, opts, a, why}`) and one shared pair of functions (`quizShow`/`quizReset`) builds and clears the card for any of the six visualizers, with option order shuffled per display and the previous question skipped on the next run.

The interesting part is the trigger. "The run loop exited" is not the same as "the algorithm finished": a Randomize, algorithm change, or grid reset mid-run also exits the loop, and quizzing someone about a run they abandoned would be wrong. Each visualizer already had a different way of knowing it was interrupted, so the hook reuses it instead of adding a new flag:

- **Sorting and binary search** capture their generator when the run starts and only count the run as finished if `r.done && currentGenerator === capturedGenerator`; every reset path sets the shared generator variable to `null`.
- **Pathfinder, N-Queens, Sudoku, Hanoi** check the existing `*Running` flag after the loop, which every reset and `goHub()` already clears.
- **Step mode** is the generator's own `done` result (or, for Hanoi, the last move in the precomputed list), so it needs no extra bookkeeping.

`quizShow` is idempotent per run (it is a no-op while a quiz for the current run exists), which makes it safe to call from every exit, including the three separate "no path found" branches in the pathfinder's step mode. Resets go through `quizReset` at every place a run can begin or be invalidated.

## Shareable links and progress

**URL state.** A share link is `base#/<visualizer>?key=value&...`. `captureScenario(viz)` reads the current controls into a flat object and `applyScenario(viz, params)` does the reverse, so a link is a plain serialization of UI state rather than a second source of truth. Two things needed groundwork to be reproducible: the sorting array is snapshotted before a run (`sortBaseArr`, because the live array is mutated while sorting), and Pathfinder weights are generated from a seed (`weightsFromSeed`, a small mulberry32 PRNG) so one short token reproduces 476 cell weights. Walls travel as a hex bitmask with trailing zeros trimmed. Links are untrusted input, so every parameter is checked against a whitelist or numeric range, invalid ones are dropped and named in a note, and values only ever reach the DOM through `value` or `textContent`. From a `file:` page the base falls back to the hosted URL, since a local path means nothing to the recipient.

**Progress.** `recordQuizResult` is called from `quizAnswer` and writes a small object to `localStorage` (`algorythm-progress-v1`). On load it is run through `sanitizeProgress`, which only trusts known algorithm keys and in-range question indexes, so corrupt or hand-edited storage cannot break the page. Mastery is derived, never stored: `masteryOf` computes the level from which distinct questions have been answered correctly. Every storage access is wrapped in try/catch, so a browser with storage blocked simply runs without persistence.

## Rendering

- **Canvas API**: sorting bars and Towers of Hanoi disks, redrawn from scratch on every step (`drawSort()`, `drawHanoi()`). Cheap enough at this scale that there's no need for partial redraws.
- **DOM grids**: the pathfinder grid, N-Queens board, and Sudoku board are `div`-per-cell, with state expressed as CSS classes (`.pcell.wall`, `.pcell.visited`, etc.) rather than inline styles, except where a value needs to be computed per-cell (Dijkstra's weight-based cell shading).

## State management

There is no state container or framework. Each visualization owns a handful of module-level `let` variables (e.g. `sortArr`, `sortColors`, `pathGrid`, `hanoiPegs`) that act as that section's local state, mutated directly by its generator and read directly by its render function. DOM updates are imperative (`document.getElementById(...).textContent = ...`) rather than diffed. This is a deliberate scope-matched choice: with six independent, mutually-exclusive visualizations (only one is ever visible at a time) and no shared state between them, a state-management library would add indirection without solving a problem that exists at this scale.

## Testing strategy

The single-file constraint raises an obvious question: how do you unit-test code that lives inside one inline `<script>` with no exports? The answer (in `tests/helpers/load-app.js`) is to load the real `index.html` into jsdom and `eval` its actual script, so tests exercise the exact code that ships - not a copied-out version that could drift.

Two details make this work:

- **Private state access.** The app's top-level `let` bindings (`sortArr`, `pathGrid`, `nqBoard`, ...) are not `window` properties, and eval scopes don't persist between calls. So a small `__test` hook object is appended to the *same* eval invocation as the app script; its arrow functions close over the live bindings, giving tests read (and where needed, write) access without changing a line of `index.html`.
- **Reference implementations, not self-agreement.** The pathfinding tests don't just check that the app "found a path" - they re-derive the expected result with independent BFS/Dijkstra implementations written inside the test files, then assert the app's reported path length and cost match. Sorting, N-Queens, and Sudoku results are checked against their mathematical definitions (sortedness, conflict-freedom, constraint validity).

The suite runs on every push via GitHub Actions. All of this tooling is dev-only: `index.html` still runs with zero dependencies.

## Adding a new algorithm

The pattern in this file is consistent enough that adding a 6th sorting algorithm, for example, means:

1. Add an entry to `SORT_INFO` with its pseudocode lines and complexity.
2. Write a `function* yourAlgoGen(){ ... }` that mutates `sortArr`/`sortColors`, calls `setPseudo`/`setExplain`/`drawSort()`, and `yield`s once per visual step.
3. Add one `else if` branch to `sortGenerator()` dispatching to it.
4. Add an `<option>` to the `#sort-algo` (and `#sort-algo-a`/`#sort-algo-b`) selects.
5. Add an entry to `QUIZ_BANK` and `QUIZ_TITLES` so the post-run quiz has questions for it. A test fails if any algorithm in the selects has no questions.

No changes are needed to `runSort`, `stepSort`, or the Compare Mode engine - they all operate on whatever generator `sortGenerator()`/`compareGen()` hands them.
