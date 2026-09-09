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
| `npm test` (vitest) | 203 passed |
| `npm run test:tracer` (pytest) | 191 passed |
| `npm run smoke:pyodide` | all pass |
| `npm run gallery` | writes `tests/dev/gallery.html` |

## 3. Session notes

### Array pointer visibility restored

- Restored full-cell colors using each pointer's existing color, with larger matching variable labels. Overlapping pointers share a split-color cell and retain separate labels.
- Kept operation changes visible with a green dot on colored cells; clarified the outline/change legend.
- Verified pointer movement and rewind: 204 TypeScript tests passed, lint and production build passed, gallery passed. Inspected the actual component in a 400px Chrome render. Live LeetCode verification remains manual.

### 2026-09-08 — Approved batch implemented

- Implemented the approved batch using shared execution-derived operations and
  collection/graph/parent/interval/trie views, alongside existing specialized
  views. Full family mapping and supported scope: `BATCH_IMPLEMENTATION.md`.
- Added observed branch outcomes, operand references, before/after values,
  collection effects, tuple-key memo reuse, standard cache counters, source-bound
  search/window intervals and mutations in the nested backtracking walkthrough.
- Added 36 real fixture programs; 38 Python and 38 TypeScript checks cover the
  new batch. Full suite: 203 TS / 191 Python. Build, Pyodide smoke and gallery
  verified; gallery timeout increased for the 72 additional real-panel renders.
- Reviewed actual 400 px captures for graph, trie and binary bounds; fixed
  clipping, stale inspection and source labels found during review.
- No publishing/commits. Reload extension, refresh LeetCode and retrace for the
  new metadata. Live LeetCode integration remains unverified.

### 2026-09-08 — All remaining refinements: batch preview gallery

- User changed the workflow: preview all remaining families together, collect
  corrections/approval, then implement the approved batch together.
- Created `previews/batch/index.html`: 22 families / 43 interactive examples,
  including collections, graph algorithms, revised nested-call backtracking,
  sorting, interval timelines and remaining DP/window/search/pointer variants.
- Added `BATCH_REFINEMENT_REVIEW.md` with direct example links and approval
  checklist. All entries await review; no production implementation authorized
  by this preview request.
- Verified JS syntax, all 326 fixture states, routes, history/rewind, inspection
  and graph endpoints. Captured representative Chrome layouts. No extension
  source changes; prior production verification counts are unchanged.
- Next: user reviews gallery and identifies fixes. Keep previews and production
  semantics distinct, especially decorator caching and graph source bindings.

### 2026-09-08 — Linked-list implementation + slow/fast preview

- Implemented the approved combined linked-list view. Actual serialized next
  links drive directed arrows; stable identities keep duplicate values distinct
  across detached chains. Link writes and pointer assignments remain separate.
- Added inspection, alias paths, change-history rewind, bounded horizontal
  rendering and unknown state for unreachable nodes. Empty lists retain the
  existing None display. Details in `LINKED_LIST_REFINEMENT_PLAN.md`.
- Verified 165 TypeScript tests (four new real-trace linked-list regressions),
  lint, build and gallery. Python tracer unchanged; prior 153 tests remain the
  latest Python baseline. Inspected actual panel and next-preview Chrome renders.
- Next: review `previews/slow-fast-refinement.html` and
  `SLOW_FAST_REFINEMENT_PLAN.md`. Pointer movement, comparison and cycle result
  appear separately. Production cycle-specific narration is not implemented.
- Reload extension, refresh LeetCode, retrace. Live integration remains unverified;
  changes are local and uncommitted.

### 2026-09-08 — Linked-list preview arrows

- Revised the preview following user feedback: each node now has a directed
  next arrow to its destination or None. Reversal changes the arrow direction;
  completed link changes are green, and resizing recalculates endpoints.
- Verified original, partial and complete reversal, rewind and empty-list arrow
  destinations. Inspected the updated Chrome render. Preview only; production
  linked-list implementation still awaits design approval.

### 2026-09-08 — Binary-search implementation + linked-list preview

- Implemented the approved inclusive-bound binary-search slice. Source/runtime
  bindings distinguish midpoint calculation, observed comparison and bound moves.
  After bounds move, the old midpoint stays explicitly previous and unhighlighted.
- Added candidate interval, cell inspection, paging, prefix-only comparison
  history and event navigation. Empty intervals have no active cells. Supported
  syntax and conservative fallbacks are in `BINARY_SEARCH_REFINEMENT_PLAN.md`.
- Verified 161 TypeScript / 153 Python tests, lint/build/gallery/Pyodide smoke.
  Pytest's cache permission warning was non-fatal; lint passed outside sandbox.
  Captured actual 400/550 px binary-search renders; inspected the 400 px panel.
- Prepared `previews/linked-list-refinement.html` and
  `LINKED_LIST_REFINEMENT_PLAN.md` for review: stable node identities, separate
  save-next/link-rewrite/pointer-move events, reachable paths, duplicate values,
  empty input, inspection and rewind. Preview interaction checks passed and its
  browser render was inspected. Production linked-list rendering is unchanged.
- Reload the extension, refresh LeetCode and retrace to exercise the new adapter.
  Live LeetCode integration remains unverified. Next: user review of linked lists.
  All changes remain local; no commits or publishing.

### 2026-09-08 — Variable-window implementation + binary-search preview

- Implemented the approved positive-sum variable-window slice on the shared
  membership model. Direct while-condition outcomes are pending until observed
  body entry/exit; additions/removals clear earlier outcomes. Shortest lengths and
  indices require completed builtin min assignments and matching included bounds.
- UI shows condition, current length/sum, recorded shortest result, and valid
  window history. Tests cover pending versus confirmed conditions, rewind, ties,
  no result/single-value result, nonpositive/custom input abstention and shadowed
  min without extra calls. Supported forms/fallbacks documented in the plan.
- Verified 158 TypeScript / 148 Python tests, lint/build/Pyodide smoke/gallery.
  Actual app fixtures reviewed at 400/550px; screenshots linked in the plan.
- Prepared BINARY_SEARCH_REFINEMENT_PLAN.md and
  `previews/binary-search-refinement.html`: inclusive search interval, distinct
  midpoint/comparison/bound-update events, stale midpoint labelling, found/absent/
  duplicate/empty cases. JSDOM checks and Chrome review passed. Preview only.
- Reload extension, refresh LeetCode, and retrace. Next: user review of binary
  search before implementation. No commits or publishing.

### 2026-09-08 — Fixed-window implementation + next preview

- Implemented the approved fixed-size sum view. Safe source bindings and observed
  updates track included indices independently of pointers; mutation/unexplained
  changes invalidate the model. Supports zero/slice-sum initialization and
  separate add/remove operations, including temporary partial/oversized windows.
- Full-window builtin max assignments record checked windows and improved result
  indices. UI includes membership band, current/recorded-best totals, arithmetic,
  cell paging/inspection and exact event history. Scope/fallbacks are documented
  in SLIDING_WINDOW_REFINEMENT_PLAN.md.
- Verification: 155 TypeScript / 143 Python tests, lint/build/Pyodide smoke/gallery
  passed. Real app fixtures reviewed in Chrome at 400/550px. Tests cover negative
  values, ties, width extremes, mutation, custom types, pointer timing and rewind.
- Created `previews/variable-window-refinement.html` and
  VARIABLE_WINDOW_REFINEMENT_PLAN.md for the next review: positive-sum shortest
  window with expand/check/save/shrink, no-result and single-element cases.
  Preview totals, outcomes, rewind and inspection checked with JSDOM; Chrome
  layout reviewed. This next adapter is not yet implemented.
- Reload extension, refresh LeetCode, and retrace for the new fixed-window metadata.
  No commits or publishing. Next: review variable-size preview, then binary search.

### 2026-09-08 — Sliding-window preview

- User confirmed the two-pointer implementation works and requested the next
  family. Prepared `SLIDING_WINDOW_REFINEMENT_PLAN.md` and the interactive
  `previews/sliding-window-refinement.html`; production source unchanged.
- Fixed-size maximum-sum example: included-range band, remove/add/check/save
  events, separate current and best totals, best indices, and window history.
  Includes all-negative and tied-result examples and 400/550 width controls.
- Awaiting visual review before implementation. Variable-size windows are a
  separate follow-up; preview event boundaries are explicitly illustrative.
- JSDOM verified totals against included cells at every event, incomplete-window
  checks, negative/tied best results, rewind, inspection and width switching.
  Chrome layout reviewed; screenshot: `previews/sliding-window-concept.png`.

### 2026-09-08 — Approved two-pointer implementation

- Implemented an array/pointer view for observed builtin-integer pair-sum
  assignments, with attached index labels, overlap handling, cell inspection,
  paging and pointer jumps. Existing arrays remain the structural fallback.
- Python confirms sums and simple branch outcomes without eval or user method
  calls. Pointer changes and comparisons stay separate; moved pointers never
  borrow an old pair's sum without an explicit previous-pair label.
- Comparison history supports exact event jumps and prefix-only rewind. Neutral
  operation explanations replace unproven sorting/elimination claims. Scope and
  remaining two-pointer families documented in TWO_POINTER_REFINEMENT_PLAN.md.
- Verified real traces for movement both ways, duplicates, meeting pointers,
  empty/singleton inputs, custom arithmetic abstention, exceptions, history jumps
  and rewind. 152 TS / 138 Python tests; lint, build and Pyodide smoke passed.
  Gallery produces real app fixtures at 400/550px. Live LeetCode review still
  requires reloading the extension and tab, then tracing again.
- Next staged preview: sliding window. No commits or publishing this session.
- Gallery passed and Chrome renders were reviewed at 400/550px; screenshots
  are linked from TWO_POINTER_REFINEMENT_PLAN.md.

### 2026-09-08 — Array/two-pointer preview

- Prepared the next staged proposal in `TWO_POINTER_REFINEMENT_PLAN.md` and
  `previews/two-pointer-refinement.html`; no production source changes.
- Array indices, directly attached left/right labels, separate comparisons and
  movements, explicit previous-pair equation during movement, and pair history.
  Includes found/no-match/duplicate-value cases, cell inspection and 400/550 widths.
- Next: user reviews this visual direction before ArrayViz and trace refinements.
- JSDOM checks passed for comparison/movement separation, rewind, all three
  outcomes, pointer overlap, cell/history inspection and width switching.
  Chrome-rendered layout reviewed; screenshot: `previews/two-pointer-concept.png`.

### 2026-09-08 — Approved recursion and DP implementation

- Implemented the approved nested call/return walkthrough with parameter labels,
  folded call results, current-call context, follow toggle and exact event jumps.
  Existing tree and BFS renderers retain priority for their supported structures.
- Added safe Python observations for direct dictionary saves/returns and builtin
  one-dimensional list addition recurrences. Memo reuse needs a prior invocation's
  save and no child expansion; a newly computed return is not labelled reuse.
  Pending writes are canceled on exceptions. No user expressions are re-evaluated.
- Bottom-up view shows actual table values, inputs/target, equations before and
  after confirmed writes, recent writes and bounded cell inspection. Other
  structures and call details remain available in expandable sections.
- Added real memoized/bottom-up fixture pipelines and regression checks for
  return values, rewind, folding, event jumps, false/zero values, failed writes,
  side-effecting indices and custom container abstention. Full suite: 149 TS,
  133 Python; lint/build/Pyodide smoke/gallery passed. Rendered app fixtures at
  400/550px, with screenshots linked in RECURSION_DP_REFINEMENT_PLAN.md.
- Scope: direct dictionary memo operations and one-dimensional two-entry addition
  recurrences. Decorator caches, multidimensional DP and other operators fall back
  to ordinary views. Live LeetCode integration still needs browser-user review:
  reload extension, refresh the tab, and run a new Trace. No commits or publishing.

### 2026-09-08 — Revised direction: recursion and DP

- User rejected the path/choose/undo preview and supplied a nested recursive
  recurrence walkthrough with returned values and memo reuse.
- Created `previews/recursion-dp-refinement.html` with top-down nested calls,
  foldable branches, actual illustrative return values, optional memo and a
  separate bottom-up dependency/table view for the same f(5) = 8 example.
- Added `RECURSION_DP_REFINEMENT_PLAN.md`; earlier backtracking proposal is
  superseded and deferred. Production source unchanged; review comes first.
- JSDOM checks passed for memo reuse without child expansion, return values,
  plain recursion, folding, rewind, bottom-up read/write boundaries and widths.
  Browser-reviewed top-down and bottom-up layouts; active-call breadcrumb keeps
  caller context visible when the walkthrough scrolls.

### 2026-09-08 — Backtracking preview for review

- Created `previews/backtracking-refinement.html` and
  `BACKTRACKING_REFINEMENT_PLAN.md` for the next staged refinement.
- Path tiles, separate saved copies, parameterized stack, considering/choose/
  call/return/resume/undo states, event playback and 400/550px width controls.
  Starts at undo; the complete illustrative Subsets example has four results.
- Checked return versus undo, saved results, rewind, completion, result inspection
  and width switching with JSDOM. Preview-only checks; production source unchanged.
- Next: user reviews this direction before bounded trace metadata and rendering
  implementation. General backtracking detection is not implemented by this preview.

### 2026-09-08 — Approved DFS refinement + parameters on all call stacks

- User approved the DFS preview and requested parameter values for general call
  stacks. Python captures actual bound arguments on call events; reconstruction
  preserves each frame's entry values across recursion, returns and reassignment.
- Includes defaults, keyword-only/positional-only arguments, varargs/kwargs and
  underscore-prefixed parameters. Excludes self/cls and captured closure locals.
  Failed argument serialization is contained, not allowed to fail execution.
- Stack rows show compact parameter lists and expandable recorded values; current
  return frame says Returning. Older frames expand on demand. Legacy traces need
  a retrace for complete arguments; the existing tree-argument fallback remains.
- DFS uses cyan current/path, dashed violet return edges, selectable nodes,
  recorded first-call links, explicit None placeholder, compact embedded stack
  without the duplicate card and previous/next call-event jumps. Large/deep trees
  keep scrolling/expansion. Exact line controls remain intact.
- Validation: 144 Vitest, 127 pytest, lint/build and Pyodide smoke pass. Gallery
  verifies real Python BST and numeric uniquePaths recursion through React;
  actual 400px/550px renders saved in docs/previews/dfs-implementation*.png.
- Live LeetCode verification remains pending. Reload extension and page, then
  rerun Trace to populate new arguments. Backtracking choose/undo is next;
  no inferred pruning, result success, or special animation engine was added.

### 2026-09-08 — Next refinement: tree + DFS preview

- User requested the next structure/algorithm. Prepared the next staged visual
  review, preserving the original preview-before-implementation workflow.
- Added DFS_REFINEMENT_PLAN.md and docs/previews/dfs-refinement.html: cyan current
  node/path, violet dashed returns, compact stack, None call, selectable nodes,
  first-entry navigation, rewind, drawers and 400/550px sizing.
- Preview uses a clearly labelled partial illustrative call sequence. No
  production files changed; backtracking choose/undo stays a separate pass.
- Verified preview transitions, empty-child/return states, rewind, keyboard node
  inspection, first-entry navigation and width selection. Captured the 400px
  browser render as docs/previews/dfs-concept.png.
- Await visual feedback before implementing this DFS refinement.

### 2026-09-08 — Compact editor badges

- Inline editor annotations now show only short scalar values (numbers, booleans,
  None and strings up to 24 characters), capped at four and ranked by current
  statement relevance. Arrays, grids, queues and node objects stay in the panel.
- Badges wrap within the editor's existing half-width limit; individual labels
  can wrap instead of clipping. Full values remain in the panel inspector.

### 2026-09-07 — BFS semantic state and event navigation

- Resumed after a usage-limit rejection of the screenshot tool; capture now
  succeeds. Built on the approved grid foundation without moving to DFS.
- Replays confirmed append/popleft and grid writes into immutable per-step
  effects; records source line and values. No evaluation of user conditions.
- Current coordinates require verified dequeue/unpacking plus matching grid
  axes, directly or via an observed neighbor-offset assignment. Current/candidate
  and next-frontier queued cells use cyan/amber/violet with text labels.
- Splits current/next frontier only for explicit builtin `range(len(q))` loops.
  Counts observed loop passes, not distance/minutes. Unexplained queue changes,
  ambiguous structures or unsupported patterns fall back to a regular queue.
- Previous/next event buttons pause and jump into the exact snapshot timeline.
  Rewind restores prior effects/frontier without future entries. Exact playback,
  testcase selection and controls remain available; BFS toolbar spacing reduced.
- Tests: 141 Vitest, 124 pytest, lint/build, Pyodide smoke and gallery pass. The
  gallery now runs the real Python BFS fixture through enrichment and React;
  Python must be available for `npm run gallery`.
- Captured actual 400px/550px panels under docs/previews/grid-implementation*.png.
  Live Chrome/LeetCode remains a manual review: reload extension AND page, trace
  a grid BFS, test event jumps/rewind and custom cases. Review this BFS slice
  before the separate DFS refinement. Condition outcomes and animation polish
  remain optional follow-ups; do not claim they were implemented.

### 2026-09-07 — Approved refinement: grid/BFS foundation slice

- User approved the visual direction. Implemented the first bounded portion:
  combined grid/queue view for unambiguous BFS snapshots, larger selectable cells,
  reduced nested padding, wrapped tuple records/queue items and Other locals drawer.
- Python emits per-statement syntactic references without evaluating expressions.
  New matrix traces no longer use stale function-wide i/j cursors. Simple name/
  literal indices mark referenced cells before execution; ambiguous expressions
  get no guessed coordinate. Old traces retain their existing renderer fallback.
- Preserved list-of-tuples identity separately from serialized values; directions
  no longer become a matrix. Relevant now ranks references then changes, capped at
  six; remaining locals stay available. No variable is deleted from the trace.
- 132 TypeScript and 122 Python tests pass; lint/build/Pyodide smoke/gallery pass.
  Inspected actual 400px panel fixture. Live LeetCode verification remains pending.
- Next within BFS: verified dequeued-current/candidate relationships, observed
  effects, level/frontier boundaries and event navigation. The implementation
  deliberately shows a normal waiting queue until these are proven; the design
  preview is a target, not a claim these features are implemented. Stay on BFS
  before proceeding to the separately planned DFS pass.

### 2026-09-07 — Visual refinement design review (no app implementation)

- Read the supplied refinement DOCX, including its current/target screenshots.
- Created `docs/VISUAL_REFINEMENT_PLAN.md`: grid/queue/BFS first, then separate
  tree/DFS, backtracking, array, linked structure, DP and heap passes. Distinguishes
  cosmetic refinements from semantic metadata and unsupported graph scope.
- Added `docs/previews/refinement.html` and `bfs-concept.png` for user review.
  Interactive illustrative states: inspect, update, enqueue; rewind, cell
  inspection, local-value drawers, and 400/550px width selection.
- Browser-rendered at 400px; fixture interaction checks pass. Production files
  were not changed during this design pass. Await the user's visual feedback
  before implementing the first slice; existing prior work remains intact.

### 2026-09-07 — Extension reload recovery

- Fixed synchronous `Extension context invalidated` errors from testcase/editor
  notifications and the floating button. Previously `.catch()` only handled
  rejected promises, not exceptions thrown before a promise was returned.
- Stops testcase/editor polling, disconnects the editor observer, removes input
  listeners and clears stale annotations when the content runtime disappears.
- The old floating button explains that the LeetCode page needs a refresh.
  Pending extraction replies are skipped if their runtime has disappeared.
- Added five regression tests for synchronous/asynchronous invalidation, missing
  runtime, temporary receiver failures, and refresh guidance. 128 tests pass.
- Reload the extension and then refresh open LeetCode tabs to load this fix.
  Existing error entries can be cleared in Chrome; live reload remains a manual check.

### 2026-09-07 — Tree recursion walkthrough and node highlighting

- Keeps the enclosing tree visible through recursive subtree and empty-child calls.
  Child mutations update that diagram without changing earlier snapshots.
- Adds current-node, active-path, entered and returned states; actual call/return
  edges show directional arrows (returns are dashed).
- Shows first-entry order with clickable timeline jumps and the last eight call/
  return events. This is call-entry order, not an assumed preorder output.
- Stack frames label the tree argument value, including None. Tree traversal
  cards appear before the stack/details so the diagram is visible immediately.
- Traversal inference requires an unambiguous tree parameter in an observed
  recursive function. Multiple-tree-argument algorithms retain variable pointers
  without guessing which argument is being traversed. Serialization/depth limits
  still apply; a return does not prove every descendant was explored.
- Added seven regression tests for context, None, duplicate values, right-first
  order, early exit, mutations, ambiguity, backward history and entry navigation.
- Validation: 123 Vitest tests, lint, production build, Pyodide smoke and gallery
  passed; inspected the rendered panel at 400px width. Python source unchanged.
- Live LeetCode check remains: trace a tree DFS, step into None and back out,
  scrub backward, and select an entry chip. Reload the extension from dist first.
- Preview browser profile files are already tracked despite .gitignore; reverted
  only the generated profile/screenshot changes from this session.

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
