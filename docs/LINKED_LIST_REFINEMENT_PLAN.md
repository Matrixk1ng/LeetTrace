# Linked-list refinement

Status: approved and implemented locally. [Open interactive concept](previews/linked-list-refinement.html).

Start with iterative reversal. Keep nodes in stable positions, label their identity
separately from their value, and show pointer aliases on the same node. Separate
four completed operations: save next, rewrite a link, move prev, move curr.
Draw a directed arrow from each node to its actual next node (or None), reversing
its direction when that link changes. Highlight the changed arrow in green and
show the paths reachable from prev and curr. Arrows track layout resizing.
The original head remains attached to its original node unless reassigned.

The preview includes duplicate values, empty input, node inspection, history
rewind and 400/550 px widths. Paths below the diagram refer to the same nodes,
not copies. A saved None is distinct from a pointer not yet assigned.

Implemented a combined view from serialized nodes reachable through current
variables, preserving first-observed ordering within the current call. Link
changes and variable assignments compare consecutive states, so a link rewrite
is separate from moving prev/curr. Head remains attached to its original node.
No algorithm steps are guessed from variable names. Returns remain actual trace
values; the code highlight is the upcoming line, not a completed statement.

The view includes arrows (green on changes), inspection, alias paths and clickable
prefix-only history. It renders up to 40 nodes with horizontal scrolling and
explicit offscreen destinations; paths stop at 12 nodes or a detected cycle.
Unreachable historical nodes have unknown state and no stale outgoing arrows.
An entirely empty input retains the existing None variable display because it
contains no serialized ListNode identity. Recursive calls retain separate scope.

Four regression tests use a real Python reversal trace, including duplicates,
link/pointer event separation, history rewind and unreachable-node handling.
Next review: [slow / fast cycle detection](SLOW_FAST_REFINEMENT_PLAN.md).
