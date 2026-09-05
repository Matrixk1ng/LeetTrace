# LeetTrace implementation progress

> Working log for implementation sessions. Every chat session working on the
> milestones MUST update this file before ending: check off finished items,
> fill in "Current state", and note anything the next session needs to know.
> Keep entries short and factual. Newest session notes at the top of §3.

## 1. Milestone status

- [x] **M1 — Hardening** (worker + interrupts B1, input builders B2, injection fallback B7, B9, B10, B12 types v2, B15, pytest scaffolding)
- [x] **M2 — Serialization + routing** (B4 dict/list families + deque/set/heap tags, B13, schema v2 fields, B8 per-frame changed)
- [ ] **M3 — Pointer correctness** (B3 AST index mapping, stable colors, matrix + node pointers)
- [ ] **M4 — Visualizers wave 1** (MatrixViz, StackViz, QueueViz, SetViz, string-as-array, B17)
- [ ] **M5 — Visualizers wave 2** (LinkedListViz, TreeViz, CallStackViz)
- [ ] **M6 — Patterns v2** (AST-based detector)
- [ ] **M7 — Editor mirroring** (B5, B6, B16)
- [ ] **M8 — Polish** (scrubber, B14, collapsible cards, windowing, notices, HeapViz, B18 README; GraphViz stretch)

## 2. Current state

- **Next task:** Start M3 — pointer correctness. B3 is the big one: a static AST
  pass in `src/offscreen/tracer.py` mapping each array name to the index
  variables that actually subscript it (`arr[i]`, `arr[i+1]`, `while i <
  len(arr)`), emitted alongside the existing `_analyze_usage` output, then
  consumed in `processSnapshot` (`src/offscreen/snapshot-builder.ts`) to replace
  the current "every in-range int is a pointer on every array" loop. Also:
  stable per-name colors for the whole trace (not `colorIdx++` per attach),
  matrix `{row, col}` pointers, and node pointers for linked lists/trees.
  `Pointer.cell` and `NodePointer` already exist in `shared/types.ts`.
- **Active branch:** `feature/m2-serialization`, stacked on `feature/m1-hardening`.
- **Open PRs:** [#15 — M1 Hardening](https://github.com/Matrixk1ng/LeetTrace/pull/15).
  M2 opens next. **Not merged — ask before merging to `main`.**
- **Blocked on:** nothing.

### Verification gates

| Command | Result |
|---|---|
| `npm run lint` | 0 errors |
| `npm run build` | ok |
| `npm test` (vitest) | 24 passed |
| `npm run test:tracer` (pytest) | 65 passed |
| `npm run smoke:pyodide` | all pass |

## 3. Session notes

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
