# Variable-size window proposal

Status: approved and implemented locally. This follows the implemented fixed-size
window slice. [Open preview](./previews/variable-window-refinement.html).

## Implemented scope

- Strictly positive builtin integer lists, positive target, observed accumulator
  initialization/add/remove membership, and a direct `while total >= target` loop
  containing the removal. The condition is pending at its line and confirmed by
  subsequent loop-body entry or exit. Arithmetic clears old condition outcomes.
- `best = min(best, right - left + 1)` records an improved length only after the
  actual assignment completes, with the tracked membership matching both bounds.
  A qualifying window is not automatically an improved answer. Ties keep the
  earlier recorded indices; no solution leaves the recorded best unset.
- Existing paging, inspection and event jumps now show included values, condition
  status, current length/sum, shortest saved window and valid-window history.
  Rewind contains no later condition outcomes or best-result updates.
- Nonpositive input/target, custom values/functions, compound/reversed conditions,
  direct best assignments, mutation, unexplained totals and other constraints
  abstain or retain neutral state. No eval or additional calls to user functions.
  These are first-slice semantics, not general frequency/deque-window support.

Real-trace renders: [400px](./previews/variable-window-implementation-400.png) /
[550px](./previews/variable-window-implementation-550.png). `npm run gallery`
generates the HTML fixtures under `tests/dev/refinement.local`.
Reload the extension and LeetCode tab, then run a new Trace for the new metadata.

Next review: [binary-search plan](./BINARY_SEARCH_REFINEMENT_PLAN.md) and
[interactive preview](./previews/binary-search-refinement.html).

Use minimum-length subarray sum with strictly positive integers as the first
example. Show included values, the total/target condition, current length and the
shortest recorded length. Separate expand, check, save and shrink. Validity does
not imply a better answer, and saved answer indices do not follow the active band.
Include no-solution and single-element-answer cases, rewind, cell/history
inspection, and 400/550 widths.

The approved direction extends observed aggregate membership with evidence-backed while
condition outcomes and minimum-length result assignments. Keep raw pointers and
membership separate across subtract/advance statements. Only explain monotonic
positive-sum behavior when the input and loop provide evidence. Negative inputs,
frequency-map constraints, distinct-character windows and deque extrema need
their own adapters or neutral fallback. Preserve exact stepping and limits.

The preview groups conceptual boundary changes and arithmetic; production must
use actual snapshots and distinguish condition evaluation from outcome/updates.
Binary search follows this separate variable-window pass.
