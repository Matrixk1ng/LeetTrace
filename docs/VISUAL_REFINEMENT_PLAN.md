# Visual refinement proposal

Current status: the user approved all remaining previews in one batch, and the
bounded trace-backed implementation is in place. See
[implementation scope and validation](BATCH_IMPLEMENTATION.md).

The user requested all remaining previews in one batch.
See the [review gallery](previews/batch/index.html) and
[family/example checklist](BATCH_REFINEMENT_REVIEW.md). Corrections and consolidated
approval precede a combined implementation batch. The earlier per-slice sequence
below records the work already completed.

Status: direction approved. Grid/BFS implementation is ready for live review:
matrix/queue layout, statement references, tuple identity, relevant/other locals,
verified dequeued-state binding, observed queue/grid effects, fixed-loop frontier
grouping and previous/next event navigation. Exact line stepping remains intact.

Actual rendered implementation: [400px](./previews/grid-implementation.png) /
[550px](./previews/grid-implementation-550.png). These use the real Python tracer
with `tests/dev/grid-search-example.py`, not hand-authored semantic snapshots.

Reference: LeeTrace_Visualization_Refinement_Design_Doc_Final.docx, supplied by
the user. Its recommendations inform this proposal; its implementation checklist
is not authorization to implement everything. The user requested staged work and
a visual to approve first.

## Direction

Keep LeetTrace's navy surfaces, cyan accent, typography and compact panel identity.
Reduce nested cards and decorative padding. Give each structure one dominant
diagram with a short current-action summary and supporting state directly below.
Keep the actual Python values and exact trace available in expandable details.

Preview: [interactive BFS concept](./previews/refinement.html). Self-contained HTML;
open in a browser. Uses illustrative fixture states, not the execution engine.
Try Inspect → Update → Enqueue, step backward, inspect cells, expand details and
switch between 400px and 550px. The initial design pass did not change app source;
the approved implementation now covers the first foundation slice below.

The subsequent BFS semantics pass is also implemented. Boundaries require the
explicit builtin `range(len(q))` loop and consistent observed append/popleft
effects; unexplained mutations fall back to one queue lane. Layer pass is the
observed loop-pass count, not a claim about shortest distance or elapsed minutes.
Current-cell binding requires the dequeued coordinate names to map to grid axes,
directly or through an observed offset assignment. Ambiguous pairings abstain.
Condition pass/fail inference, elaborate motion and event markers on the main
scrubber remain future refinements. No predicate is re-evaluated to produce prose.

## First slice: grid + queue + BFS

1. Agree on the visual direction using this preview.
2. Refine matrix sizing, current/candidate markers and wrapped tuple sequences.
   Preserve values and provide click-accessible coordinates. No guessed state.
3. Add active-expression bindings and small Relevant now / Other locals groups.
   The old i/j must not annotate grid[nr][nc]; they remain in the inspector.
4. Add evidence-backed action/effects summaries and queue changes. At most one
   operation is asserted at a time: a condition, a write and an enqueue do not all
   happen on the same Python line. Label pre-execution versus completed effects.
5. Add frontier boundaries and event jumps only after their metadata is reliable.
   Keep existing exact stepping and scrubber. Ordinary queue fallback when the
   implementation has no proven level boundary.
6. Verify real traces at 400px and 550px and review this slice before proceeding.

Preview states use a level-based loop with the current cell already dequeued.
Current frontier contains only waiting items, never the active item. Next frontier
contains only items already appended; accepting a candidate alone doesn't add it.
Amber remains candidate, cyan remains current, and violet indicates newly queued.
Green is reserved for a confirmed condition or completed effect, not arbitrary
numeric cell values. The preview's exact-step labels are fixture references; it
only demonstrates event navigation, not actual line-by-line execution.

## Subsequent passes

Pass 2 is approved and implemented locally: [tree + DFS plan](./DFS_REFINEMENT_PLAN.md).
The [interactive preview](./previews/dfs-refinement.html) records the approved
direction. The live implementation also includes expandable call-entry parameters
for general recursion. The user rejected the path-focused backtracking concept.
The next requested slice is now [recursion and DP](./RECURSION_DP_REFINEMENT_PLAN.md):
[revised interactive preview](./previews/recursion-dp-refinement.html) with nested
calls/returns, optional memo, and a separate bottom-up table. The approved first
implementation is complete locally; its plan documents supported operations and
fallbacks. This moves recursion/DP ahead of the original order below; traditional
backtracking remains deferred.

Approved and implemented: [array + two pointers](./TWO_POINTER_REFINEMENT_PLAN.md), with an
[interactive sorted two-sum concept](./previews/two-pointer-refinement.html).
The first pair-sum/comparison slice is live locally; its plan records supported
operations and fallbacks. Sliding window remains the next separate preview.
The [fixed sliding-window slice](./SLIDING_WINDOW_REFINEMENT_PLAN.md) is approved
and implemented. The [variable-window slice](./VARIABLE_WINDOW_REFINEMENT_PLAN.md)
is also approved and implemented:
[interactive expand/shrink concept](./previews/variable-window-refinement.html),
its plan records supported syntax and fallbacks.
[Binary search](./BINARY_SEARCH_REFINEMENT_PLAN.md) is approved and implemented:
inclusive candidate intervals, fresh midpoint, observed comparisons and bound moves.
[Linked-list reversal](./LINKED_LIST_REFINEMENT_PLAN.md) is approved and implemented
with stable nodes, directed next arrows, alias paths and change history.
Next review: [slow / fast cycle detection](./SLOW_FAST_REFINEMENT_PLAN.md),
[interactive preview](./previews/slow-fast-refinement.html).

| Pass | Structures + algorithms | Refinement | Acceptance example |
|---|---|---|---|
| 2 | Tree + DFS | Tighten existing path/return view; compact stack with node values, selectable nodes, consistent color roles | Duplicate values, None calls, right-first traversal, early return, rewind |
| 3 | Path/stack + backtracking | Choose, recurse, record and undo beside actual path/result changes | Undo visibly restores path; returning alone never claims pruning |
| 4 | Array + two pointers | Readable indices, active comparison and pointer movement | Stale counters never become pointers |
| 5 | Array + sliding window, then binary search | Window band, then search interval/discarded regions | Respect inclusive/exclusive bounds and empty intervals |
| 6 | Linked list + stack/queue | Pointer rewiring; clear top/front/back and additions/removals | Shared node aliases, cycles, empty structures |
| 7 | Map/set + DP | Access/change emphasis; top-down memo and bottom-up dependencies as separate slices | Memo hit only with evidence; actual recurrence dependencies |
| 8 | Heap + priority queue | Existing heap tree with backing array and operation effects | No invented internal sift steps absent from trace |
| Later | Graph and specialized families | Audit support before scoping graph BFS/DFS, union-find, topo, Dijkstra, trie, intervals and sorting | Each receives its own preview and bounded implementation scope |

## Data and truthfulness constraints

The attachment assumes broad algorithm support. The repository currently has
dedicated structural renderers, pattern hints and exact snapshots; graph rendering
is still a stretch item. Rich semantic adapters are additional work, not a theme
change. Do not imply all families in the attachment are already supported.

- Relevant-expression metadata must be separate from runtime variable lifetime.
- Python line events occur before execution. Do not claim a condition passed
  because its line is highlighted. Outcomes need observed control flow/effects;
  don't re-evaluate user expressions with possible side effects.
- Serialization may lose tuple/list distinctions. Audit that boundary before
  routing coordinate tuples into a record-strip renderer.
- Avoid problem-specific prose in generic rendering. Preserve variable names
  such as `fresh` without interpreting every BFS counter as minutes or distance.
- Snapshot history remains exact. Semantic jumps index existing steps; they must
  not fabricate intermediate events or leak future changes on rewind.
- Preserve unknown/ambiguous states with neutral structural fallback.

## Shared acceptance criteria

Hero, action and essential state should be visible within a typical 400px × 850px
panel; details may scroll. Essential controls work by click and keyboard, not only
hover. Pair colors with labels/outlines, honor reduced motion, and animate only
observed changes (roughly 150–250ms). Preserve selected/custom testcases, editor
highlight synchronization, feedback, trace errors and execution limits.

For each slice: preview → user review → bounded implementation → focused trace
regressions → browser review → progress log → next slice. Monetization stays in
MONETIZATION.md; this work does not introduce a paywall.
