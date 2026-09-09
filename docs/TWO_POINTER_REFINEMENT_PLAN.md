# Array and two-pointer refinement

Status: approved and implemented locally.

[Interactive concept](./previews/two-pointer-refinement.html).

## Implemented first slice

The panel now recognizes a simple pair-sum assignment such as
`total = nums[left] + nums[right]` for a builtin integer list and two distinct
index variables. Both indices remain labelled when colocated; pointer buttons
navigate to distant positions and out-of-range indices are reported explicitly.
Large arrays show 12 cells at a time, preserving absolute indices and inspection.

Python records the upcoming pair, confirms the completed sum on the next line,
and observes entry into a simple comparison's branch. The UI shows the exact
operator and True/False outcome. Pointer changes are separate observations, with
the old pair's equation explicitly labelled when positions have moved. Comparison
history retains the last 30 entries and jumps to their original snapshot indices.
Rewind uses only the visible prefix, never future comparison results.

The implementation deliberately uses neutral, observed explanations instead of
claiming sorting or proving an elimination rule. It does not mute allegedly
discarded values or announce a solution solely because a comparison succeeded.
Actual return values remain visible. Custom containers, non-integer values,
compound comparisons, side-effecting indices, same-line ambiguity and containers
over 2,000 entries fall back to existing visualizers. Direct inline pair expressions
without a named sum, palindrome scans, partitioning and other two-pointer families
remain follow-up slices. Existing ArrayViz remains the neutral structural fallback.

Real-trace gallery files are generated at
`tests/dev/refinement.local/two-pointer-{400,550}.html`. Reload the extension,
refresh LeetCode, and run a new Trace to capture the added metadata.

Browser-reviewed implementation: [400px](./previews/two-pointer-implementation-400.png)
and [550px](./previews/two-pointer-implementation-550.png).

The next slice returns to arrays/two pointers after the approved recursion/DP
implementation. Start with sorted two-sum; sliding windows and binary search
retain their own later passes. Traditional backtracking is still deferred.

## Presentation

- One array row, indices above values and full pointer names directly below their
  cells. Cyan/solid left and amber/dashed right are identities, not success states.
  Both labels remain visible when pointers meet; duplicate values remain distinct.
- Separate read, comparison, pointer update and result events. On a movement step,
  any displayed equation is explicitly the previous pair's comparison, never a
  stale sum presented as the newly selected pair's result.
- Explain the direction of movement for the verified sorted two-sum example.
  Show which pointer stayed still. Mute cells outside the current interval without
  removing their values or claiming they were visited.
- A compact pair history supports rewind to actual comparisons. Rewind hides
  comparisons and moves that have not happened yet. Cells support click and
  keyboard inspection, without hover-only explanations.
- Three complete illustrative cases: a found pair, pointers meeting without a
  pair, and duplicate values. Use zero-based indices consistently. Widths 400/550.

## Original implementation sequence

1. Refine the existing ArrayViz pointer labels and inspection first. Preserve
   long-array navigation, overlapping pointers, out-of-range positions and values.
2. Add statement-local one-dimensional index bindings. Only proven indexing names
   become pointers; unrelated counters and stale function-wide references do not.
3. Derive completed pointer movements from same-frame observations and matching
   source statements. Keep exact source stepping and existing structured values.
4. Add comparison/event history only with evidence of actual operand evaluation
   and outcome. Never eval user code to manufacture a comparison or its reason.
   Generic arrays use neutral labels; sorted-two-sum explanations require proof
   of the recurrence/branch relationship and sorted input. Abstain when ambiguous.
5. Verify movement in both directions, duplicate values, rewinding, meeting or
   crossing pointers, empty/single-element inputs, side-effecting expressions,
   mutation and long-array boundaries. Review actual app renders at both widths.

This preview does not implement palindrome scans, partitioning, fast/slow pointers
or arbitrary two-pointer prose. Those can reuse the visual foundation while their
semantics receive separate trace-backed support.
