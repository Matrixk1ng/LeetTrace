# Backtracking refinement

Latest status: approved in the combined batch and implemented with real trace operations. See [batch implementation](BATCH_IMPLEMENTATION.md). The proposal notes below retain their historical scope.

Status: rejected by the user as confusing; retained as a historical proposal.
The next requested slice is [recursion and DP](./RECURSION_DP_REFINEMENT_PLAN.md),
with nested calls/returns and a distinct bottom-up table. Backtracking is deferred.
No extension implementation in this pass.

Open [interactive preview](./previews/backtracking-refinement.html). It uses a
complete illustrative Subsets walkthrough for `[1, 2]`, starts at the first undo,
and supports event playback, rewind, result inspection, expandable call arguments,
and 400/550px widths.

## Proposed presentation

- Make the live partial answer the main visual: compact path tiles rather than
  a rapidly expanding decision tree. Keep the existing navy/cyan design.
- Show considering (amber), appended choices (cyan), and removed values (violet,
  struck through and explicitly outside the live path). Include before/after text.
- Give saved copies their own strip, with the latest save in green and a count.
  Click a result to see its save event. Rewind hides results not yet recorded.
- Reuse parameterized call stacks. Expanded frames distinguish entry arguments,
  shared path at entry, and live shared path. The path is a closure in this example,
  not a function parameter.
- Separate call, return, caller resume, and undo. A return never implies a pop,
  pruning, failure, or a recorded answer. Preserve exact controls in the app.

## Bounded implementation after approval

1. Audit real Python traces for list mutation identity, aliases, recursive frames,
   and source metadata. Start with append/recurse/pop and append(path.copy()).
2. Build conservative observed-effect metadata. Claim completed appends/pops only
   after matching before/after values and the executed statement; compare effects
   across the appropriate frame boundary without attributing child mutations to
   caller statements. Never re-evaluate user code.
3. Bind a working path and result collection only with sufficient evidence. Avoid
   relying on variable names or assuming every recursive list is a partial answer.
   Unknown patterns keep ordinary list and call-stack views.
4. Render path, saved copies, and event navigation in the approved arrangement.
   Shared references in results must not be labelled frozen copies. Immutable
   `path + [choice]`, swapping permutations, pruning and multi-path algorithms
   need separate evidence and may initially use the neutral fallback.
5. Verify Subsets and Combination Sum traces, duplicate values, empty input,
   early return without undo, saved aliases versus copies, rewind, and deep calls.
   Review real rendered fixtures at both panel widths before the next family.

The preview's tiny input makes all four results visible. Production should bound
rendering for large result sets and preserve access to captured values. No new
motion is required; all states are readable without animation or hover.
