# LeetTrace — Design Doc & Completion Plan

**Status:** Draft v1 · 2026-09-04
**Goal:** Take LeetTrace from "arrays and hashmaps work" to a complete tracer/visualizer for **all common DSA structures and algorithm patterns** on LeetCode Python solutions.

---

## 1. Where the project is today

### Working end-to-end
- Extension scaffolding: MV3 manifest, CRXJS build, side panel, content script on `leetcode.com/problems/*`.
- Code extraction: page-world Monaco bridge (`public/monaco-bridge.js`) with DOM fallback, language detection, example-input scraping from the problem description.
- Execution: Pyodide hosted in an **offscreen document** (survives service-worker death), `sys.settrace`-based tracer producing per-line snapshots, auto-runner that instantiates `Solution` and calls the first public method with kwargs parsed from the scraped example.
- Panel: React + reducer store, play/pause/step/speed controls, variable inspector, pattern badge, **ArrayViz** (pointers + highlights) and **HashMapViz** (new-key highlighting). Everything else falls back to a JSON dump.
- Gutter: current-line highlight + inline variable badges mirrored into the LeetCode editor.

### Promised (README) but not built yet
- LinkedListViz, TreeViz, MatrixViz, StackQueueViz — `VizRouter.tsx` only routes `array` and `hashmap`.
- Sliding-window pattern detection (README lists it; `detectPattern` doesn't implement it).
- Support for problems whose inputs are linked lists / trees (see bug **B2** — these currently crash).

---

## 2. Bug audit (found 2026-09-04)

Ordered by severity. File references are to current `main`.

### P0 — breaks core use cases

- **B1 — Infinite loops hang the offscreen document forever; the 10s timeout can never fire.**
  `pyodide.runPython(...)` is **synchronous** and runs on the offscreen document's main thread. `Promise.race([runWithPyodide(...), timeout(...)])` ([pyodide-runner.ts:356](../src/offscreen/pyodide-runner.ts)) cannot preempt it — the event loop is blocked, so the timer callback never runs. `MAX_SNAPSHOTS` only stops *tracing* (`sys.settrace(None)`), not *execution*, so `while True: pass` runs forever and every later trace request hangs too (the offscreen doc is a singleton).
  **Fix (spec in §5):** run Pyodide inside a **Web Worker** owned by the offscreen document. Use `pyodide.setInterruptBuffer` (SharedArrayBuffer) to raise `KeyboardInterrupt` on timeout, with `worker.terminate()` + respawn as the fallback. Also: have the tracer raise its own `LeetTraceLimitError` when `MAX_SNAPSHOTS` is hit so bounded-but-huge runs stop cleanly.

- **B2 — Linked-list and tree problems can't execute at all.**
  The auto-runner passes scraped example kwargs verbatim: `head = [1,2,4]` calls `mergeTwoLists(list1=[...], ...)` with **plain lists**, then user code does `list1.val` → `AttributeError`. The tracer/serializer understand `ListNode`/`TreeNode`, but nothing ever *constructs* them from example input.
  **Fix (spec in §6):** inspect the method's type annotations (LeetCode templates always have them: `Optional[ListNode]`, `Optional[TreeNode]`) and convert list literals to `ListNode` chains / `TreeNode` level-order trees before invoking. Convert the return value back for display.

### P1 — wrong or missing behavior users will hit quickly

- **B3 — Pointer inference is wrong: every in-range int becomes a pointer on every array.**
  [pyodide-runner.ts:422-445](../src/offscreen/pyodide-runner.ts): for each `int` variable, a pointer is pushed onto **every** array where the value is a valid index. So `target = 9` renders as an arrow on a 15-element `nums`, counters/lengths (`n`, `count`, `total`) show as pointers, and the same variable gets different colors on different arrays (`colorIdx++` per attach).
  **Fix:** only treat a variable as a pointer for arrays it actually indexes — do a static pass over the user code for `arr[i]`, `arr[i+1]`, `while i < len(arr)` patterns to build a `{array → pointer names}` map (plus a small allowlist: `i, j, k, l, r, lo, hi, left, right, mid, slow, fast, start, end`). Assign each pointer name a **stable color** for the whole trace, not per-snapshot.

- **B4 — BFS/queue/counter problems visualize as garbage strings.**
  `_serialize` handles `deque` implicitly? No — `deque` is not a `list`/`dict` subclass, has no `val/next`, so it falls through to `repr(v)`. `Counter`/`defaultdict`/`OrderedDict` **do** serialize (dict subclass) but their Python type names are `Counter`/`defaultdict`, and `buildDataStructure` only matches `type === 'dict'` and `type === 'list'` ([pyodide-runner.ts:475-491](../src/offscreen/pyodide-runner.ts)) — so none of them get a visualizer. Same for `set` (serialized as list, type `'set'`) and `tuple`.
  **Fix:** serialize with an explicit `__type` tag for `deque`/`set`/`heap-like list`; in `buildDataStructure`, match on a *family* (`dict-like`, `list-like`, `set`, `deque`) instead of exact type names.

- **B5 — Gutter maps to the wrong line whenever the editor is scrolled.**
  [gutter.ts:42-50](../src/content/gutter.ts) sorts the *rendered* `.view-line` nodes by `top` and indexes with the snapshot line number — but Monaco virtualizes: it only renders visible lines, so index N of the visible set ≠ document line N unless the editor is scrolled to the top. Long solutions get highlights on the wrong lines.
  **Fix:** compute the document line of the first rendered line from Monaco's layout (`top / lineHeight` — tops are in document space within `.view-lines`), i.e. match `parseFloat(el.style.top) / lineHeight === line`, not array index. Recompute on scroll (see B6).

- **B6 — Stepping annotations are wiped by scrolling.**
  The content script's MutationObserver on `.view-lines` ([index.ts:48-64](../src/content/index.ts)) fires on Monaco's virtualization churn (scrolling re-renders lines), so `clearGutterAnnotations` runs 1s after any scroll — badges vanish mid-playback even though the code didn't change. Also badge positions are computed once from `getBoundingClientRect` and never updated on scroll.
  **Fix:** distinguish "code edited" (clear trace — it's stale) from "viewport changed" (re-render the current badge at its new position). Track the editor content via the Monaco bridge (model version id) rather than DOM mutations, or diff extracted text.

- **B7 — No recovery when the content script isn't in the page.**
  `useExecution` comments "Route through background so it can inject the content script if needed" — but the background never injects anything and the manifest has no `scripting` permission. After an extension reload, or when LeetCode client-side-navigates into a problem page (content scripts only auto-inject on document load), `EXTRACT_CODE` fails with "Could not establish connection".
  **Fix:** add `scripting` permission; in the SW's `EXTRACT_CODE` relay, on connection error call `chrome.scripting.executeScript`/`insertCSS` for the content bundle and retry once.

### P2 — correctness papercuts & drift

- **B8 — `changed` flags are computed across mixed frames.** `_prev_locals` is a single global compared against whichever frame ran last, so with recursion/helper calls, variables flip `changed` incorrectly. Fix: key previous-locals by frame identity (`id(frame)`), clean up on `return`.
- **B9 — Error line can point past the user's code.** `_deepest_user_line` can return a runner-stub line (> `_user_max_line`); the panel then shows "Error on line 12" for a 9-line solution. Clamp to `_user_max_line`, and prefer the deepest frame ≤ that bound.
- **B10 — Timeout leaves state inconsistent even where it applies.** `timeout()`'s `setTimeout` is never cleared on success (leak), and on timeout the runner returns an error while Python may still be mid-execution with `sys.settrace` active. Superseded by the B1 worker redesign, but note for interim.
- **B11 — `detectPattern` misfires.** DP heuristic `/\[0\]\s*\*/` matches any `[0] * n` buffer; DP is checked before two-pointer so `left/right` loops with a dp-ish line misclassify; recursion check uses `lines.indexOf(l)` (first occurrence of duplicate line text → wrong slice); sliding window missing entirely; regexes also match inside comments/strings. Fix: detect on the **AST** (we already `ast.parse` in Python) — see §7.
- **B12 — `types.ts` message contract has drifted.** `EXECUTE_CODE`/`CODE_EXTRACTED` in [types.ts](../src/shared/types.ts) lack `examples`; actual runtime messages carry them; `UPDATE_GUTTER` payload shape differs from what `useExecution` sends. The "shared types are the contract" premise is broken — realign and make all senders/receivers import the union.
- **B13 — Matrix detection edge cases.** `value[0].every(...)` with `value[0] = []` → 0-column "matrix"; jagged arrays where only row 0 is flat pass the check. Also matrices route to the JSON fallback (no MatrixViz yet).
- **B14 — Play at the end does nothing.** `PLAY` at the last step immediately dispatches `PAUSE` (the auto-play effect sees `isAtEnd`). Users expect play-from-end to restart from step 0.
- **B15 — `onInstalled` warm-up race.** `createDocument` resolves before `main.ts` necessarily registers its listener; the `WARMUP` message can miss. Caught + logged, but the pre-warm silently doesn't happen. Have the offscreen doc initiate (`initPyodide()` on load) instead of being told.
- **B16 — `sidePanel.open` user-gesture fragility.** Opening from a content-script message usually keeps the gesture, but it's known-flaky; add error surfacing on the FAB (e.g. tooltip "click the extension icon") when it rejects.
- **B17 — HashMapViz only highlights *new* keys**, not changed values; step-back shows the previous step's entry as "new" (comparison is always against `currentStep - 1`, even stepping backwards). Compare values too; treat direction-agnostic diffs.
- **B18 — README drift.** File layout (`background/index.ts`, `tracer.py`), React 18 (actually 19), listed visualizer files that don't exist. Update once this doc lands.

---

## 3. Product spec — "fully done" definition

LeetTrace v1.0 is done when, for any LeetCode problem solvable with a Python `Solution` class, a user can click **Trace** and get:

1. **Execution** that never hangs the extension, errors with the right line number, and caps work at `MAX_SNAPSHOTS` / `MAX_EXECUTION_TIME` cleanly.
2. **A visualizer for every structure** in the table below (no JSON-dump fallbacks for supported types).
3. **Pointer/highlight semantics** that are accurate (only real index variables, stable colors).
4. **Pattern badge** that is right far more often than wrong (AST-based).
5. **Editor mirroring** (line highlight + badges) that survives scrolling and only clears when the code actually changes.

### Data structure coverage matrix

| Structure | Detect (tracer) | Serialize | Visualizer | Status |
|---|---|---|---|---|
| Array / list | ✅ | ✅ | ✅ ArrayViz | Done (fix B3 pointers) |
| String (as sequence) | type `str` | as char array when indexed/pointed | ArrayViz variant | **New** |
| HashMap / dict / Counter / defaultdict | dict only | ✅ | ✅ HashMapViz | Extend to dict-likes (B4); add changed-value highlight (B17) |
| Set / frozenset | ❌ | list w/ type `set` | SetViz (chip cloud, add/remove diff) | **New** |
| Matrix / 2-D grid | partial (B13) | ✅ | MatrixViz (grid, row/col pointers, cell highlights) | **New** |
| Linked list (`ListNode`) | ✅ | ✅ (+cycle flag) | LinkedListViz (node chain, `slow`/`fast`/`curr` node pointers, cycle indicator) | **New**; needs B2 input building |
| Binary tree (`TreeNode`) | ✅ | ✅ (depth-capped) | TreeViz (SVG top-down layout, current-node highlight, path trail) | **New**; needs B2 input building |
| Stack (list used LIFO) | usage heuristic (`append`+`pop()`) | list | StackViz (vertical, top emphasized, push/pop animation) | **New** |
| Queue / deque | ❌ (B4) | `__type: deque` | QueueViz (horizontal, front/back labels, popleft/append animation) | **New** |
| Heap (list via `heapq`) | `heapq.*` calls on the var | list + `__type: heap` | HeapViz (implicit tree or bar view, min at root) | **New** |
| Graph (adjacency dict/list) | dict of lists w/ node-like keys, or `defaultdict(list)` | dict | GraphViz (force/ring layout, visited coloring) | **New — stretch, ship last** |
| Recursion / call stack | `call`/`return` events | frame list (name, line, args) | CallStackViz (frame stack; powers DFS/backtracking) | **New** |

**Structure identity across steps:** visualizers diff against the previous snapshot by `id` (variable name). Keep that, but add `kind` disambiguation so a variable that changes type mid-trace re-mounts cleanly.

### Algorithm pattern coverage (badge)

Two Pointer, Sliding Window, Binary Search, BFS, DFS, Backtracking, Dynamic Programming (1-D/2-D), Greedy, Heap/Top-K, Prefix Sum, Monotonic Stack, Fast & Slow Pointers, Union-Find. Detection spec in §7.

---

## 4. Architecture (target)

Unchanged topology — content script ↔ SW ↔ offscreen ↔ panel — with one addition: a **worker inside the offscreen document**.

```
Panel (React) ── EXECUTE_CODE ──► SW ── relay ──► Offscreen doc ── postMessage ──► Pyodide Worker
      ▲                                                 │      ◄── snapshots/error ──┘
      └──── EXECUTION_RESULT / PYODIDE_LOADING ◄────────┘
Panel ── UPDATE_GUTTER/CLEAR_GUTTER ──► Content script (via tabs.sendMessage)
Panel ── EXTRACT_CODE ──► SW ──► Content script ──► Monaco bridge (page world)
```

Snapshot **post-processing stays in TS** (offscreen): the Python side emits raw `{step, line, event, frame, variables}`; TS builds `dataStructures`, `pointers`, `highlights`. Pattern detection moves to Python AST (§7) and is returned alongside snapshots.

### Snapshot schema v2 (`shared/types.ts`)

```ts
interface Snapshot {
  step: number;
  line: number;                    // 1-indexed, ≤ user's last line
  event: 'line' | 'call' | 'return';
  frameId: string;                 // stable per invocation, for call-stack viz + per-frame `changed`
  frameName: string;               // e.g. "twoSum"
  callDepth: number;
  variables: Record<string, VariableState>;
  dataStructures: DataStructureState[];
  highlights: Highlight[];
  stdout?: string;                 // print() output emitted on this step
}

type StructureKind =
  | 'array' | 'string' | 'matrix' | 'hashmap' | 'set'
  | 'linked_list' | 'tree' | 'stack' | 'queue' | 'heap' | 'graph';

interface Pointer { name: string; index: number; color: string }        // arrays/matrix (matrix: {row, col})
interface NodePointer { name: string; nodeIndex: number; color: string } // linked list / tree (index into serialized node order)
```

Messages get versioned in one union in `shared/types.ts`, all four contexts import it, and `examples`/`UPDATE_GUTTER` shapes are corrected (B12).

---

## 5. Execution engine hardening (fixes B1, B10)

1. **Worker host:** offscreen doc spawns `pyodide-worker.ts` (module worker). All of today's `pyodide-runner.ts` moves in; offscreen `main.ts` becomes a thin message bridge with a request queue (one execution at a time).
2. **Interrupts:** if `crossOriginIsolated` allows SharedArrayBuffer in the offscreen context, use `pyodide.setInterruptBuffer`; on timeout set `buf[0] = 2` → `KeyboardInterrupt` inside Python. Regardless, keep a hard fallback: `worker.terminate()` after `MAX_EXECUTION_TIME + 2s`, respawn, and report "Execution timed out".
3. **Budget inside the tracer:** the tracer counts *events* (not just snapshots) and raises `LeetTraceLimitError` at, say, 200k events, so `sys.settrace(None)`-then-run-forever can't happen. Snapshot cap stays at `MAX_SNAPSHOTS` with an explicit `truncated: true` flag surfaced in the UI ("showing first 5000 steps").
4. **Warm-up:** offscreen doc calls `initPyodide()` on load (drops the racy WARMUP message, B15). SW only ensures the document exists.

---

## 6. Input building for object types (fixes B2)

In `_build_auto_runner`, after choosing `method_name`:

1. Parse the method's **annotations** from the AST: `Optional[ListNode]`, `List[TreeNode]`, `ListNode`, `TreeNode`, `Optional[TreeNode]`, `List[List[int]]`, etc. (string comparison on the unparsed annotation is fine).
2. Generate a runner stub that wraps each kwarg through a converter before the call:
   - `_to_list_node(values)` → chained `ListNode`s (also `List[ListNode]` → map).
   - `_to_tree_node(values)` → level-order build with `None` gaps (LeetCode's standard encoding).
   - Special example keys: `pos` (cycle index — connect tail for cycle problems), `n` alongside `head`, etc. handled case-by-case; when `pos >= 0`, link the cycle so `has_cycle` serialization shows it.
3. Convert the **return value** symmetrically for the final snapshot (`ListNode` → list, `TreeNode` → level-order) so the `return` pseudo-variable is readable.
4. The converters live in the private namespace (`_leettrace_*` names, filtered by the existing `_`-prefix rule) so they never appear as user variables. Runner-stub lines stay above `_user_max_line` suppression as today.
5. If annotations are missing/unrecognized, fall back to today's behavior (pass raw) — never fail extraction because of the converter.

---

## 7. Pattern detection v2 (fixes B11)

Move detection into Python (we already have `ast`): analyze the parsed tree once per trace, return the best `DetectedPattern` (+ optionally top-3 with confidences).

Signals (illustrative, each contributes weighted score):

- **Binary search:** `while` comparing two names later reassigned to `mid ± 1`; `mid = (lo + hi) // 2` shape.
- **Sliding window:** `for r in range(...)` containing an inner `while` that advances a second index and shrinks a running aggregate (`window_sum -= ...`, `del count[...]`).
- **Two pointer:** two indices initialized at `0`/`len-1`, moved toward each other in one loop.
- **Fast & slow:** two node vars advanced `x.next` vs `x.next.next`.
- **BFS:** `deque` construction + `popleft` in a loop.
- **DFS/Backtracking:** self-recursive function; backtracking adds paired `append`/`pop` around the recursive call.
- **DP:** `functools.cache`/`lru_cache` decorator, or a table indexed by loop vars and read at `±1` offsets.
- **Heap/Top-K:** `heapq.heappush`/`heappop` calls.
- **Monotonic stack:** `while stack and stack[-1] <op> x: stack.pop()` shape.
- **Prefix sum:** running accumulation stored per index, later differenced.
- **Union-Find:** `find`/`union` functions with parent-array path updates.

AST analysis ignores comments/strings by construction, killing the current false positives. Ordering bugs disappear because everything is scored, not first-match.

---

## 8. UI/UX plan

- **VizRouter** routes all `StructureKind`s; unknown kinds keep the JSON fallback behind a "raw" disclosure.
- **Layout:** collapsible per-structure cards (traces with 3+ structures get crowded in a 400px panel); call-stack card pinned when `callDepth > 1`.
- **Playback:** scrubber (range input over steps) in Controls; Play at end restarts (B14); keyboard shortcuts (←/→/Space) while the panel is focused.
- **Long data:** arrays > ~60 items render windowed around active pointers with "… N more" ends; trees depth-capped at 6 visible levels with expand.
- **Errors:** show the error snapshot's variables (the trace up to the exception is still loaded) instead of a dead-end error card — "your code failed on line N, here's the state when it did" is the killer teaching moment.
- **Truncation notice** when `MAX_SNAPSHOTS` hit.
- **Trace staleness:** when the editor content changes (Monaco model version), badge the panel "code changed — retrace".

---

## 9. Milestones

Each milestone is shippable; order chosen so hardening lands before the visualizer fan-out (everything depends on execution not hanging, and object-input problems unblock the two biggest new visualizers).

**M1 — Hardening (P0/P1 bugs):** B1 worker + interrupt, B2 input builders, B7 injection fallback, B9, B10, B12 types realignment, B15.
**M2 — Serialization + routing layer:** `__type` tags for deque/set/heap, dict-like/list-like families (B4), matrix edge cases (B13), snapshot schema v2 (`event`, `frameId`, `callDepth`, `stdout`), per-frame `changed` (B8).
**M3 — Pointer & highlight correctness:** B3 static index-usage analysis, stable colors, matrix `{row, col}` pointers, node pointers for list/tree.
**M4 — Visualizers wave 1:** MatrixViz, StackViz, QueueViz, SetViz, string-as-array; HashMapViz changed-value diff (B17).
**M5 — Visualizers wave 2:** LinkedListViz (incl. cycle + fast/slow), TreeViz (SVG layout + traversal trail), CallStackViz.
**M6 — Patterns v2:** AST-based detector (§7), badge shows description tooltip.
**M7 — Editor mirroring fixes:** B5 line math, B6 scroll-aware badges + model-version staleness, B16.
**M8 — Polish & release:** scrubber, collapsible cards, windowed long arrays, truncation/staleness notices, B14, README/doc refresh (B18), HeapViz; GraphViz if time allows.

Suggested issue mapping: one GitHub issue per milestone bullet-group, labeled `P0/P1/P2` from §2 so partially-done milestones still burn down the audit list.

---

## 10. Testing strategy

- **Python tracer tests (fastest ROI):** run the tracer script under plain CPython (it has no Pyodide dependency) with pytest: golden-snapshot tests per problem archetype — two-sum, reverse linked list, level-order traversal, LRU cache, binary search, subsets/backtracking, `while True` (must raise limit error), cyclic linked list, 5k-element input (truncation).
- **TS unit tests (vitest):** `processSnapshot` pointer/highlight building, `buildDataStructure` family matching, reducer transitions, `detectPattern` fixtures.
- **Fixture-driven visualizer dev:** a `mockData.ts` per structure kind + a dev-only panel route that renders visualizers from fixtures (already the README's intended workflow — make it real).
- **Manual E2E checklist** (until Playwright + CRX harness is worth it): one problem per structure kind, on both old and new LeetCode UIs, with editor scrolled, after extension reload, and after SPA navigation.

---

## 11. Risks & open questions

- **SharedArrayBuffer in offscreen documents** — if `crossOriginIsolated` can't be satisfied there, interrupts degrade to worker-terminate-and-respawn (~2–4s Pyodide reload penalty after a timeout). Acceptable; verify early in M1.
- **LeetCode DOM churn** — language detector and example scraper are selector-heuristic stacks; expect breakage. The Monaco bridge path is the resilient one; consider reading examples from the problem's GraphQL data embedded in the page as a sturdier source (open question).
- **`sidePanel.open` gesture rules** may change; FAB already degrades to the action-icon path.
- **Multi-example inputs with mismatched names** (auto-runner picks first parseable example) — if it TypeErrors, try the next example before giving up (cheap improvement, fold into M1/B2 work).
- **Graph visualization layout** is a genuinely hard problem in a 400px panel — scoped as stretch for a reason.

---

## 12. Non-goals (v1)

- Languages other than Python/Python3.
- Editing/re-running with custom inputs from the panel (v1.1 candidate — the plumbing exists once B2's converters land).
- Persisting traces across page reloads.
- LeetCode contests / interlocked problems (`/contest/*` URLs not matched).
