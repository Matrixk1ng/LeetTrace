# LeetTrace implementation progress

> Working log for implementation sessions. Every chat session working on the
> milestones MUST update this file before ending: check off finished items,
> fill in "Current state", and note anything the next session needs to know.
> Keep entries short and factual. Newest session notes at the top of §3.

## 1. Milestone status

- [x] **M1 — Hardening** (worker + interrupts B1, input builders B2, injection fallback B7, B9, B10, B12 types v2, B15, pytest scaffolding)
- [x] **M2 — Serialization + routing** (B4 dict/list families + deque/set/heap tags, B13, schema v2 fields, B8 per-frame changed)
- [x] **M3 — Pointer correctness** (B3 AST index mapping, stable colors, matrix + node pointers)
- [x] **M4 — Visualizers wave 1** (MatrixViz, StackViz, QueueViz, SetViz, string-as-array, B17)
- [x] **M5 — Visualizers wave 2** (LinkedListViz, TreeViz, CallStackViz)
- [x] **M6 — Patterns v2** (AST-based detector)
- [x] **M7 — Editor mirroring** (B5, B6, B16)
- [x] **M8 — Polish** (scrubber, B14, collapsible cards, windowing, notices, HeapViz, B18 README; GraphViz stretch)

## 2. Current state

- **Next task:** Live Chrome / LeetCode integration checks listed below. M6–M8
  implementation is complete locally; GraphViz remains an optional stretch.
- **Active branch:** `feature/trace-experience`, based on `main` at `e88f542`.
  Changes are local and uncommitted; no PR opened and nothing merged this session.
- **Reconciled:** M4 (#18), M5 (#19), and non-finite float handling (#20) are
  already merged into main. The previous branch/open-PR handoff was stale.
- **Blocked on:** no implementation blocker. Live LeetCode integration remains unverified.

### Verification gates

| Command | Result |
|---|---|
| `npm run lint` | 0 errors |
| `npm run build` | ok |
| `npm test` (vitest) | 116 passed |
| `npm run test:tracer` (pytest) | 119 passed |
| `npm run smoke:pyodide` | all pass |
| `npm run gallery` | writes `tests/dev/gallery.html` |

## 3. Session notes

### 2026-09-07 — Tally feedback and monetization planning

- Replaced the GitHub feedback chooser with a direct link to the owner's
  Tally form, https://tally.so/r/2EWO8D. The pinned footer remains available;
  no code, testcase values, or version metadata are appended.
- Verified the published URL returns HTTP 200 without submitting a response.
  Owner still needs to enable Tally self email notifications and test delivery.
- Added MONETIZATION.md: free-core commitments, proposed cloud-study/step-explanation
  bundle, $4/month and $30/year pricing hypotheses, client/server boundaries,
  cost checks, fair cancellation/upgrade behavior, and a staged tracking checklist.
  No payment/account functionality or paywalls were added.
- Updated README/DESIGN and the existing footer regression test for Tally.
- Verification: lint, all 116 TypeScript tests, production build, and git diff
  whitespace checks passed. Python code was unchanged in this update.
- Next: owner feedback email check; continue live LeetCode checks. Validate paid
  feature demand and costs before implementing the proposed paid tier.


### 2026-09-07 — Selected/custom testcases and feedback

- Read visible named testcase fields, including textareas, inputs, contenteditable/
  CodeMirror lines, and display boxes. Selected tab detection uses ARIA/data state
  and LeetCode's active styling. No description-example fallback: unreadable cases
  show an actionable error. Preserve input whitespace and linked-list `pos`.
- Watch case switches, plus-added cases, and custom edits. After the first Trace,
  debounce automatic retracing; queue the latest selection if a run is in flight
  and discard its superseded result. Show the traced case label and exact inputs.
- Prefer Python Monaco models even when a separate testcase editor has focus.
  Invalid literals now produce an error rather than silently executing no call.
- Added pinned feedback footer with user-reviewed bug/feature GitHub forms.
  Verified repository public and Issues enabled; no reports submitted. Forms only
  prefill extension version, not code/input data. README explains Issues and email
  notifications; no extension backend or token required.
- Checks: 116 TS / 119 Python tests, lint/build, Pyodide smoke and gallery.
  DOM fixtures include the supplied head/pos screenshot layout, generic div tabs,
  dynamic custom cases, hidden panes, and focused testcase editors.
- Live check: reload extension and LeetCode; select Case 2, then +/Case 3, change
  head/pos, and confirm automatic retracing and the panel's input disclosure.
  Check feedback opens the appropriate GitHub form without submitting it.
- Changes remain local and uncommitted on `feature/trace-experience`.


### 2026-09-07 — M6–M8 implementation and readable trace experience

- **M6:** Python AST scorer evaluates all 13 pattern families; worker uses the
  result envelope, obsolete regex detector removed. One positive fixture file
  per pattern, plus negative/comment/string/buffer cases and 2-D DP. A fixture
  caught the common `prefix[i+1] = prefix[i] + value` shape; fixed.
- **M7:** document-line matching uses the visible line-number rail, then absolute
  top/line-height fallback. Scroll/resize/virtualization reposition the active
  annotation instead of clearing it. Monaco content/model/disposal notifications
  and editor input mark a trace stale. Panel preserves edits received during a
  running request. Floating-button rejection now shows an actionable toolbar hint.
- **M8:** timeline, keyboard controls, Play-at-end restart, collapsible cards,
  60-item array windows with pointer following and paging, HeapViz, six-level
  tree disclosure, previous-cursor tree highlight, budget/staleness notices,
  printed output, and runtime-error state inspection.
- **Screenshot feedback:** shared readable formatting for panel/editor badges;
  hide `self` and function objects, retain useful `self.field` values. Tree/list
  references summarize their meaning and link to the owning diagram. Current
  function, before-line semantics, and final output get a dedicated card.
  Trees are larger and centered; long values wrap rather than overflow a table.
- **Verification:** lint/build, 105 TS tests, 116 Python tests, real-Pyodide
  smoke checks, and gallery generation. Headless Chrome screenshot inspected
  at 400px panel width, including the user's `root/self/dfs/True` case.
  Generated preview: `tests/dev/gallery.png` (gitignored).
- **Live checks still needed:** BST recursion and bounds; heap/queue/list examples;
  scroll, wrap/fold, resize, editor replacement and SPA navigation; edit during
  tracing; exception inside a helper; extension reload; floating-button fallback.
  Headless gallery rendering does not verify the extension/LeetCode integration.
- **Exact next step:** load `dist/` in Chrome, run that checklist, and record any
  selector/model-binding differences before treating v1 as release-verified.


### 2026-09-07 — M5 complete (visualizers wave 2)

Every structure kind in DESIGN.md §3 now has a real visualizer. Only `graph`
(the M8 stretch goal) still reaches the JSON fallback.

- **LinkedListViz** — the chain with the cursors sitting *on* it. This is the
  payoff for M3's `collapseNodeAliases`: `slow`, `fast` and `curr` each
  serialize as a whole list of their own, and folding them into `nodePointers`
  is what turns three overlapping copies of the same nodes into one chain with
  three labelled positions. A cycle shows an `↩` tail and names the index it
  links back to; an acyclic list ends in `→ None`.
- **TreeViz** — SVG, top-down. x from an in-order walk and y from depth, which
  keeps subtrees from overlapping without a full tree-layout algorithm. The
  **pre-order** counter is tracked separately, because that is the order node
  ids are serialized in and therefore what `nodePointers` index into — mixing
  the two would put every cursor on the wrong node.
- **CallStackViz** — innermost frame on top, indented, pinned above the
  structure cards in `App.tsx` when depth > 1 (DESIGN.md §8). This is what
  makes a recursive trace readable at all; without it a DFS looks like the same
  few lines firing forever with no sense of depth.

**One thing needed building first.** A snapshot carries only its *own* frame,
so the enclosing frames can't be read off it. `processSnapshots` (new, wraps
the existing per-snapshot mapping) replays the call/return event stream in
order to reconstruct the stack, and attaches a copy to each snapshot as
`Snapshot.callStack`. It resyncs rather than assuming — a budget can cut a
trace mid-unwind, so the frame a step belongs to may sit below the recorded
top. Module and class-body frames are excluded; they aren't calls the user
made.

**Checked with `npm run gallery`** — the linked-list cycle indicator, the tree
layout (no overlapping subtrees, cursor on the right node) and the call-stack
ordering were all verified visually there before committing.

**Not verified — needs a human at `chrome://extensions`** (on top of the
M1–M4 lists): trace *Linked List Cycle* and watch `slow`/`fast` converge on one
chain; trace *Invert Binary Tree* or a level-order traversal and watch the tree
redraw per step; trace *Subsets* and watch the call stack grow and shrink.

### 2026-09-07 — M4 complete (visualizers wave 1)

**New visualizers**, all driven by `mockData.ts` fixtures per DESIGN.md §10:

- **MatrixViz** — grid with row cursors down the left rail and column cursors
  across the top, reading the `cell` convention from M3 (`-1` marks the axis a
  cursor doesn't move along). The crossing cell gets the `current` highlight.
  Ragged rows keep their column alignment instead of collapsing left.
- **StackViz** — top-first, since that's how people draw a stack; Python
  appends to the end of the list so the render order is reversed. Push and pop
  are called out by diffing against the previous step.
- **QueueViz** — front-to-back with both ends labelled, and whichever end moved
  called out. `popleft` is detected by the front *value* changing, not just the
  length, so an append and a popleft in the same step don't read as nothing.
- **SetViz** — chip cloud. Removed members stay on screen for one step, struck
  through, so a `discard` doesn't silently vanish; a set has no order to walk,
  so membership changing is the only thing worth animating.
- **Strings as character arrays** — routed in `buildDataStructure`, but **only
  when the code actually indexes the string** (the M3 indexing map is the
  gate). Otherwise every message and label in a solution becomes a card.
  Rendered as bare characters, not `"r"` — quoting spends a third of each cell
  on punctuation.

**B17 — two separate bugs, both fixed:**

1. HashMapViz only highlighted *new keys*. The counting problems this view
   exists for keep their keys and move their values, so nothing lit up at all
   after the first pass. Entries are now `added` (green) / `changed` (amber) /
   untouched.
2. The diff was always against `currentStep - 1`, so stepping **backwards**
   re-reported the step ahead as brand new. `TraceState` now tracks
   `previousStep` — the step actually navigated away from — and `useTrace`
   exposes `previousSnapshot`. VizRouter diffs against that.

**Gallery.** DESIGN.md §10 asked for a fixture-driven dev route; it's real now:
`npm run gallery` renders every visualizer against the fixtures and writes
`tests/dev/gallery.html` (gitignored), inlining the panel's compiled CSS so it
looks like the real thing. It runs under a standalone vitest config so it stays
out of the normal test run. This is how the four new components were actually
checked — worth using in M5, since the alternative is loading the extension for
every tweak.

**Lint config:** `react-refresh` is now scoped to `src/**`. It's a rule about
Vite's HMR boundary, which doesn't exist for tests and generators.

**Not verified — needs a human at `chrome://extensions`** (on top of the M1–M3
lists): trace a BFS problem and watch the queue's front/back callouts and the
set's add/remove diff during playback; trace a counting problem (`Counter`) and
confirm changed values light up amber; step **backwards** and confirm the
highlight follows the direction you moved.

### 2026-09-04 — M3 complete (pointer correctness)

**B3 — the static indexing pass.** `_analyze_indexing` in `tracer.py` builds
`{array: {row: [names], col: [names]}}` from the AST. Signals: a bare-name
subscript (`nums[i]`), a 2-D subscript (`grid[i][j]` — outer is the row axis,
inner the column axis), a bound comparison (`while i < len(nums)`) and
`for i in range(len(nums))`. Two refinements that mattered:

- **Annotations are skipped.** `List[int]` is an `ast.Subscript` exactly like
  `nums[i]`, so the first version cheerfully recorded `int` as an index of
  `List`. `_walk_code` skips `arg.annotation`, `FunctionDef.returns` and
  `AnnAssign.annotation`.
- **Compound slices don't invent indices.** `nums[r - k]` is evidence about the
  expression, not about `k`; only bare-name slices are a strong signal, and
  compound ones can then reinforce names already known for that array. Without
  this, `nums[stack[-1]]` made `stack` an index of `nums`.

The conventional-name allowlist only ever *extends* an association static
analysis already found (through a comparison or an assignment, to a fixpoint) —
it never invents one. That's what lets binary search work: only `mid` ever
subscripts `nums`, and `mid = (lo + hi) // 2` carries the association to `lo`
and `hi`, while `while i < target` still can't turn `target` into an arrow.

**Stable colours.** `createColorAssigner` hands each *name* one colour for the
whole trace, seeded from the static map so the assignment depends on the code
rather than on which step first mentioned a name. The old code advanced a
counter on every attach, so a variable changed colour between steps and between
arrays.

**Matrix pointers.** Row and column cursors are separate pointers carrying
`cell`, where `-1` on the other axis says which axis this one moves along. A
`current` highlight marks the flattened crossing cell. Convention documented on
`Pointer` in `shared/types.ts`.

**Node pointers.** `_serialize` now emits `nodeIds` for linked lists and an `id`
per tree node (stringified — `id()` is a machine address and can exceed 2**53,
which JSON numbers can't carry into JS losslessly). `collapseNodeAliases` uses
that identity to fold variables that alias a node of a bigger structure into
`nodePointers` on it. Before, `slow`/`fast`/`curr` each serialized as a whole
list of their own, so a cycle-detection trace rendered three overlapping chains
instead of one list with three cursors. Genuinely separate chains (`prev` in
reverseList, built from already-detached nodes) still get their own card.
Linked lists also gained `cycleIndex`, which LinkedListViz needs in M5.

**Known minor false positive:** in `for r in range(len(nums)): ... if r >= k:`,
the comparison carries `k` onto `nums` because `k` is on the design doc's
allowlist. Harmless (it renders an extra cursor) and strictly better than the
old behaviour; removing `k`/`l` from the list would fix it but deviates from
DESIGN.md §2 B3, so it was left as specified.

**Not verified — needs a human at `chrome://extensions`** (on top of the M1/M2
lists): trace two-sum and confirm `target` is **no longer** an arrow on `nums`;
trace binary search and confirm `lo`/`hi`/`mid` all show with stable colours
that don't change between steps.

### 2026-09-04 — M2 complete (serialization families, routing, per-frame changed)

**Finished — every M2 item:**

- **B4 tags** — `_serialize` now emits `{__type: 'deque', items}` and
  `{__type: 'set', items, frozen}`. `deque` is not a list subclass and has no
  `val`/`next`, so it used to fall through to `repr()` and render as a garbage
  string — every BFS problem looked broken.
- **B4 families** — `buildDataStructure` matches on *families* instead of exact
  type names: `DICT_LIKE_TYPES` (dict/defaultdict/Counter/OrderedDict/…) and
  `LIST_LIKE_TYPES` (list/tuple). Counting and grouping problems used to hit
  the raw JSON fallback because their Python type name isn't `dict`.
- **Heap and stack** — both are just `list` at runtime, so a new
  `_analyze_usage` AST pass infers them from usage: heap = first argument to a
  `heapq.*` call (handles `import heapq` and `from heapq import …`), stack =
  a name that gets both `.append(x)` and a no-argument `.pop()` (`.pop(0)` is
  queue-like and doesn't count; heaps win the tie). Surfaced as an optional
  `kind` on `VariableState`, applied only while the name still holds a list.
- **B13 matrix** — `isMatrix` checks every row, not just row 0. `[[]]` is no
  longer a zero-column matrix and `[[1,2],[3,[4]]]` no longer passes. Ragged
  row lengths are still allowed — a triangular DP table is still a grid.
- **B8 per-frame `changed`** — `_prev_locals` is keyed by `frameId` and dropped
  on `return`. With one global dict, recursion and helper calls flipped each
  other's flags: returning into a parent made its untouched locals look changed
  because the comparison was against the child's values.
- **Schema v2 fields** — `event`/`frameId`/`frameName`/`callDepth`/`stdout`
  landed in M1; nothing left here.

**Testing:** added vitest (`npm test`) per DESIGN.md §10 — M2 is almost entirely
routing logic, so shipping it with no TS coverage wasn't defensible. 24 cases
over `buildDataStructure`, `isMatrix` and `processSnapshot`, in
`tests/unit/`. Tracer side covered by `tests/tracer/test_serialization.py`, and
the Pyodide smoke test now asserts the deque/set/heap tags too (`collections`
comes from Pyodide's bundled stdlib, so the `isinstance` check is a real
browser-only risk).

**Note on `npm audit`:** 11 vulnerabilities are reported, all pre-existing
transitives of the vite/rollup/crxjs dev chain. Installing vitest did not add
them and `npm audit fix` would move the build toolchain — left alone
deliberately.

**Not verified — needs a human at `chrome://extensions`** (in addition to the
M1 list, which still stands): trace a BFS problem (deque + set), a top-K heap
problem, and a monotonic-stack problem. Each should now show a labelled card
rather than a JSON dump or a `deque([...])` string. Their dedicated
visualizers are M4/M5 — until then VizRouter deliberately renders every
sequence-shaped kind with ArrayViz, so nothing that rendered before regresses.

### 2026-09-04 — M1 complete (worker, budgets, input builders, contract)

**Reconciled first:** branches `iss4`, `issue-3`, `testing` are all fully merged
into `main` (`git log main..<branch>` empty). PROGRESS.md was accurate; nothing
to recover.

**Finished — every M1 item:**

- **Tracer extracted to a real module** — `src/offscreen/tracer.py` replaces the
  template string that lived in `pyodide-runner.ts`. It has no Pyodide
  dependency, so pytest runs it under CPython; the worker inlines it with
  `import tracer from './tracer.py?raw'` (verified present in the built bundle).
- **B1 (hang)** — Pyodide now runs in a dedicated module worker
  (`pyodide-worker.ts`) owned by `pyodide-host.ts`. Executions are queued;
  `MAX_EXECUTION_TIME` triggers interrupt-then-terminate; the document survives.
  Plus the §5.3 event budget inside the tracer, which is what actually catches
  a runaway loop in practice (see the deviation note in §4).
- **B2 (object inputs)** — annotations are read off the AST and
  `Optional[ListNode]` / `Optional[TreeNode]` / `List[...]` args are built from
  the example literals. `pos` links a cycle instead of being forwarded as a
  kwarg. Return values convert back to list / level-order.
- **B7** — `scripting` permission + `chrome.scripting` re-injection with one
  retry in the SW's EXTRACT_CODE relay. Script paths come from
  `getManifest().content_scripts`, since the build renames `index.ts`.
- **B9** — error lines clamped to the user's last line, deepest user frame preferred.
- **B10** — superseded by the worker; all timers cleared on settle.
- **B12** — `shared/types.ts` carries snapshot schema v2, `TraceResult`,
  `ExtractCodeResponse` and the worker protocol; all four contexts import it.
- **B15** — the offscreen document warms Pyodide on load; the racy `WARMUP`
  message is gone.
- **Tests** — `tests/tracer/` (56 cases) + `scripts/smoke-tracer.mjs`.

**Two bugs found while building, both browser-only (CPython tests can't see them):**

1. Pyodide's `runPython()` compiles with the filename `<exec>` — the exact
   sentinel the tracer used to recognise user frames. In the browser the
   tracer's own frames would have been read as user code, breaking the
   error-line walk and the next-example retry. `USER_FILENAME` is now
   `<leettrace-user-code>`, and `tests/tracer/test_pyodide_parity.py` loads the
   tracer the way Pyodide does so this can't regress.
2. Class-body frames emitted junk steps (`twoSum = <function ...>`) before the
   algorithm started. Detected via `CO_OPTIMIZED` (`__qualname__` isn't in
   `f_locals` yet when the body's first events fire) and suppressed.

**Not verified — needs a human at `chrome://extensions`.** Load `dist/`, then:

1. Open a LeetCode problem, click Trace on a two-sum-style solution — arrays and
   hashmaps must still work end to end (the M1 no-regression bar).
2. **B2:** trace *Reverse Linked List* and *Binary Tree Level Order Traversal* —
   these used to `AttributeError` immediately; they should now run.
3. **B1:** trace `while True: pass` — the panel should report a stopped/truncated
   run within ~10s, and **a second Trace click must still work** (the old build
   was dead until reload). Watch the offscreen console for a worker respawn.
4. **B7:** reload the extension at `chrome://extensions` without reloading the
   LeetCode tab, then click Trace — it should still extract code (it used to
   fail with "Could not establish connection").
5. **B15:** open the offscreen console right after install; Pyodide should warm
   up with no `WARMUP` message involved.

**Known noise, deliberately not fixed in M1:** `self` shows up as a variable on
every step of a `Solution` method (pre-existing; it eats a gutter badge slot).
Fix belongs with the variable-display work in M4/M8.

## 4. Deviations from the design doc

- **M6–M8 delivered as one local feature branch**, matching this session's combined
  completion/UX request. No milestone PRs or merges were created.
- **M7:** model content/replacement/disposal subscriptions supply staleness rather
  than polling version IDs. The visible number rail is preferred over absolute
  top math for folded/wrapped lines; the math remains the fallback.
- **Error transport:** `ExecutionError.trace?` carries processed partial snapshots.
  The reducer selects the last snapshot at the reported error line, and the error
  notice persists during playback.
- **Tree trail:** highlight the previous navigated cursor position, not a cumulative
  visited set (a cursor position alone does not prove a node was processed).
  UI expansion is bounded by the tracer's existing 11 serialized levels.
- **Greedy:** sorted traversal with conditional local selection is a low-confidence
  hint. Pattern scores are heuristic evidence, not calibrated probabilities.
- **GraphViz** remains deferred as the explicitly optional stretch feature.


- **M5: `Snapshot.callStack` added to schema v2.** DESIGN.md §4's Snapshot
  carries `frameId`/`frameName`/`callDepth` for the *current* frame only, which
  is not enough to draw a call stack — the ancestors exist only in the
  call/return event stream. `processSnapshots` reconstructs them once per trace
  and attaches the list. DESIGN.md §4 updated.

- **M4: `heap` still renders through ArrayViz.** HeapViz is M8; a heap is a
  list and reads fine as one meanwhile. The M2 interim fallback is otherwise
  gone — `VizRouter` now routes each kind to its own component, and only
  `linked_list`/`tree` (M5) and `graph` (M8 stretch) reach the JSON dump.
- **M4: added `@testing-library/react` + `jsdom`** so the visualizers have
  behavioural tests rather than none. DESIGN.md §10 called for vitest but
  didn't name a component-testing approach.

- **M3: matrix pointer encoding.** DESIGN.md §4 said a matrix pointer's `index`
  addresses the flattened cell. Implemented instead as one pointer per axis
  variable, with `cell.row`/`cell.col` set to `-1` on the axis it doesn't move
  along and `index` holding its position on the axis it does. A single
  flattened index can't represent a row cursor whose column isn't known yet,
  which is most of a row-major scan. The flattened index still appears, as the
  `current` highlight on the crossing cell. DESIGN.md §4 updated.

- **M2: VizRouter renders sequence kinds with ArrayViz for now.** Tagging lists
  as `stack`/`heap` and deques as `queue` in M2 would otherwise push structures
  that render fine today into the raw JSON fallback, since StackViz/QueueViz/
  SetViz are M4 and HeapViz is M8. VizRouter unwraps `{__type, items}` and
  routes every sequence-shaped kind through ArrayViz until its real visualizer
  lands. No design change — just ordering.
- **M2: added vitest** (`npm test`, `vitest.config.ts`, `tests/unit/`). Named in
  DESIGN.md §10 but not assigned to a milestone; pulled in here because M2 is
  routing logic and needed coverage. The config is separate from
  `vite.config.ts` so the CRX plugin doesn't load during tests.

- **§5.2 interrupts — SharedArrayBuffer is not available.** Offscreen documents
  are not cross-origin isolated, so `pyodide.setInterruptBuffer` can't be used
  in practice. Implemented as the doc's own documented fallback (§11):
  feature-detect the buffer and use it when present, otherwise
  `worker.terminate()` + respawn at `MAX_EXECUTION_TIME`. Adding COOP/COEP
  headers to the manifest to force isolation was rejected for M1 — it risks
  breaking Pyodide's own wasm fetches and can't be verified without Chrome.
  DESIGN.md §5 updated to say so.
- **§5.3 budget precedence.** For a tight infinite loop the *snapshot* cap
  (5000) trips before the *event* cap (200k), because with the runner stub gone
  nearly every traced event now produces a snapshot. Both raise
  `LeetTraceLimitError` and unwind, so B1 is fixed either way; `limit` says
  which one fired so M8 can word the notice correctly ("infinite loop" vs
  "showing the first 5000 steps"). MAX_EVENTS remains the backstop for events
  that don't produce snapshots.
- **§6 runner stub replaced by a direct call.** DESIGN.md §6 specifies
  generating a runner stub appended to the user's source. Instead the method is
  invoked from Python after `exec()`, with arguments built on the tracer side.
  Same result, and strictly better: no synthetic lines exist, so nothing can
  leak into snapshots or tracebacks and the `_user_max_line` suppression that
  §6.4 needed is no longer load-bearing. DESIGN.md §6 updated.
- **Example parsing hardened.** §6 assumed `dict(<example>)` would be exec'd.
  It is now parsed as an AST call and each keyword read with `literal_eval`, so
  no example text is ever executed. Examples whose keys don't name a real
  parameter bind nothing and fall through to the next candidate rather than
  being mapped positionally (guessing would run the solution on silently wrong
  arguments).
- **Added `scripts/smoke-tracer.mjs`** (`npm run smoke:pyodide`), not in §10.
  It runs the tracer under real Pyodide in Node, covering what CPython can't
  (the `<exec>` filename, `runPython` marshalling, budgets unwinding in WASM)
  without needing Chrome.
