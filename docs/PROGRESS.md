# LeetTrace implementation progress

> Working log for implementation sessions. Every chat session working on the
> milestones MUST update this file before ending: check off finished items,
> fill in "Current state", and note anything the next session needs to know.
> Keep entries short and factual. Newest session notes at the top of §3.

## 1. Milestone status

- [x] **M1 — Hardening** (worker + interrupts B1, input builders B2, injection fallback B7, B9, B10, B12 types v2, B15, pytest scaffolding)
- [x] **M2 — Serialization + routing** (B4 dict/list families + deque/set/heap tags, B13, schema v2 fields, B8 per-frame changed)
- [x] **M3 — Pointer correctness** (B3 AST index mapping, stable colors, matrix + node pointers)
- [ ] **M4 — Visualizers wave 1** (MatrixViz, StackViz, QueueViz, SetViz, string-as-array, B17)
- [ ] **M5 — Visualizers wave 2** (LinkedListViz, TreeViz, CallStackViz)
- [ ] **M6 — Patterns v2** (AST-based detector)
- [ ] **M7 — Editor mirroring** (B5, B6, B16)
- [ ] **M8 — Polish** (scrubber, B14, collapsible cards, windowing, notices, HeapViz, B18 README; GraphViz stretch)

## 2. Current state

- **Next task:** Start M4 — visualizers wave 1. All the data these need now
  exists: `MatrixViz` (pointers carry `cell`, with `col === -1` meaning a row
  cursor and `row === -1` a column cursor; a `current` highlight marks the
  flattened crossing cell), `StackViz`/`HeapViz`-shaped kinds (`kind` on the
  structure), `QueueViz`/`SetViz` (`{__type, items}` payloads),
  string-as-char-array, and B17 (HashMapViz should highlight *changed values*,
  not only new keys, and compare direction-agnostically so stepping backwards
  doesn't mark the previous step's entry as new). Build each against a
  `mockData.ts` fixture first (DESIGN.md §10). **Remove the interim
  `SEQUENCE_KINDS` fallback in `VizRouter.tsx` as each real visualizer lands.**
- **Active branch:** `feature/m3-pointers`, stacked on `feature/m2-serialization`.
- **Open PRs:** [#15 — M1](https://github.com/Matrixk1ng/LeetTrace/pull/15) (base `main`),
  [#16 — M2](https://github.com/Matrixk1ng/LeetTrace/pull/16) (base `feature/m1-hardening`),
  M3 opens next. **None merged — ask before merging to `main`.**
- **Blocked on:** nothing.

### Verification gates

| Command | Result |
|---|---|
| `npm run lint` | 0 errors |
| `npm run build` | ok |
| `npm test` (vitest) | 42 passed |
| `npm run test:tracer` (pytest) | 83 passed |
| `npm run smoke:pyodide` | all pass |

## 3. Session notes

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
