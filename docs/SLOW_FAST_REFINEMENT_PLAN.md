# Slow / fast pointers and cycle detection

Latest status: approved in the combined batch and implemented with real trace operations. See [batch implementation](BATCH_IMPLEMENTATION.md). The proposal notes below retain their historical scope.

Status: preview awaiting review. [Open preview](previews/slow-fast-refinement.html).

Keep the node-and-arrow design from linked-list reversal. Distinguish slow's
single hop from fast's two-hop assignment, then show the equality check separately.
The intermediate node in a two-hop assignment is explained in text; fast is not
shown assigned there. Opposing links use separate arrow lanes.

The interactive examples cover a cycle, an acyclic list and empty input, with
inspection, rewind and 400/550 px widths. Starting both pointers at head does
not claim a cycle. A meeting is reported only at the comparison; returning False
follows an observed stopping guard. This is illustrative preview logic only.

After approval, add conservative source/runtime bindings for pointer hop
assignments and direct identity/equality checks on ordinary ListNode instances.
Do not evaluate user comparisons a second time. Distinguish None from a missing
variable, retain generic views for unknown/custom node behavior, and test cycles
with duplicate values and self-loops. Finding the cycle entrance is a later slice.
