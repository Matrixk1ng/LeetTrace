# Binary tree + DFS refinement

Status: approved and implemented locally. Call-stack parameters were added for
all traced functions, including numeric recursion, not just tree DFS.

Actual implementation: [400px](./previews/dfs-implementation.png) /
[550px](./previews/dfs-implementation-550.png). Gallery fixtures use real Python
BST and unique-paths traces, including the caller's arguments at every depth.

Parameters are captured at call entry (including bound defaults, keyword-only,
positional-only, varargs and kwargs), excluding self/cls and closure variables.
Expand a frame for recorded argument values; summaries abbreviate large values.
Entry values remain stable after local reassignment/mutation. The locals inspector
continues to show current values. Existing traces without argument metadata need
to be rerun to populate these details.

[Interactive preview](./previews/dfs-refinement.html) · [400px image](./previews/dfs-concept.png)

## Proposed changes

Keep the whole enclosing tree as the main diagram. Cyan now identifies the current
call consistently with BFS; thin cyan edges show its ancestors. A dashed violet
arrow shows a return toward the caller. Green means the node's call returned,
not that all descendants were visited. Unentered branches remain visible and muted.

Put a compact recursion stack immediately below the tree, with the active call
at the top. Show `dfs(node = 4)` instead of repeated unqualified function names.
At a return event, the top frame says Returning and stays on the stack until the
following snapshot. During a None call, show an empty-child placeholder, not a
fake tree node or an extra entry in traversal order.

Make nodes keyboard/click selectable. Inspection shows node value and its first
entry; a separate First call action jumps there. Selecting an unentered node
doesn't jump into future history. Keep first-entry chips compact and put longer
call history and locals into drawers. Retain exact stepping in the extension;
the standalone preview only demonstrates illustrative event transitions.

## Implemented refinement

1. Refine TreeViz using its existing traversal metadata; align current/path/return
   styles, reduce padding and add node inspection. Keep bounded-depth expansion.
2. Bring the compact stack into the tree section and avoid duplicate stack cards.
   Reuse recorded frame identities and handle None/return snapshots correctly.
3. Add previous/next recorded call/return jumps while preserving line controls.
   Respect reduced motion and avoid replaying misleading forward movement on rewind.
4. Verify with real Python fixtures and 400/550px browser renders. Cover duplicate
   node values, early return, right-first calls, deep/skewed trees, shared aliases,
   mutations and backwards navigation. Update the progress log before the next pass.

## Boundaries

Reuse the existing call-entry order and node identities. Do not rename entry order
to traversal output, assume preorder processing, infer success/pruning from a
return, or fabricate line numbers and return values. The preview is a partial
illustrative event sequence; its static tree is not the execution engine.

This pass covers binary trees and recursive DFS. Choose/undo, result accumulation,
and decision trees belong to the following backtracking pass. Graph DFS and memo
hits require their own semantic support and are outside this refinement.
