# Sliding-window refinement

Status: approved and implemented locally. User confirmed the two-pointer
implementation works and approved the fixed-window preview.

[Interactive fixed-window concept](./previews/sliding-window-refinement.html).

## Implemented support and limits

- Builtin integer lists, zero or builtin `sum(nums[lo:hi])` initialization,
  `total += nums[index]` / `total -= nums[index]`, and a width established by
  outgoing `right-k` indexing or a `right-left+1 == k` / `>= k` guard.
- Membership changes only after the observed accumulator equals the expected
  completed effect. It remains separate from raw pointer values and handles
  partial windows and add-before-remove oversized windows without invented checks.
- Full-window `best = max(best, total)` writes establish checks and improved
  recorded-result indices. Negative values work; tied results retain earlier
  recorded indices. Until an improvement is observed, no best range is guessed.
- Array mutation, changed width, unexplained totals, unknown initial aggregates,
  custom types, unsupported syntax and arrays over 2,000 entries fall back to the
  ordinary views. Float averages, direct conditional best assignments and
  variable-size constraints are not yet semantic adapters. Actual variables and
  return values remain available through the existing inspector/trace.
- Cell inspection, 12-cell paging, clipped-boundary notices, 30-entry checked-window
  history, and exact event jumps. Tree/BFS/recursion views retain routing priority.

Real app renders: [400px](./previews/sliding-window-implementation-400.png) /
[550px](./previews/sliding-window-implementation-550.png). Generate fixtures with
`npm run gallery`. Reload the extension, refresh LeetCode, and run a new Trace.

Next requested preview: [variable-size windows](./VARIABLE_WINDOW_REFINEMENT_PLAN.md),
with a [separate interactive concept](./previews/variable-window-refinement.html).

## First slice: fixed-size maximum-sum window

One band groups all values currently included in the running total. This replaces
the pair-oriented view: interior values matter as much as the endpoints. Keep
index/value inspection and the existing navy/cyan style. Use violet/dashed styling
for a just-removed value and green for the best recorded result.

The preview separates adding, removing, checking a full window, and saving a best
result. After a removal the window temporarily contains two values; it must return
to size three before competing for the best. Current total and best total appear
side by side, with the best's own indices. A completed-window history supports
rewind. All-negative and tied-result examples check that zero is not treated as
an initial best and that the earlier best window remains when totals tie.

These are illustrative semantic boundaries, not exact Python lines. Including or
removing a value also changes the conceptual included range in this fixture.
Production must distinguish observed accumulator membership from raw pointer
positions while separate pointer/accumulator statements are still in progress.

## Original implementation criteria

1. Audit actual fixed-window loops and trace/source bindings: container, included
   range, aggregate, width, and optional best-result state. No naming-only routing.
2. Keep pointer bounds, accumulator updates, checks and best writes separate.
   Only display an aggregate equation when its operands/effect are established;
   otherwise show the actual variable value with neutral explanatory text.
3. Confirm full-window checks and best-result updates from observed execution.
   Do not infer best-window indices just because a scalar has a variable name
   such as `best`. Mutation, aliases and ambiguous bindings retain ordinary views.
4. Render the band, current/best state and exact event navigation, with bounded
   paging that makes clipped window boundaries explicit on long arrays.
5. Test k=1, k=len(array), incomplete windows, negative values, ties, rewind,
   separate pointer updates, mutated arrays and opposite update orders. Review
   actual app fixtures at 400px and 550px before the next family.

Variable-size windows (expand/shrink to satisfy a constraint), character-frequency
windows, and monotonic-deque windows require their own semantics. Start a separate
variable-window preview after this slice rather than presenting all of them as a
fixed-size sum. Binary search remains a later distinct visual pass.
