"""LeetTrace execution tracer.

Runs a user's LeetCode Python solution under ``sys.settrace`` and emits one
raw snapshot per traced event. This module is deliberately free of any Pyodide
or browser dependency: it is inlined into the Pyodide worker at build time
(``import tracer from './tracer.py?raw'``) *and* imported directly by the
pytest suite in ``tests/tracer/`` under plain CPython.

Public entry point: ``run_traced(code_string, examples) -> json string``.

Output shape (raw snapshot schema v2 — see docs/DESIGN.md section 4; the
TypeScript side adds ``dataStructures``/``highlights`` on top of this)::

    {
      "snapshots": [
        {"step", "line", "event", "frameId", "frameName", "callDepth",
         "variables": {name: {"value", "type", "changed", "kind"?}}, "stdout"?}
      ],
      "truncated": bool,
      "limit": "events" | "snapshots" | null,
      "indexing": {array: {"row": [names], "col": [names]}},
      "error": {"message": str, "line": int} | null,
      "returnValue": <serialized> | null
    }
"""

import ast
import collections
import json
import sys

# --------------------------------------------------------------------------
# Budgets
#
# MAX_SNAPSHOTS caps what we ship to the panel. MAX_EVENTS caps *execution*:
# without it, `while True: pass` keeps running after the snapshot cap turns
# tracing off and hangs the worker forever (bug B1). Both are enforced by
# raising LeetTraceLimitError from inside the trace function, which unwinds
# the user's code instead of letting it spin.
# --------------------------------------------------------------------------

MAX_SNAPSHOTS = 5000
MAX_EVENTS = 200000
MAX_STDOUT_CHARS = 200000

# Filename the user's code is compiled under. The trace function ignores every
# frame from anywhere else (stdlib internals, this module's own helpers).
#
# It must not be '<exec>': Pyodide's runPython() compiles with exactly that
# name, so this module's own frames would be indistinguishable from the user's
# once it is loaded in the browser — silently breaking the error-line walk and
# the next-example retry, in a way the CPython tests can't reproduce.
USER_FILENAME = '<leettrace-user-code>'


class LeetTraceLimitError(BaseException):
    """Raised from the trace function when a budget is exhausted.

    Subclasses BaseException, not Exception: it is raised *inside* the user's
    frame, and a solution wrapping its loop in `except Exception` would
    otherwise swallow the very error that stops the runaway execution.
    """


def configure(max_snapshots=None, max_events=None):
    """Override the budgets from the host (shared/constants.ts is the source
    of truth for both, so they stay in sync with what the panel reports)."""
    global MAX_SNAPSHOTS, MAX_EVENTS
    if isinstance(max_snapshots, int) and max_snapshots > 0:
        MAX_SNAPSHOTS = max_snapshots
    if isinstance(max_events, int) and max_events > 0:
        MAX_EVENTS = max_events


# Names that _build_namespace() injects (typing helpers, ListNode/TreeNode,
# stdlib modules). These are not user variables, so they should never appear
# as snapshot variables or count toward "is this snapshot interesting?".
_BASELINE_NAMES = frozenset({
    'List', 'Dict', 'Set', 'Tuple', 'Optional', 'Any', 'Union', 'Deque',
    'defaultdict', 'deque', 'Counter', 'OrderedDict',
    'math', 'heapq', 'bisect', 'functools', 'itertools',
    'ListNode', 'TreeNode', 'Solution',
})

# --------------------------------------------------------------------------
# Mutable trace state (reset by run_traced)
# --------------------------------------------------------------------------

_snapshots = []
# {frameId: {name: repr}} — previous locals per frame, so `changed` compares a
# frame against its own last step rather than whichever frame ran most recently
# (bug B8). Recursion and helper calls used to flip each other's flags.
_prev_locals = {}
_usage = {}
_user_max_line = 10 ** 9
_events = 0
_truncated = False
_limit_kind = None
_frames = {}
_frame_seq = 0
_stdout = None


class _StdoutCapture:
    """Collects print() output so each snapshot can carry what it emitted.

    Chunks are drained per snapshot, so appending is O(1) rather than
    re-reading a growing StringIO on every step.
    """

    def __init__(self):
        self.chunks = []
        self.total = 0

    def write(self, text):
        text = str(text)
        if self.total < MAX_STDOUT_CHARS:
            self.chunks.append(text)
            self.total += len(text)
        return len(text)

    def drain(self):
        if not self.chunks:
            return None
        out = ''.join(self.chunks)
        self.chunks = []
        return out

    def flush(self):
        pass

    def isatty(self):
        return False


# --------------------------------------------------------------------------
# Serialization
# --------------------------------------------------------------------------

def _serialize(v, _depth=0):
    if v is None or isinstance(v, (bool, int, float, str)):
        return v

    if isinstance(v, (list, tuple)):
        return [_serialize(x, _depth + 1) for x in v]

    if isinstance(v, dict):
        return {str(k): _serialize(val, _depth + 1) for k, val in v.items()}

    if isinstance(v, collections.deque):
        # deque is not a list subclass and has no val/next, so without this it
        # fell through to repr() and rendered as a garbage string (bug B4).
        return {
            '__type': 'deque',
            'items': [_serialize(x, _depth + 1) for x in v],
        }

    if isinstance(v, (set, frozenset)):
        try:
            items = sorted([_serialize(x, _depth + 1) for x in v], key=str)
        except Exception:
            items = [_serialize(x, _depth + 1) for x in v]
        return {
            '__type': 'set',
            'items': items,
            'frozen': isinstance(v, frozenset),
        }

    if (hasattr(v, 'val') and hasattr(v, 'next')
            and not hasattr(v, 'left') and not hasattr(v, 'right')):
        nodes = []
        # Node identities, so the TS side can tell that `slow` points at index 2
        # of `head` rather than being a separate three-node list of its own.
        # Stringified because id() is a machine address and can exceed 2**53,
        # which JSON numbers can't carry losslessly into JS.
        node_ids = []
        seen = set()
        cur = v
        has_cycle = False
        cycle_index = -1
        while cur is not None:
            node_id = id(cur)
            if node_id in seen:
                has_cycle = True
                cycle_index = node_ids.index(str(node_id))
                break
            seen.add(node_id)
            node_ids.append(str(node_id))
            nodes.append(_serialize(cur.val))
            cur = cur.next
        return {
            '__type': 'linked_list',
            'nodes': nodes,
            'nodeIds': node_ids,
            'has_cycle': has_cycle,
            'cycleIndex': cycle_index,
        }

    if hasattr(v, 'val') and hasattr(v, 'left') and hasattr(v, 'right'):
        if _depth > 10:
            return repr(v)
        return {'__type': 'tree', 'root': _serialize_tree_node(v, _depth)}

    return repr(v)


def _serialize_tree_node(node, depth=0):
    if node is None or depth > 10:
        return None
    return {
        'id': str(id(node)),
        'val': _serialize(node.val),
        'left': _serialize_tree_node(getattr(node, 'left', None), depth + 1),
        'right': _serialize_tree_node(getattr(node, 'right', None), depth + 1),
    }


# --------------------------------------------------------------------------
# Trace function
# --------------------------------------------------------------------------

def _register_frame(frame):
    """Assign a stable id/name/depth to a frame on its 'call' event.

    id(frame) is reused once a frame is collected, so the registry entry is
    dropped on 'return' and the monotonic sequence number keeps ids unique
    across the whole trace (needed for per-frame `changed` and CallStackViz).
    """
    global _frame_seq
    _frame_seq += 1
    parent = _frames.get(id(frame.f_back))
    depth = (parent['depth'] + 1) if parent else 0
    name = frame.f_code.co_name
    info = {'id': name + '#' + str(_frame_seq), 'name': name, 'depth': depth}
    _frames[id(frame)] = info
    return info


def _frame_info(frame):
    return _frames.get(id(frame)) or _register_frame(frame)


def _is_class_body(frame):
    """True for the frame that executes a `class X:` suite.

    Running a class body is not an algorithm step — it would emit empty steps
    on the `class Solution:` line, and one whose only variable is the method
    object being defined, before the trace reaches any real code.

    Class bodies and module frames share their locals with a real dict, so
    they lack CO_OPTIMIZED (0x1), which every function frame has. That flag is
    set at compile time, unlike __qualname__, which isn't in f_locals yet when
    the body's first events fire.
    """
    return not (frame.f_code.co_flags & 0x1) and frame.f_code.co_name != '<module>'


def _collect_locals(frame, frame_id):
    previous = _prev_locals.get(frame_id, {})
    current = {}
    for k, v in frame.f_locals.items():
        if k.startswith('_') or k in _BASELINE_NAMES:
            continue
        try:
            entry = {
                'value': _serialize(v),
                'type': type(v).__name__,
                'changed': k not in previous or previous.get(k) != repr(v),
            }
            kind = _usage_kind(k, v)
            if kind:
                entry['kind'] = kind
            current[k] = entry
        except Exception:
            current[k] = {
                'value': repr(v),
                'type': type(v).__name__,
                'changed': True,
            }
    return current


def _remember_locals(frame, frame_id):
    _prev_locals[frame_id] = {
        k: repr(v) for k, v in frame.f_locals.items()
        if not k.startswith('_') and k not in _BASELINE_NAMES
    }


_HEAPQ_FUNCS = frozenset({
    'heappush', 'heappop', 'heapify', 'heappushpop', 'heapreplace',
})


def _analyze_usage(tree):
    """Static pass over the user's code for structures a value can't reveal.

    A heap and a stack are both just `list` at runtime — only how the code
    uses them says which is which, so it has to be read off the AST:
      * heap  — the name is the first argument to a heapq.* call
      * stack — the name gets both .append(x) and a no-argument .pop()
                (a .pop(0) is queue-like, so it doesn't count)
    """
    heaps = set()
    appended = set()
    popped = set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func

        if isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name):
            if fn.value.id == 'heapq' and fn.attr in _HEAPQ_FUNCS:
                if node.args and isinstance(node.args[0], ast.Name):
                    heaps.add(node.args[0].id)
            elif fn.attr == 'append':
                appended.add(fn.value.id)
            elif fn.attr == 'pop' and not node.args:
                popped.add(fn.value.id)
        elif isinstance(fn, ast.Name) and fn.id in _HEAPQ_FUNCS:
            # from heapq import heappush
            if node.args and isinstance(node.args[0], ast.Name):
                heaps.add(node.args[0].id)

    return {'heap': heaps, 'stack': (appended & popped) - heaps}


# Conventional pointer names. Used only to extend an association that static
# analysis already established — never to invent one — so `target = 9` still
# can't become an arrow on a 15-element array (bug B3).
_POINTER_NAMES = frozenset({
    'i', 'j', 'k', 'l', 'r', 'lo', 'hi', 'left', 'right', 'mid',
    'slow', 'fast', 'start', 'end',
})


# Fields holding type annotations. `List[int]` is a Subscript just like
# `nums[i]`, so walking into these would record `int` as an index of `List`.
_ANNOTATION_FIELDS = {
    ast.FunctionDef: ('returns',),
    ast.AsyncFunctionDef: ('returns',),
    ast.arg: ('annotation',),
    ast.AnnAssign: ('annotation',),
}


def _walk_code(node):
    """ast.walk, but skipping annotations — they aren't executable code."""
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        skip = _ANNOTATION_FIELDS.get(type(current), ())
        for field, value in ast.iter_fields(current):
            if field in skip:
                continue
            if isinstance(value, list):
                stack.extend(v for v in value if isinstance(v, ast.AST))
            elif isinstance(value, ast.AST):
                stack.append(value)


def _names_in(node):
    """Every Name id appearing in an expression."""
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def _len_arg(node):
    """`len(x)` -> 'x', else None."""
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id == 'len' and len(node.args) == 1
            and isinstance(node.args[0], ast.Name)):
        return node.args[0].id
    return None


def _record(mapping, array, index, axis):
    if not array or not index or array == index:
        return
    entry = mapping.setdefault(array, {'row': [], 'col': []})
    if index not in entry[axis]:
        entry[axis].append(index)


def _slice_name(node):
    """The variable a subscript indexes by, when the slice is just that name.

    `nums[i]` is direct evidence that `i` indexes `nums`. `nums[r - k]` is not
    evidence about `k` — it's evidence about the *expression*. Compound slices
    are handled separately, contributing only names already known for that
    array, so a window size can't become an arrow.
    """
    return node.id if isinstance(node, ast.Name) else None


def _analyze_indexing(tree):
    """Map each array name to the variables that actually index it (bug B3).

    The old heuristic made *every* in-range int a pointer on *every* array, so
    `target = 9` rendered as an arrow on a 15-element `nums` and counters like
    `n`/`total` showed up as pointers. Only these signals count:

      * ``arr[i]`` / ``arr[i + 1]``      — a real subscript
      * ``arr[i][j]``                    — i is a row axis, j a column axis
      * ``while i < len(arr)``           — a bound comparison
      * ``for i in range(len(arr))``     — a range over the array

    Returns ``{array: {'row': [names], 'col': [names]}}``. For a flat array
    everything lands in 'row'; 'col' is only populated by 2-D subscripts.
    """
    mapping = {}
    # (array, axis, names) for slices that aren't a bare name — replayed once
    # the strong signals are in, so `nums[r - k]` can reinforce `r` without
    # inventing `k`.
    compound = []

    for node in _walk_code(tree):
        # arr[i] and arr[i][j]
        if isinstance(node, ast.Subscript):
            inner = node.value
            if isinstance(inner, ast.Name):
                _record(mapping, inner.id, _slice_name(node.slice), 'row')
                compound.append((inner.id, 'row', _names_in(node.slice)))
            elif isinstance(inner, ast.Subscript) and isinstance(inner.value, ast.Name):
                array = inner.value.id
                _record(mapping, array, _slice_name(inner.slice), 'row')
                _record(mapping, array, _slice_name(node.slice), 'col')
                compound.append((array, 'row', _names_in(inner.slice)))
                compound.append((array, 'col', _names_in(node.slice)))

        # while i < len(arr) / if lo <= len(arr) - 1
        elif isinstance(node, ast.Compare):
            operands = [node.left] + list(node.comparators)
            arrays = [a for a in (_len_arg(o) for o in _walk_len(operands)) if a]
            if arrays:
                for operand in operands:
                    if isinstance(operand, ast.Name):
                        for array in arrays:
                            _record(mapping, array, operand.id, 'row')

        # for i in range(len(arr)) / range(1, len(arr))
        elif isinstance(node, ast.For):
            if isinstance(node.target, ast.Name) and isinstance(node.iter, ast.Call):
                call = node.iter
                if isinstance(call.func, ast.Name) and call.func.id == 'range':
                    for arg in call.args:
                        for sub_node in ast.walk(arg):
                            array = _len_arg(sub_node)
                            if array:
                                _record(mapping, array, node.target.id, 'row')

    for array, axis, names in compound:
        axes = mapping.get(array)
        if not axes:
            continue
        for name in names:
            if name in axes['row'] or name in axes['col']:
                _record(mapping, array, name, axis)

    _extend_with_companions(tree, mapping)
    return mapping


def _walk_len(operands):
    """Every sub-expression of the operands, so `len(arr) - 1` still counts."""
    for operand in operands:
        for node in ast.walk(operand):
            yield node


def _extend_with_companions(tree, mapping):
    """Attach the other half of a two-pointer loop.

    In `while left < right: ... nums[left] ...` only `left` subscripts `nums`,
    but `right` is plainly a pointer on the same array. Extend the association
    across a direct comparison — but only for conventional pointer names, so a
    `while i < target` can't turn `target` into an arrow.
    """
    groups = []

    for node in _walk_code(tree):
        # `while left < right` — both sides move over the same array.
        if isinstance(node, ast.Compare):
            operands = [node.left] + list(node.comparators)
            names = [o.id for o in operands if isinstance(o, ast.Name)]
            if len(names) >= 2:
                groups.append(names)

        # `mid = (lo + hi) // 2`, `lo = mid + 1` — the classic binary search
        # shape, where only `mid` ever subscripts the array.
        elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            target_names = [t.id for t in targets if isinstance(t, ast.Name)]
            value = getattr(node, 'value', None)
            if target_names and value is not None:
                groups.append(target_names + sorted(_names_in(value)))

    # A name joins an array's axis when it is grouped with a name already on
    # that axis. Repeat until nothing new is learned: `mid` teaches `lo` and
    # `hi` in one pass, and `lo = mid + 1` can then teach further names.
    for _ in range(4):
        changed = False
        for axes in mapping.values():
            for axis in ('row', 'col'):
                known = axes[axis]
                if not known:
                    continue
                for group in groups:
                    if not any(n in known for n in group):
                        continue
                    for name in group:
                        if name not in known and name in _POINTER_NAMES:
                            known.append(name)
                            changed = True
        if not changed:
            break


def _usage_kind(name, value):
    """Usage-derived kind for a variable, or None.

    Only meaningful for plain lists — the name could have been rebound to
    something else by the time this step runs.
    """
    if not isinstance(value, list):
        return None
    if name in _usage.get('heap', ()):
        return 'heap'
    if name in _usage.get('stack', ()):
        return 'stack'
    return None


def _tracer(frame, event, arg):
    global _events, _truncated, _limit_kind

    if frame.f_code.co_filename != USER_FILENAME:
        return None

    _events += 1
    if _events > MAX_EVENTS:
        _truncated = True
        _limit_kind = 'events'
        raise LeetTraceLimitError(
            'Execution stopped after ' + str(MAX_EVENTS)
            + ' steps — this looks like an infinite loop.'
        )

    if event == 'call':
        info = _register_frame(frame)
    else:
        info = _frame_info(frame)

    is_module_frame = info['name'] == '<module>'

    # Suppress snapshots for the auto-injected runner stub (lines beyond the
    # user's original code). We still keep tracing because calls into the
    # user's method body originate from there.
    if frame.f_lineno > _user_max_line:
        return _tracer

    if event == 'exception':
        return _tracer

    if event not in ('line', 'call', 'return'):
        return _tracer

    if _is_class_body(frame):
        return _tracer

    # The module frame's own call/line/return events are the class definition
    # and the runner stub — never user algorithm steps.
    if is_module_frame:
        if event != 'line':
            return _tracer

    if len(_snapshots) >= MAX_SNAPSHOTS:
        _truncated = True
        _limit_kind = 'snapshots'
        raise LeetTraceLimitError(
            'Stopped after ' + str(MAX_SNAPSHOTS) + ' steps.'
        )

    current_locals = _collect_locals(frame, info['id'])

    if event == 'return':
        # Surface the returned value as a synthetic 'return' variable so the
        # user can see the function's result on the final snapshot.
        if not is_module_frame and arg is not None:
            try:
                current_locals['return'] = {
                    'value': _serialize(arg),
                    'type': type(arg).__name__,
                    'changed': True,
                }
            except Exception:
                current_locals['return'] = {
                    'value': repr(arg),
                    'type': type(arg).__name__,
                    'changed': True,
                }

    # Skip class-definition / runner-stub line events that have no user
    # variables — these would otherwise show up as empty "junk" steps before
    # the real method body executes.
    if is_module_frame and not current_locals:
        return _tracer

    snapshot = {
        'step': len(_snapshots),
        'line': frame.f_lineno,
        'event': event,
        'frameId': info['id'],
        'frameName': info['name'],
        'callDepth': info['depth'],
        'variables': current_locals,
    }

    if _stdout is not None:
        emitted = _stdout.drain()
        if emitted:
            snapshot['stdout'] = emitted

    _snapshots.append(snapshot)
    _remember_locals(frame, info['id'])

    if event == 'return':
        _frames.pop(id(frame), None)
        _prev_locals.pop(info['id'], None)

    return _tracer


# --------------------------------------------------------------------------
# Execution namespace
# --------------------------------------------------------------------------

def _build_namespace():
    # LeetCode prepends these imports invisibly. Replicate them so user code
    # that uses List[int], Optional[ListNode], etc. works without modification.
    from typing import List, Dict, Set, Tuple, Optional, Any, Union, Deque
    from collections import defaultdict, deque, Counter, OrderedDict
    import math
    import heapq
    import bisect
    import functools
    import itertools

    class ListNode:
        def __init__(self, val=0, next=None):
            self.val = val
            self.next = next

    class TreeNode:
        def __init__(self, val=0, left=None, right=None):
            self.val = val
            self.left = left
            self.right = right

    return {
        'List': List, 'Dict': Dict, 'Set': Set, 'Tuple': Tuple,
        'Optional': Optional, 'Any': Any, 'Union': Union, 'Deque': Deque,
        'defaultdict': defaultdict, 'deque': deque,
        'Counter': Counter, 'OrderedDict': OrderedDict,
        'math': math, 'heapq': heapq, 'bisect': bisect,
        'functools': functools, 'itertools': itertools,
        'ListNode': ListNode, 'TreeNode': TreeNode,
    }


# --------------------------------------------------------------------------
# Input builders (bug B2 — see docs/DESIGN.md section 6)
#
# LeetCode examples are scraped as flat text ("head = [1,2,4], pos = 1"), but
# problems typed Optional[ListNode] / Optional[TreeNode] need real node objects
# or the user's first `head.val` raises AttributeError. We read the method's
# annotations off the AST and convert each argument before the call.
# --------------------------------------------------------------------------

def _to_list_node(values, list_node_cls):
    if values is None:
        return None
    if not isinstance(values, (list, tuple)):
        return values
    head = None
    tail = None
    for v in values:
        node = list_node_cls(v)
        if head is None:
            head = node
        else:
            tail.next = node
        tail = node
    return head


def _link_cycle(head, pos):
    """Connect the tail of a linked list back to index `pos` (LeetCode's
    cycle encoding: pos == -1 means no cycle)."""
    if head is None or not isinstance(pos, int) or pos < 0:
        return head
    nodes = []
    cur = head
    while cur is not None:
        nodes.append(cur)
        cur = cur.next
    if pos >= len(nodes):
        return head
    nodes[-1].next = nodes[pos]
    return head


def _to_tree_node(values, tree_node_cls):
    """Level-order build with None gaps — LeetCode's standard encoding."""
    if values is None:
        return None
    if not isinstance(values, (list, tuple)):
        return values
    items = list(values)
    if not items or items[0] is None:
        return None

    root = tree_node_cls(items[0])
    queue = [root]
    head = 0
    i = 1
    while i < len(items) and head < len(queue):
        node = queue[head]
        head += 1

        if i < len(items):
            val = items[i]
            i += 1
            if val is not None:
                node.left = tree_node_cls(val)
                queue.append(node.left)

        if i < len(items):
            val = items[i]
            i += 1
            if val is not None:
                node.right = tree_node_cls(val)
                queue.append(node.right)

    return root


def _from_list_node(node):
    values = []
    seen = set()
    cur = node
    while cur is not None:
        if id(cur) in seen:
            break
        seen.add(id(cur))
        values.append(cur.val)
        cur = cur.next
    return values


def _from_tree_node(root):
    """Inverse of _to_tree_node: level order with None gaps, trailing Nones
    trimmed (matches how LeetCode prints tree answers)."""
    if root is None:
        return []
    out = []
    queue = [root]
    head = 0
    while head < len(queue):
        node = queue[head]
        head += 1
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(getattr(node, 'left', None))
        queue.append(getattr(node, 'right', None))
    while out and out[-1] is None:
        out.pop()
    return out


def _convert_return(value):
    """Convert a returned ListNode/TreeNode back to its list encoding so the
    result is readable (section 6.3). Everything else passes through."""
    if value is None:
        return None
    if (hasattr(value, 'val') and hasattr(value, 'next')
            and not hasattr(value, 'left') and not hasattr(value, 'right')):
        return _from_list_node(value)
    if hasattr(value, 'val') and hasattr(value, 'left') and hasattr(value, 'right'):
        return _from_tree_node(value)
    if isinstance(value, (list, tuple)):
        return [_convert_return(x) for x in value]
    return _serialize(value)


def _classify_annotation(text):
    """Map an unparsed annotation to a converter kind, or None to pass through."""
    if not text:
        return None
    t = text.replace(' ', '')
    is_sequence = t.startswith('List[') or t.startswith('list[')
    if 'ListNode' in t:
        return 'list_of_list_node' if is_sequence else 'list_node'
    if 'TreeNode' in t:
        return 'list_of_tree_node' if is_sequence else 'tree_node'
    return None


def _method_signature(fn_node):
    """(param_names, {param: annotation_kind}) for a FunctionDef, minus self."""
    args = fn_node.args
    params = [a.arg for a in (list(args.posonlyargs) + list(args.args)) if a.arg != 'self']
    kinds = {}
    for a in list(args.posonlyargs) + list(args.args) + list(args.kwonlyargs):
        if a.arg == 'self':
            continue
        if a.arg not in params:
            params.append(a.arg)
        annotation = None
        if a.annotation is not None:
            try:
                annotation = ast.unparse(a.annotation)
            except Exception:
                annotation = None
        kind = _classify_annotation(annotation)
        if kind:
            kinds[a.arg] = kind
    return params, kinds


def _parse_example(example):
    """Parse "nums = [2,7,11,15], target = 9" into {'nums': [...], 'target': 9}.

    Wrapping in dict(...) and reading the AST keywords is safer than eval and
    still handles LeetCode's JSON-ish literals once null/true/false are mapped
    onto their Python spellings.
    """
    if not example or not isinstance(example, str):
        return None

    text = example.strip()
    if text.lower().startswith('input:'):
        text = text[len('input:'):].strip()

    try:
        wrapped = ast.parse('dict(' + text + ')', mode='eval')
    except SyntaxError:
        return None

    call = wrapped.body
    if not isinstance(call, ast.Call) or call.args or not call.keywords:
        return None

    out = {}
    for kw in call.keywords:
        if kw.arg is None:
            return None
        try:
            out[kw.arg] = _literal(kw.value)
        except Exception:
            return None
    return out


def _literal(node):
    """literal_eval, but tolerating the unary minus / JSON spellings that
    ast.literal_eval already handles plus bare names mapped earlier."""
    if isinstance(node, ast.Name):
        if node.id == 'null':
            return None
        if node.id == 'true':
            return True
        if node.id == 'false':
            return False
    if isinstance(node, (ast.List, ast.Tuple)):
        return [_literal(e) for e in node.elts]
    if isinstance(node, ast.Dict):
        return {_literal(k): _literal(v) for k, v in zip(node.keys, node.values)}
    return ast.literal_eval(node)


def _build_call_args(raw, params, kinds, namespace):
    """Match scraped example keys onto the method's parameters and convert the
    object-typed ones. Extra keys (LeetCode's `pos` for cycle problems) are
    consumed rather than forwarded, so the call never TypeErrors on them."""
    list_node_cls = namespace['ListNode']
    tree_node_cls = namespace['TreeNode']

    # Only forward keys that name a real parameter. An example scraped from a
    # different problem section binds nothing, the call raises TypeError before
    # entering the user's body, and run_traced moves on to the next example —
    # deliberately preferred over guessing a positional mapping, which would
    # run the solution on silently wrong arguments.
    matched = {k: v for k, v in raw.items() if k in params}
    extras = {k: v for k, v in raw.items() if k not in params}

    args = {}
    for name, value in matched.items():
        kind = kinds.get(name)
        if kind == 'list_node':
            args[name] = _to_list_node(value, list_node_cls)
        elif kind == 'tree_node':
            args[name] = _to_tree_node(value, tree_node_cls)
        elif kind == 'list_of_list_node':
            args[name] = [_to_list_node(v, list_node_cls) for v in (value or [])]
        elif kind == 'list_of_tree_node':
            args[name] = [_to_tree_node(v, tree_node_cls) for v in (value or [])]
        else:
            args[name] = value

    # `pos` is the cycle index in "Linked List Cycle"-family problems and is
    # never a real parameter — apply it to the linked-list argument instead.
    if 'pos' in extras:
        for name, kind in kinds.items():
            if kind == 'list_node' and name in args:
                args[name] = _link_cycle(args[name], extras['pos'])
                break

    return args


def _find_solution_method(tree):
    """(method_name, fn_node) for Solution's first public method, or None when
    the code has no Solution class or already calls something itself."""
    sol_class = None
    has_top_level_call = False

    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == 'Solution':
            sol_class = node
            continue
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            has_top_level_call = True
        elif isinstance(node, (ast.Assign, ast.AugAssign)) and isinstance(
            getattr(node, 'value', None), ast.Call
        ):
            has_top_level_call = True

    if has_top_level_call or sol_class is None:
        return None

    for node in sol_class.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith('_'):
            return node.name, node

    return None


def _build_arg_candidates(tree, examples, namespace):
    """One entry per usable example: (method_name, kwargs). Empty when the code
    can't be auto-run — the caller then executes the code as-is."""
    if tree is None:
        return []

    found = _find_solution_method(tree)
    if found is None:
        return []

    method_name, fn_node = found
    params, kinds = _method_signature(fn_node)

    candidates = []
    for example in (examples or []):
        raw = _parse_example(example)
        if raw is None:
            continue
        try:
            candidates.append((method_name, _build_call_args(raw, params, kinds, namespace)))
        except Exception:
            continue
    return candidates


# --------------------------------------------------------------------------
# Error reporting
# --------------------------------------------------------------------------

def _deepest_user_line(tb, max_line):
    """Deepest traceback line that lies inside the user's own code.

    Bug B9: the auto-injected runner stub sits past the user's last line, so an
    unclamped result renders as "error on line 14" for a 9-line solution.
    """
    line = 0
    cur = tb
    while cur is not None:
        if cur.tb_frame.f_code.co_filename == USER_FILENAME and cur.tb_lineno <= max_line:
            line = cur.tb_lineno
        cur = cur.tb_next

    if line == 0:
        cur = tb
        while cur is not None:
            if cur.tb_frame.f_code.co_filename == USER_FILENAME:
                line = min(cur.tb_lineno, max_line)
            cur = cur.tb_next

    return line


def _failed_before_entering_user_code(tb, max_line):
    """True when the traceback never reached the user's method body — i.e. the
    call itself failed to bind arguments, so a different example may work."""
    cur = tb
    while cur is not None:
        if cur.tb_frame.f_code.co_filename == USER_FILENAME:
            name = cur.tb_frame.f_code.co_name
            if name != '<module>' and cur.tb_lineno <= max_line:
                return False
        cur = cur.tb_next
    return True


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def _reset_state():
    global _snapshots, _prev_locals, _events, _truncated, _limit_kind
    global _frames, _frame_seq, _stdout
    _snapshots = []
    _prev_locals = {}
    _events = 0
    _truncated = False
    _limit_kind = None
    _frames = {}
    _frame_seq = 0
    _stdout = _StdoutCapture()


def _run_once(compiled, namespace, call):
    """Execute compiled user code, optionally invoking `call` afterwards.

    Returns (exception, return_value). The runner call happens inside the same
    traced execution so the method body's frames are captured.
    """
    real_stdout = sys.stdout
    sys.stdout = _stdout
    sys.settrace(_tracer)
    returned = None
    error = None
    try:
        exec(compiled, namespace)
        if call is not None:
            method_name, kwargs = call
            returned = getattr(namespace['Solution'](), method_name)(**kwargs)
    except BaseException as exc:  # noqa: BLE001 - surfaced to the panel
        error = exc
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout
    return error, returned


def run_traced(code_string, examples=None):
    global _user_max_line, _usage

    _user_max_line = code_string.count('\n') + 1

    # Compile with filename '<exec>' so the tracer filter matches; exec()'s
    # default is '<string>', which would silently reject every line event.
    try:
        compiled = compile(code_string, USER_FILENAME, 'exec')
    except SyntaxError as exc:
        return json.dumps({
            'snapshots': [],
            'truncated': False,
            'limit': None,
            'indexing': {},
            'error': {
                'message': 'SyntaxError: ' + str(exc.msg),
                'line': min(exc.lineno or 0, _user_max_line),
            },
            'returnValue': None,
        })

    try:
        tree = ast.parse(code_string)
    except SyntaxError:
        tree = None

    _usage = _analyze_usage(tree) if tree is not None else {}
    indexing = _analyze_indexing(tree) if tree is not None else {}

    namespace = _build_namespace()
    candidates = _build_arg_candidates(tree, examples, namespace)

    # Try each parseable example in turn: an argument-name mismatch TypeErrors
    # before reaching the user's body, and the next example often binds cleanly.
    attempts = candidates or [None]
    error = None
    returned = None
    for index, call in enumerate(attempts):
        _reset_state()
        namespace = _build_namespace()
        error, returned = _run_once(compiled, namespace, call)

        if error is None:
            break
        if isinstance(error, LeetTraceLimitError):
            break
        is_last = index == len(attempts) - 1
        if is_last:
            break
        if isinstance(error, TypeError) and _failed_before_entering_user_code(
            getattr(error, '__traceback__', None), _user_max_line
        ):
            continue
        break

    result = {
        'snapshots': _snapshots,
        'truncated': _truncated,
        'limit': _limit_kind,
        'error': None,
        'returnValue': None,
        # {array: {row: [names], col: [names]}} — which variables actually
        # index which arrays. The TS side builds pointers from this instead of
        # treating every in-range int as an index (bug B3).
        'indexing': indexing,
    }

    if isinstance(error, KeyboardInterrupt):
        # Raised by the host's interrupt buffer when MAX_EXECUTION_TIME is hit.
        result['truncated'] = True
        result['limit'] = 'time'
    elif error is not None and not isinstance(error, LeetTraceLimitError):
        result['error'] = {
            'message': type(error).__name__ + ': ' + str(error),
            'line': _deepest_user_line(getattr(error, '__traceback__', None), _user_max_line),
        }
    elif error is None:
        try:
            result['returnValue'] = _convert_return(returned)
        except Exception:
            result['returnValue'] = None

    return json.dumps(result)
