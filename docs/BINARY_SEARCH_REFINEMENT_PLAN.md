# Binary-search refinement

Status: approved and implemented locally. [Open concept](./previews/binary-search-refinement.html).

Start with exact-match binary search on a sorted integer array using inclusive
low/high bounds. Show the candidate interval, midpoint calculation, comparison,
then a separate bound update. After movement the old midpoint and equation are
explicitly previous values; the new interval has no active midpoint until one is
computed. An empty interval contains no highlighted candidate or midpoint.

Found, absent, duplicate-value and empty-array cases are interactive, with cell
inspection, comparison-history jumps, rewind, and 400/550 widths. Duplicate cases
promise any matching index, not first/last occurrence. Indices stay zero-based.

The tracer binds inclusive `while low <= high`, a single midpoint assignment
using `(low + high) // 2` or `low + (high - low) // 2`, and a directly indexed
array. Names are source-derived. Runtime checks require a sorted builtin integer
list of at most 2,000 values with JavaScript-safe integers and valid inclusive
bounds (including low=len / high=-1 for empty intervals).

Direct midpoint comparisons against an integer name/literal record outcomes only
after branch entry/exit establishes them. Custom comparisons retain neutral
operation labels. Half-open, rotated, answer-space and first/last-occurrence
searches do not receive specialized claims. Data replacement/mutation discards
the previous observation state. Return values are displayed as recorded, without
inferring that an equal comparison necessarily causes a return.

The panel shows candidate bounds, fresh midpoint, recorded comparison, cell
inspection, 12-cell paging and event/history navigation. History is prefix-only
when rewinding; previous comparisons include the bounds where they were observed.
Green marks an observed true equality, not a predicted answer.

Verified with 5 Python and 3 TypeScript regression tests for this slice; full
suite 153 Python / 161 TypeScript tests, lint/build/gallery/Pyodide smoke passed.
Actual renders: [400 px](previews/binary-search-implementation-400.png),
[550 px](previews/binary-search-implementation-550.png).
Live LeetCode integration still needs a reload, page refresh and fresh trace.

Next review: [linked-list reversal](LINKED_LIST_REFINEMENT_PLAN.md).
