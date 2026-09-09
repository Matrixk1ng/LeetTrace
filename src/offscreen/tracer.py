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
import builtins
import collections
import functools
import json
import math
import sys
import types

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

def _float_repr(v):
    """Python's own spelling for a float JSON can't carry."""
    if v != v:
        return 'nan'
    return 'inf' if v > 0 else '-inf'


def _json_safe(obj):
    """Last-resort sweep for non-finite floats (see _dump)."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return _float_repr(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(x) for x in obj]
    return obj


def _dump(result):
    """Serialize the result as *strict* JSON.

    allow_nan=False is the guard: Python's json.dumps otherwise emits bare
    `Infinity` / `-Infinity` / `NaN`, which are not JSON and make the worker's
    JSON.parse throw — losing the whole trace. Python's own json.loads accepts
    them, so this only ever showed up in the browser.
    """
    try:
        return json.dumps(result, allow_nan=False)
    except ValueError:
        # Something reached the result without passing through _serialize.
        # Sweep it rather than lose the trace.
        return json.dumps(_json_safe(result), allow_nan=False)


def _serialize(v, _depth=0):
    if isinstance(v, float) and not math.isfinite(v):
        # float('inf') is ordinary in LeetCode solutions — it is how you
        # initialise a running min/max, and how isValidBST seeds its bounds.
        return _float_repr(v)

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

    # Ordinary TrieNode objects with a stored children dictionary. Read instance
    # storage only; properties and custom accessors are not traversed.
    trie = _serialize_trie(v)
    if trie is not None:
        return trie

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


def _display_locals(frame):
    items = list(frame.f_locals.items())
    instance = frame.f_locals.get('self')
    # Preserve meaningful state such as self.count, while hiding the wrapper in UI.
    if instance is not None:
        try:
            fields = vars(instance)
            items.extend(('self.' + k, v) for k, v in fields.items() if not k.startswith('_'))
        except TypeError:
            pass
    return items


_visual_lines = {}
_learning_lines = {}
_learning_pending = {}
_learning_containers = {}
_learning_unknown = object()
_pair_frames = {}
_window_specs = {}
_window_frames = {}
_window_builtin_sum = builtins.sum
_window_builtin_max = builtins.max
_window_builtin_min = builtins.min
_binary_specs = {}
_binary_frames = {}
_operation_pending = {}
_operation_roles = {}


def _serialize_trie(root):
    def storage(node):
        cls = type(node)
        if type.__getattribute__(cls, '__getattribute__') is not object.__getattribute__:
            return None
        descriptor = next((type.__getattribute__(base, '__dict__')['__dict__'] for base in type.__getattribute__(cls, '__mro__')
                           if '__dict__' in type.__getattribute__(base, '__dict__')), None)
        if not isinstance(descriptor, types.GetSetDescriptorType):
            return None
        try:
            state = vars(node)
        except TypeError:
            return None
        if type(state) is dict and type(state.get('children')) is dict and all(type(k) is str for k in state['children']):
            return state
        return None
    if storage(root) is None:
        return None
    nodes, edges, queue, seen = [], [], [(root, '')], set()
    while queue and len(nodes) < 100:
        node, character = queue.pop(0)
        identity = str(id(node))
        if identity in seen:
            continue
        state = storage(node)
        if state is None:
            continue
        seen.add(identity)
        ending = next((state[k] for k in ('is_word', 'is_end', 'isEnd', 'end', 'word_end') if type(state.get(k)) is bool), None)
        nodes.append({'id': identity, 'character': character, 'terminal': ending})
        for key, child in list(state['children'].items())[:100]:
            if storage(child) is not None:
                edges.append({'from': identity, 'to': str(id(child)), 'character': key})
                queue.append((child, key))
    return {'__type': 'trie', 'root': str(id(root)), 'nodes': nodes, 'edges': edges, 'truncated': bool(queue)}


def _plain_value(value, depth=0):
    """A bounded copy that never dispatches to user container methods."""
    if depth > 5:
        raise ValueError()
    if type(value) in (int, float, bool, str, type(None)):
        if type(value) is str and len(value) > 1000:
            raise ValueError()
        return _serialize(value)
    if type(value) in (list, tuple, collections.deque, set):
        if len(value) > 200:
            raise ValueError()
        return [_plain_value(v, depth + 1) for v in value]
    if type(value) in (dict, collections.defaultdict, collections.Counter):
        if len(value) > 200:
            raise ValueError()
        result = {}
        for k, v in value.items():
            if type(k) not in (int, float, bool, str, tuple):
                raise ValueError()
            key = str(k) if type(k) is not tuple else json.dumps(_plain_value(k))
            result[key] = _plain_value(v, depth + 1)
        return result
    raise ValueError()


def _operation_analyze(tree):
    """Roles require source structure; variable spelling alone is not evidence."""
    roles = {}
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.FunctionDef):
            continue
        found = {}
        for node in ast.walk(fn):
            if isinstance(node, ast.While) and isinstance(node.test, ast.Compare) and len(node.test.ops) == 1:
                test = node.test
                if isinstance(test.left, ast.Name) and isinstance(test.comparators[0], ast.Name) and isinstance(test.ops[0], (ast.Lt, ast.LtE)):
                    low, high = test.left.id, test.comparators[0].id
                    mids = [n for n in ast.walk(node) if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name)
                            and isinstance(n.value, ast.BinOp) and isinstance(n.value.op, ast.FloorDiv)
                            and {low, high}.issubset({v.id for v in ast.walk(n.value) if isinstance(v, ast.Name)})]
                    if len(mids) == 1:
                        found[low], found[high], found[mids[0].targets[0].id] = 'lower-bound', 'upper-bound', 'midpoint'
                        if isinstance(test.ops[0], ast.Lt):
                            assignments = sorted((a for a in ast.walk(fn) if isinstance(a, ast.Assign) and a.lineno < node.lineno), key=lambda a: a.lineno)
                            for assignment in assignments:
                                pairs = []
                                for target in assignment.targets:
                                    if isinstance(target, ast.Name):
                                        pairs.append((target, assignment.value))
                                    elif isinstance(target, ast.Tuple) and isinstance(assignment.value, ast.Tuple):
                                        pairs.extend(zip(target.elts, assignment.value.elts))
                                for target, value in pairs:
                                    if isinstance(target, ast.Name) and target.id == high:
                                        found[high] = 'exclusive-upper-bound' if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == 'len' else 'upper-bound'
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'sort' and isinstance(node.func.value, ast.Name):
                found.setdefault(node.func.value.id, 'sorted-sequence')
            if isinstance(node, ast.For) and isinstance(node.iter, ast.Subscript) and isinstance(node.iter.value, ast.Name):
                # Iterating adjacency[node] establishes the outer/key relationship.
                if isinstance(node.iter.slice, ast.Name):
                    found.setdefault(node.iter.value.id, 'adjacency')
                    candidates = {node.iter.slice.id}
                    if isinstance(node.target, ast.Name):
                        candidates.add(node.target.id)
                    for check in ast.walk(fn):
                        if isinstance(check, ast.Compare) and isinstance(check.left, ast.Name) and check.left.id in candidates and len(check.ops) == 1 and isinstance(check.ops[0], (ast.In, ast.NotIn)) and isinstance(check.comparators[0], ast.Name):
                            found[check.comparators[0].id] = 'visited-set'
            if isinstance(node, ast.For) and isinstance(node.iter, ast.Name) and isinstance(node.target, ast.Tuple) and len(node.target.elts) == 2:
                first = node.target.elts[0]
                if isinstance(first, ast.Name):
                    for condition in ast.walk(node):
                        if isinstance(condition, ast.Compare) and isinstance(condition.left, ast.Name) and condition.left.id == first.id:
                            for rhs in condition.comparators:
                                if isinstance(rhs, ast.Subscript) and isinstance(rhs.slice, ast.Constant) and rhs.slice.value == 1:
                                    found[node.iter.id] = 'intervals'
                                    base = rhs.value
                                    while isinstance(base, ast.Subscript):
                                        base = base.value
                                    if isinstance(base, ast.Name):
                                        found[base.id] = 'intervals'
            if isinstance(node, ast.For) and isinstance(node.target, ast.Name):
                right = node.target.id
                for loop in ast.walk(node):
                    if not isinstance(loop, ast.While):
                        continue
                    lefts = {a.target.id for a in ast.walk(loop) if isinstance(a, ast.AugAssign) and isinstance(a.target, ast.Name)
                             and isinstance(a.op, ast.Add) and isinstance(a.value, ast.Constant) and a.value.value == 1}
                    for left in lefts - {right}:
                        indexed = {}
                        for access in ast.walk(node):
                            if isinstance(access, ast.Subscript) and isinstance(access.value, ast.Name) and isinstance(access.slice, ast.Name):
                                indexed.setdefault(access.value.id, set()).add(access.slice.id)
                        for name, indices in indexed.items():
                            if {left, right}.issubset(indices):
                                found[left], found[right], found[name] = 'window-start', 'window-end', 'window-values'
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name):
                        name = target.value.id
                        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == fn.name:
                            found[name] = 'parents'
            if isinstance(node, ast.While) and isinstance(node.test, ast.Compare):
                test = node.test
                if (isinstance(test.left, ast.Subscript) and isinstance(test.left.value, ast.Name)
                        and len(test.comparators) == 1 and isinstance(test.comparators[0], ast.Name)
                        and isinstance(test.left.slice, ast.Name) and test.left.slice.id == test.comparators[0].id):
                    found[test.left.value.id] = 'parents'
        roles[min([fn.lineno] + [d.lineno for d in fn.decorator_list])] = found
    return roles


def _operation_step(frame, event):
    fid = id(frame)
    local = frame.f_locals
    def lookup(name):
        return local.get(name, frame.f_globals.get(name))
    def resolve(node):
        if isinstance(node, ast.Name):
            return lookup(node.id)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Tuple):
            return tuple(resolve(n) for n in node.elts)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            value = resolve(node.operand)
            if type(value) in (int, float):
                return -value
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
            a, b = resolve(node.left), resolve(node.right)
            if type(a) is int and type(b) is int:
                return a + b if isinstance(node.op, ast.Add) else a - b
        if isinstance(node, ast.Subscript):
            value, key = resolve(node.value), resolve(node.slice)
            if type(value) in (list, tuple, str) and type(key) is int:
                return value[key]
            if type(value) in (dict, collections.defaultdict, collections.Counter) and type(key) in (int, str, tuple):
                # Check builtin keys before lookup to avoid custom hash/equality.
                if all(type(k) in (int, str) or type(k) is tuple and all(type(x) in (int, str) for x in k) for k in value):
                    if type(key) is tuple and not all(type(x) in (int, str) for x in key):
                        raise ValueError()
                    return dict.get(value, key)
        raise ValueError()
    def capture(names):
        values = {}
        for name in names:
            if name not in local and name not in frame.f_globals:
                continue
            try:
                values[name] = _plain_value(lookup(name))
            except (ValueError, TypeError):
                pass
        return values
    pending = _operation_pending.pop(fid, None)
    result = {'roles': _operation_roles.get(frame.f_code.co_firstlineno, {})}
    if 'exclusive-upper-bound' in result['roles'].values() and local.get('len', frame.f_globals.get('len', builtins.len)) is not builtins.len:
        result['roles'] = {k: v for k, v in result['roles'].items() if v not in ('lower-bound', 'upper-bound', 'exclusive-upper-bound', 'midpoint')}
    if pending:
        node = pending.pop('_node')
        caches = pending.pop('_caches')
        pending['after'] = capture(pending['names'])
        if isinstance(node, (ast.If, ast.While)) and event == 'line':
            if any(n.lineno <= frame.f_lineno <= n.end_lineno for n in node.body):
                pending['outcome'] = True
            elif frame.f_lineno > node.end_lineno or any(n.lineno <= frame.f_lineno <= n.end_lineno for n in node.orelse):
                pending['outcome'] = False
        pending['cache'] = []
        for name, wrapper, before in caches:
            after = wrapper.cache_info()
            if after.hits != before.hits or after.misses != before.misses:
                pending['cache'].append({'name': name, 'hits': after.hits - before.hits, 'misses': after.misses - before.misses})
        result['completed'] = pending
    stmt = _learning_lines.get(frame.f_lineno) if event == 'line' else None
    if stmt is None or isinstance(stmt, (ast.FunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom)):
        return result if pending or result['roles'] else None
    expr = stmt.test if isinstance(stmt, (ast.If, ast.While)) else stmt.iter if isinstance(stmt, ast.For) else stmt
    names = sorted({n.id for n in ast.walk(expr) if isinstance(n, ast.Name) and n.id not in ('self', 'cls')})[:20]
    source = ((type(stmt).__name__.lower() + ' ' + ast.unparse(expr)) if expr is not stmt else ast.unparse(stmt))[:500]
    if isinstance(stmt, ast.For):
        source = ('for ' + ast.unparse(stmt.target) + ' in ' + ast.unparse(stmt.iter))[:500]
    operands = []
    accesses = []
    for node in ast.walk(expr):
        if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], (ast.In, ast.NotIn)) and isinstance(node.comparators[0], ast.Name):
            try:
                accesses.append({'name': node.comparators[0].id, 'indices': [_plain_value(resolve(node.left))], 'write': False, 'membership': True})
            except (ValueError, TypeError, IndexError, KeyError):
                pass
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.attr == 'get' and node.args:
            try:
                accesses.append({'name': node.func.value.id, 'indices': [_plain_value(resolve(node.args[0]))], 'write': False})
            except (ValueError, TypeError, IndexError, KeyError):
                pass
        if isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Load):
            try:
                operands.append({'expression': ast.unparse(node), 'value': _plain_value(resolve(node))})
            except (ValueError, TypeError, IndexError, KeyError):
                pass
        if isinstance(node, ast.Subscript):
            base, indices = node, []
            try:
                while isinstance(base, ast.Subscript):
                    indices.insert(0, _plain_value(resolve(base.slice)))
                    base = base.value
                if isinstance(base, ast.Name):
                    accesses.append({'name': base.id, 'indices': indices, 'write': isinstance(node.ctx, ast.Store)})
            except (ValueError, TypeError, IndexError, KeyError):
                pass
    caches = []
    for name in names:
        wrapper = lookup(name)
        if type(wrapper) is functools._lru_cache_wrapper:
            caches.append((name, wrapper, wrapper.cache_info()))
    observation = {'line': frame.f_lineno, 'source': source, 'kind': type(stmt).__name__, 'names': names,
                   'before': capture(names), 'operands': operands[:20], 'accesses': accesses[:20]}
    result['upcoming'] = observation
    _operation_pending[fid] = dict(observation, _node=stmt, _caches=caches)
    return result


def _analyze_binary_specs(tree):
    result = {}
    for loop in ast.walk(tree):
        if not isinstance(loop, ast.While):
            continue
        test = loop.test
        if not (isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.ops[0], ast.LtE)
                and isinstance(test.left, ast.Name) and isinstance(test.comparators[0], ast.Name)):
            continue
        low, high = test.left.id, test.comparators[0].id
        if low == high:
            continue
        direct = ast.parse(f'({low} + {high}) // 2', mode='eval').body
        offset = ast.parse(f'{low} + ({high} - {low}) // 2', mode='eval').body
        mids = [n for n in ast.walk(loop) if isinstance(n, ast.Assign) and len(n.targets) == 1
                and isinstance(n.targets[0], ast.Name) and ast.dump(n.value) in (ast.dump(direct), ast.dump(offset))]
        if len(mids) != 1 or mids[0].targets[0].id in (low, high):
            continue
        mid = mids[0].targets[0].id
        arrays = {n.value.id for n in ast.walk(loop) if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name)
                  and isinstance(n.slice, ast.Name) and n.slice.id == mid}
        if len(arrays) != 1:
            continue
        spec = {'low': low, 'high': high, 'mid': mid, 'structure': arrays.pop(), 'mid_stmt': mids[0]}
        # Only this loop's source interval is classified; its subsequent return is
        # handled by the live frame state. Nested ambiguous loops abstain.
        for line in range(loop.lineno, loop.end_lineno + 1):
            result[line] = None if line in result else spec
    return result


def _binary_step(frame, event):
    fid = id(frame)
    state = _binary_frames.get(fid)
    spec = state['spec'] if state else _binary_specs.get(frame.f_lineno)
    if not spec:
        return None
    local = frame.f_locals
    def integer(v):
        return type(v) is int and abs(v) <= 2**53 - 1
    data, low, high = local.get(spec['structure']), local.get(spec['low']), local.get(spec['high'])
    if (type(data) is not list or len(data) > 2000 or not all(integer(v) for v in data)
        or not integer(low) or not integer(high) or not 0 <= low <= len(data) or not -1 <= high < len(data)):
        _binary_frames.pop(fid, None)
        return None
    if not state:
        if event != 'line' or any(data[i-1] > data[i] for i in range(1, len(data))):
            return None
        _learning_containers[id(data)] = data
        state = {'spec': spec, 'container': data, 'original': list(data), 'bounds': [low, high], 'fresh': False}
        _binary_frames[fid] = state
        kind = 'bounds'
    else:
        if data is not state['container'] or data != state['original']:
            _binary_frames.pop(fid, None)
            return None
        kind = 'state'
    previous = state['bounds']
    if previous != [low, high]:
        kind = 'move'
        state['fresh'] = False
    state['bounds'] = [low, high]
    pending = state.pop('pending_mid', None)
    if pending:
        actual = local.get(spec['mid'])
        if event == 'line' and integer(actual) and [low, high] == pending['bounds'] and actual == pending['expected'] and low <= actual <= high:
            state.update(mid=actual, fresh=True)
            kind = 'midpoint'
        else:
            state['fresh'] = False
    comparison = None
    branch = state.pop('branch', None)
    if branch and event == 'line':
        node, captured = branch
        if any(n.lineno <= frame.f_lineno <= n.end_lineno for n in node.body):
            comparison = dict(captured, outcome=True)
        elif any(n.lineno <= frame.f_lineno <= n.end_lineno for n in node.orelse) or frame.f_lineno > node.end_lineno:
            comparison = dict(captured, outcome=False)
        if comparison:
            state['last'] = comparison
            kind = 'compare'
    stmt = _learning_lines.get(frame.f_lineno) if event == 'line' else None
    if stmt is spec['mid_stmt']:
        state['fresh'] = False
        if low <= high:
            state['pending_mid'] = {'bounds': [low, high], 'expected': (low + high) // 2}
    if state.get('fresh') and (not integer(local.get(spec['mid'])) or local.get(spec['mid']) != state.get('mid')):
        state['fresh'] = False
    if isinstance(stmt, ast.If) and state.get('fresh'):
        test = stmt.test
        if isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.left, ast.Subscript) and isinstance(test.left.value, ast.Name) and test.left.value.id == spec['structure'] and isinstance(test.left.slice, ast.Name) and test.left.slice.id == spec['mid']:
            rhs = test.comparators[0]
            target = local.get(rhs.id) if isinstance(rhs, ast.Name) else rhs.value if isinstance(rhs, ast.Constant) else None
            operator = {ast.Eq: '==', ast.Lt: '<', ast.Gt: '>', ast.LtE: '<=', ast.GtE: '>='}.get(type(test.ops[0]))
            if operator and integer(target):
                state['branch'] = (stmt, {'mid': state['mid'], 'value': data[state['mid']], 'target': target, 'operator': operator, 'bounds': [low, high]})
    info = {'kind': kind, 'structure': spec['structure'], 'identity': str(id(data)), 'lowName': spec['low'], 'highName': spec['high'], 'midName': spec['mid'],
            'low': low, 'high': high, 'midCurrent': state['fresh'], 'previous': previous}
    if 'mid' in state:
        info['mid'] = state['mid']
    if comparison:
        info['comparison'] = comparison
    if 'last' in state:
        info['lastComparison'] = state['last']
    if event == 'return':
        _binary_frames.pop(fid, None)
    return info


def _analyze_window_specs(tree):
    result = {}
    def statements(body):
        for node in body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            yield node
            for field in ('body', 'orelse', 'finalbody'):
                yield from statements(getattr(node, field, []))
            for handler in getattr(node, 'handlers', []):
                yield from statements(handler.body)
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.FunctionDef):
            continue
        nodes = list(statements(fn.body))
        updates = [n for n in nodes if isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name)
                   and isinstance(n.op, (ast.Add, ast.Sub)) and isinstance(n.value, ast.Subscript)
                   and isinstance(n.value.value, ast.Name)]
        candidates = []
        for aggregate, structure in {(n.target.id, n.value.value.id) for n in updates}:
            group = [n for n in updates if n.target.id == aggregate and n.value.value.id == structure]
            adds = [n for n in group if isinstance(n.op, ast.Add)]
            removes = [n for n in group if isinstance(n.op, ast.Sub)]
            if not adds or not removes:
                continue
            widths = []
            for remove in removes:
                index = remove.value.slice
                if isinstance(index, ast.BinOp) and isinstance(index.op, ast.Sub) and isinstance(index.left, ast.Name):
                    if any(isinstance(n.value.slice, ast.Name) and n.value.slice.id == index.left.id for n in adds):
                        widths.append(index.right)
                elif isinstance(index, ast.Name):
                    for node in nodes:
                        test = getattr(node, 'test', None)
                        if not isinstance(test, ast.Compare) or len(test.ops) != 1 or not isinstance(test.ops[0], (ast.Eq, ast.GtE)):
                            continue
                        size = test.left
                        if (isinstance(size, ast.BinOp) and isinstance(size.op, ast.Add) and isinstance(size.right, ast.Constant) and size.right.value == 1
                            and isinstance(size.left, ast.BinOp) and isinstance(size.left.op, ast.Sub)
                            and isinstance(size.left.left, ast.Name) and isinstance(size.left.right, ast.Name)
                            and size.left.right.id == index.id and any(isinstance(n.value.slice, ast.Name) and n.value.slice.id == size.left.left.id for n in adds)):
                            widths.append(test.comparators[0])
            widths = [w for w in widths if isinstance(w, ast.Name) or isinstance(w, ast.Constant) and type(w.value) is int]
            if widths and len({ast.dump(w) for w in widths}) == 1:
                candidates.append({'aggregate': aggregate, 'structure': structure, 'width': widths[0]})
            elif not widths and len(adds) == len(removes) == 1 and isinstance(adds[0].value.slice, ast.Name) and isinstance(removes[0].value.slice, ast.Name):
                for node in nodes:
                    test = getattr(node, 'test', None)
                    if (isinstance(node, ast.While) and isinstance(test, ast.Compare) and len(test.ops) == 1
                        and isinstance(test.ops[0], ast.GtE) and isinstance(test.left, ast.Name) and test.left.id == aggregate
                        and (isinstance(test.comparators[0], ast.Name) or isinstance(test.comparators[0], ast.Constant) and type(test.comparators[0].value) is int)
                        and removes[0] in list(statements(node.body))):
                        candidates.append({'aggregate': aggregate, 'structure': structure, 'mode': 'variable',
                                           'target': test.comparators[0], 'loop': node,
                                           'left': removes[0].value.slice.id, 'right': adds[0].value.slice.id})
        if len(candidates) == 1:
            for n in nodes:
                if n.lineno in _learning_lines:
                    result[n.lineno] = candidates[0]
    return result


def _window_step(frame, event):
    """Track membership from confirmed add/remove effects, not pointer positions."""
    fid = id(frame)
    stmt = _learning_lines.get(frame.f_lineno) if event == 'line' else None
    spec = _window_specs.get(frame.f_lineno)
    state = _window_frames.get(fid)
    local = frame.f_locals
    def integer(v):
        return type(v) is int and abs(v) <= 2**53 - 1
    def scalar(node):
        if isinstance(node, ast.Name):
            value = local.get(node.id)
        elif isinstance(node, ast.Constant):
            value = node.value
        elif isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
            a, b = scalar(node.left), scalar(node.right)
            value = a + b if isinstance(node.op, ast.Add) else a - b
        else:
            raise ValueError()
        if not integer(value):
            raise ValueError()
        return value
    try:
        if not state and spec:
            data = local.get(spec['structure'])
            variable = spec.get('mode') == 'variable'
            width = 0 if variable else scalar(spec['width'])
            target = scalar(spec['target']) if variable else None
            if (type(data) is not list or not 0 < len(data) <= 2000 or not all(integer(v) for v in data)
                or (variable and (target <= 0 or any(v <= 0 for v in data))) or (not variable and not 0 < width <= len(data))):
                return None
            if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name) and stmt.targets[0].id == spec['aggregate']:
                members = []
                value = stmt.value
                if isinstance(value, ast.Constant) and type(value.value) is int and value.value == 0:
                    pass
                elif isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == 'sum' and not value.keywords and len(value.args) == 1 and local.get('sum', frame.f_globals.get('sum', builtins.sum)) is _window_builtin_sum:
                    arg = value.args[0]
                    if not isinstance(arg, ast.Subscript) or not isinstance(arg.value, ast.Name) or arg.value.id != spec['structure'] or not isinstance(arg.slice, ast.Slice) or arg.slice.step is not None:
                        return None
                    lo = scalar(arg.slice.lower) if arg.slice.lower else 0
                    hi = scalar(arg.slice.upper) if arg.slice.upper else len(data)
                    if not 0 <= lo <= hi <= len(data):
                        return None
                    members = list(range(lo, hi))
                else:
                    return None
                _learning_containers[id(data)] = data
                state = {'spec': spec, 'container': data, 'original': list(data), 'width': width, 'target': target, 'members': [], 'total': 0,
                         'pending': {'kind': 'init', 'members': members, 'expected': _window_builtin_sum(data[i] for i in members)}}
                _window_frames[fid] = state
                return None
        if not state:
            return None
        spec = state['spec']
        variable = spec.get('mode') == 'variable'
        data = local.get(spec['structure'])
        total = local.get(spec['aggregate'])
        if (data is not state['container'] or type(data) is not list or len(data) != len(state['original'])
            or not all(integer(v) for v in data) or data != state['original'] or not integer(total)
            or (not variable and scalar(spec['width']) != state['width'])
            or (variable and scalar(spec['target']) != state['target'])):
            _window_frames.pop(fid, None)
            return None
        info = {'kind': 'state'}
        pending = state.pop('pending', None)
        if pending:
            if event not in ('line', 'return'):
                _window_frames.pop(fid, None)
                return None
            if pending['kind'] in ('check', 'save', 'min-check'):
                actual = local.get(pending['name'])
                if not integer(actual) or actual != pending['expected']:
                    _window_frames.pop(fid, None)
                    return None
                info = {'kind': 'check'}
                prior = state.get('best')
                improved = (actual == len(state['members']) and actual < pending['before']) if pending['kind'] == 'min-check' else (actual == total and (prior is None and pending['before'] < actual or prior is not None and actual > prior['value']))
                if improved:
                    state['best'] = {'name': pending['name'], 'value': actual, 'indices': list(state['members'])}
                    info['kind'] = 'save'
            elif total == pending['expected']:
                state['members'] = pending['members']
                info = {k: v for k, v in pending.items() if k not in ('members', 'expected')}
                state['total'] = total
                state.pop('condition', None)
            else:
                _window_frames.pop(fid, None)
                return None
        if total != state['total']:
            _window_frames.pop(fid, None)
            return None
        members = state['members']
        branch = state.pop('branch', None)
        if branch and event == 'line':
            state['condition'] = dict(branch, outcome=any(n.lineno <= frame.f_lineno <= n.end_lineno for n in spec['loop'].body))
            info['kind'] = 'condition'
        if variable and stmt is spec['loop']:
            state['condition'] = {'total': total, 'target': state['target']}
            state['branch'] = state['condition']
        info.update(structure=spec['structure'], identity=str(id(data)), aggregate=spec['aggregate'], width=state['width'], indices=list(members), total=total)
        if variable:
            info.update(mode='variable', condition=state.get('condition', {'total': total, 'target': state['target']}))
        if 'best' in state:
            info['best'] = state['best']
        if isinstance(stmt, ast.AugAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == spec['aggregate'] and isinstance(stmt.op, (ast.Add, ast.Sub)) and isinstance(stmt.value, ast.Subscript) and isinstance(stmt.value.value, ast.Name) and stmt.value.value.id == spec['structure']:
            index = scalar(stmt.value.slice)
            add = isinstance(stmt.op, ast.Add)
            if not 0 <= index < len(data) or (index in members) == add:
                _window_frames.pop(fid, None)
                return info
            after = sorted(members + [index]) if add else [i for i in members if i != index]
            if after and after != list(range(after[0], after[-1] + 1)):
                _window_frames.pop(fid, None)
                return info
            state['pending'] = {'kind': 'add' if add else 'remove', 'members': after, 'expected': total + data[index] if add else total - data[index], 'before': total, 'index': index, 'value': data[index]}
        elif variable and isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name) and members and state.get('condition', {}).get('outcome') is True:
            name, value = stmt.targets[0].id, stmt.value
            before = local.get(name)
            if not (integer(before) or type(before) is float and before == float('inf')):
                return info
            length = value
            is_min = isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == 'min' and local.get('min', frame.f_globals.get('min', builtins.min)) is _window_builtin_min and len(value.args) == 2 and not value.keywords
            if not is_min or name in (spec['aggregate'], spec['left'], spec['right']):
                return info
            if is_min:
                lengths = [arg for arg in value.args if not (isinstance(arg, ast.Name) and arg.id == name)]
                if len(lengths) != 1:
                    return info
                length = lengths[0]
            if (isinstance(length, ast.BinOp) and isinstance(length.op, ast.Add) and isinstance(length.right, ast.Constant) and type(length.right.value) is int and length.right.value == 1
                and isinstance(length.left, ast.BinOp) and isinstance(length.left.op, ast.Sub)
                and isinstance(length.left.left, ast.Name) and length.left.left.id == spec['right']
                and isinstance(length.left.right, ast.Name) and length.left.right.id == spec['left']
                and scalar(length) == len(members) and local.get(spec['left']) == members[0] and local.get(spec['right']) == members[-1]):
                state['pending'] = {'kind': 'min-check', 'name': name, 'before': before, 'expected': before if is_min and before < len(members) else len(members)}
        elif not variable and isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name) and len(members) == state['width']:
            name, value = stmt.targets[0].id, stmt.value
            before = local.get(name)
            valid_before = integer(before) or type(before) is float and before == float('-inf')
            if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == 'max' and local.get('max', frame.f_globals.get('max', builtins.max)) is _window_builtin_max and not value.keywords and len(value.args) == 2 and all(isinstance(a, ast.Name) for a in value.args) and {a.id for a in value.args} == {name, spec['aggregate']} and valid_before:
                state['pending'] = {'kind': 'check', 'name': name, 'before': before, 'expected': before if before >= total else total}
        if event == 'return':
            _window_frames.pop(fid, None)
        return info
    except (ValueError, TypeError, IndexError):
        _window_frames.pop(fid, None)
        return None


def _pair_step(frame, event):
    """Observe simple builtin-int pair sums and branch entry, without eval."""
    fid = id(frame)
    state = _pair_frames.get(fid)
    stmt = _learning_lines.get(frame.f_lineno) if event == 'line' else None
    local = frame.f_locals
    def integer(value):
        return type(value) is int and abs(value) <= 2**53 - 1
    if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
        expr = stmt.value
        if isinstance(expr, ast.BinOp) and isinstance(expr.op, ast.Add):
            refs = [expr.left, expr.right]
            if all(isinstance(r, ast.Subscript) and isinstance(r.value, ast.Name) and isinstance(r.slice, ast.Name) for r in refs):
                names = [r.slice.id for r in refs]
                name = refs[0].value.id
                data = local.get(name)
                indices = [local.get(n) for n in names]
                if refs[1].value.id == name and len(set(names)) == 2 and stmt.targets[0].id not in names and type(data) is list and len(data) <= 2000 and all(integer(v) for v in data) and all(integer(i) and 0 <= i < len(data) for i in indices):
                    _learning_containers[id(data)] = data
                    state = {'container': data, 'structure': name, 'names': names, 'sumName': stmt.targets[0].id,
                             'pendingSum': {'indices': indices, 'values': [data[i] for i in indices], 'line': frame.f_lineno},
                             'indices': indices}
                    _pair_frames[fid] = state
                    return {'structure': name, 'identity': str(id(data)), 'names': names, 'indices': indices, 'kind': 'read', 'values': [data[i] for i in indices]}
    if not state:
        return None
    data = local.get(state['structure'])
    indices = [local.get(n) for n in state['names']]
    if data is not state['container'] or type(data) is not list or len(data) > 2000 or not all(integer(v) for v in data) or not all(integer(i) for i in indices):
        _pair_frames.pop(fid, None)
        return None
    info = {'structure': state['structure'], 'identity': str(id(data)), 'names': state['names'], 'indices': indices, 'kind': 'state'}
    if indices != state['indices']:
        info.update(kind='move', previous=state['indices'])
    state['indices'] = indices
    pending = state.pop('pendingSum', None)
    if pending and event == 'line':
        value = local.get(state['sumName'])
        if integer(value) and value == sum(pending['values']):
            state['sum'] = dict(pending, sum=value)
            info.update(kind='sum', pair=state['sum'])
    branch = state.pop('branch', None)
    if branch and event == 'line':
        node, comparison = branch
        if any(child.lineno <= frame.f_lineno <= child.end_lineno for child in node.body):
            info.update(kind='compare', comparison=dict(comparison, outcome=True))
        elif any(child.lineno <= frame.f_lineno <= child.end_lineno for child in node.orelse) or frame.f_lineno > node.end_lineno:
            info.update(kind='compare', comparison=dict(comparison, outcome=False))
    pair = state.get('sum')
    if pair:
        info['pair'] = pair
    if isinstance(stmt, ast.If) and pair and pair['indices'] == indices and all(0 <= i < len(data) for i in indices) and [data[i] for i in indices] == pair['values']:
        test = stmt.test
        if isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.left, ast.Name) and test.left.id == state['sumName'] and len(test.comparators) == 1:
            rhs = test.comparators[0]
            target = local.get(rhs.id) if isinstance(rhs, ast.Name) else rhs.value if isinstance(rhs, ast.Constant) else None
            operator = {ast.Eq: '==', ast.Lt: '<', ast.Gt: '>', ast.LtE: '<=', ast.GtE: '>='}.get(type(test.ops[0]))
            if operator and integer(target) and integer(local.get(state['sumName'])) and local.get(state['sumName']) == pair['sum']:
                state['branch'] = (stmt, {'sum': pair['sum'], 'target': target, 'operator': operator, 'indices': indices, 'values': pair['values']})
    if event == 'return':
        _pair_frames.pop(fid, None)
    return info


def _analyze_learning_lines(tree):
    """Keep AST nodes internal; only unambiguous single statements are eligible."""
    lines = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.stmt):
            lines.setdefault(node.lineno, []).append(node)
    return {line: nodes[0] for line, nodes in lines.items() if len(nodes) == 1}


def _learning_step(frame, event, arg):
    """Observe builtin containers only. Never eval expressions or call user methods."""
    emitted = []
    fid = id(frame)
    pending = _learning_pending.pop(fid, None)
    def lookup(name):
        return frame.f_locals.get(name, frame.f_globals.get(name))
    def safe_key(key):
        return type(key) in (int, str) or type(key) is tuple and all(type(x) in (int, str) for x in key)
    def scalar(node):
        if isinstance(node, ast.Tuple):
            value = tuple(scalar(x) for x in node.elts)
        elif isinstance(node, ast.Constant):
            value = node.value
        elif isinstance(node, ast.Name):
            value = lookup(node.id)
        elif isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
            a, b = scalar(node.left), scalar(node.right)
            if type(a) is not int or type(b) is not int:
                raise ValueError()
            value = a + b if isinstance(node.op, ast.Add) else a - b
        else:
            raise ValueError()
        if (type(value) not in (int, str, bool, type(None)) and not safe_key(value)) or type(value) is int and abs(value) > 2**53 - 1:
            raise ValueError()
        return value
    def ref(node):
        if not isinstance(node, ast.Subscript) or not isinstance(node.value, ast.Name):
            raise ValueError()
        name = node.value.id
        container = lookup(name)
        if type(container) not in (dict, list):
            raise ValueError()
        if len(container) > 2000:
            raise ValueError()
        if type(container) is dict and any(not safe_key(k) for k in container):
            raise ValueError()
        # Keep observed containers alive for this trace so object ids cannot recycle.
        _learning_containers[id(container)] = container
        key = scalar(node.slice)
        if type(container) is list:
            if type(key) is not int or not -len(container) <= key < len(container):
                raise ValueError()
            key %= len(container)
        elif not safe_key(key):
            raise ValueError()
        return name, container, key
    if pending:
        info, container, expected = pending
        if lookup(info['structure']) is container and (type(container) is not dict or all(safe_key(k) for k in container)):
            if info['kind'] == 'stored-return':
                if event == 'return' and type(arg) is type(expected) and arg == expected:
                    emitted.append(info)
            elif event in ('line', 'return'):
                actual = container.get(info['key']) if type(container) is dict else container[info['key']]
                if expected is _learning_unknown:
                    if event == 'line' and info['key'] in container and type(actual) in (int, str, bool, type(None)):
                        emitted.append(dict(info, value=_serialize(actual)))
                    actual = _learning_unknown
                if type(actual) is type(expected) and actual == expected:
                    if expected is not _learning_unknown and (info['kind'] != 'table-write' or all(
                            type(v) is type(info['before'][i]) and v == info['before'][i]
                            for i, v in enumerate(container) if i != info['key'])):
                        emitted.append({k: v for k, v in info.items() if k != 'before'})
    if event != 'line':
        return emitted
    stmt = _learning_lines.get(frame.f_lineno)
    try:
        if isinstance(stmt, ast.Return) and isinstance(stmt.value, ast.Subscript):
            name, container, key = ref(stmt.value)
            if type(container) is not dict or key not in container:
                return emitted
            value = container[key]
            if type(value) not in (int, str, bool, type(None)):
                return emitted
            info = {'kind': 'stored-return', 'structure': name, 'identity': str(id(container)), 'key': key, 'value': value}
            _learning_pending[fid] = (info, container, value)
        elif isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Subscript):
            name, container, key = ref(stmt.targets[0])
            info = {'structure': name, 'identity': str(id(container)), 'key': key}
            if type(container) is dict:
                # Wait for the next line in THIS frame, after child calls finish.
                # Exception events cancel this pending assignment.
                info.update(kind='memo-write')
                _learning_pending[fid] = (info, container, _learning_unknown)
            elif isinstance(stmt.value, ast.BinOp) and isinstance(stmt.value.op, ast.Add) and len(container) <= 2000:
                left, right = ref(stmt.value.left), ref(stmt.value.right)
                if left[1] is not container or right[1] is not container:
                    return emitted
                if any(type(v) not in (int, type(None)) or type(v) is int and abs(v) > 2**53 - 1 for v in container):
                    return emitted
                a, b = container[left[2]], container[right[2]]
                if type(a) is not int or type(b) is not int or abs(a + b) > 2**53 - 1:
                    return emitted
                info.update(kind='table-read', reads=[left[2], right[2]], operands=[a, b], value=a+b)
                emitted.append(dict(info))
                _learning_pending[fid] = (dict(info, kind='table-write', before=list(container)), container, a+b)
    except (ValueError, KeyError, IndexError, TypeError):
        pass
    return emitted


def _analyze_visual_lines(tree):
    """Statement-local references, never descendants in a loop/branch body.

    Coordinates are only names/literals: no expression evaluation or extra calls.
    A referenced condition operand is not asserted to have executed/passed.
    """
    result = {}
    for stmt in ast.walk(tree):
        if not isinstance(stmt, ast.stmt) or isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        roots = [value for _, value in ast.iter_fields(stmt) if isinstance(value, ast.expr)]
        for _, value in ast.iter_fields(stmt):
            if isinstance(value, list):
                roots.extend(x for x in value if isinstance(x, ast.expr))
        nodes = [n for root in roots for n in ast.walk(root)]
        cells = []
        for n in nodes:
            if not (isinstance(n, ast.Subscript) and isinstance(n.value, ast.Subscript)
                    and isinstance(n.value.value, ast.Name)):
                continue
            indices = [n.value.slice, n.slice]
            if not all(isinstance(x, ast.Name) or isinstance(x, ast.Constant) and type(x.value) is int for x in indices):
                continue
            cells.append({'structure': n.value.value.id,
                          'indices': [x.id if isinstance(x, ast.Name) else x.value for x in indices],
                          'write': isinstance(n.ctx, ast.Store)})
        info = {'names': sorted({n.id for n in nodes if isinstance(n, ast.Name)}),
                'cells': cells}
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            target, value = stmt.targets[0], stmt.value
            pairs = list(zip(target.elts, value.elts)) if isinstance(target, (ast.Tuple, ast.List)) and isinstance(value, (ast.Tuple, ast.List)) and len(target.elts) == len(value.elts) else [(target, value)]
            offsets = []
            for dest, expr in pairs:
                if isinstance(dest, ast.Name) and isinstance(expr, ast.BinOp) and isinstance(expr.op, (ast.Add, ast.Sub)) and isinstance(expr.left, ast.Name) and isinstance(expr.right, (ast.Name, ast.Constant)):
                    offsets.append({'target': dest.id, 'base': expr.left.id})
            if offsets:
                info['offsets'] = offsets
        call = stmt.value if isinstance(stmt, (ast.Expr, ast.Assign)) else None
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name) and not call.keywords:
            method = call.func.attr
            if method == 'append' and len(call.args) == 1 and isinstance(stmt, ast.Expr):
                info['queueOperation'] = {'kind': 'append', 'queue': call.func.value.id}
            elif method == 'popleft' and not call.args and isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
                target = stmt.targets[0]
                if isinstance(target, (ast.Tuple, ast.List)) and len(target.elts) == 2 and all(isinstance(x, ast.Name) for x in target.elts):
                    info['queueOperation'] = {'kind': 'popleft', 'queue': call.func.value.id,
                                              'targets': [x.id for x in target.elts]}
        # Multiple statements on one line cannot be distinguished by sys.settrace.
        if stmt.lineno in result:
            result[stmt.lineno] = {'names': [], 'cells': []}
        else:
            result[stmt.lineno] = info
    # Only the explicit fixed-size queue loop supplies a frontier boundary.
    for stmt in ast.walk(tree):
        if not isinstance(stmt, ast.For):
            continue
        it = stmt.iter
        if not (isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == 'range'
                and len(it.args) == 1 and not it.keywords):
            continue
        length = it.args[0]
        if not (isinstance(length, ast.Call) and isinstance(length.func, ast.Name) and length.func.id == 'len'
                and len(length.args) == 1 and isinstance(length.args[0], ast.Name) and not length.keywords):
            continue
        end = max((getattr(x, 'end_lineno', x.lineno) for x in stmt.body), default=stmt.lineno)
        for line, info in result.items():
            if stmt.lineno <= line <= end:
                # Nested level loops are ambiguous; their shared lines abstain.
                if 'levelLoop' in info:
                    info['levelLoop'] = None
                else:
                    info['levelLoop'] = {'line': stmt.lineno, 'queue': length.args[0].id}
    return result


def _collect_locals(frame, frame_id):
    previous = _prev_locals.get(frame_id, {})
    current = {}
    for k, v in _display_locals(frame):
        if k.startswith('_') or k in _BASELINE_NAMES:
            continue
        try:
            entry = {
                'value': _serialize(v),
                'type': type(v).__name__,
                'changed': k not in previous or previous.get(k) != repr(v),
            }
            kind = _usage_kind(k, v)
            if isinstance(v, list) and v and all(isinstance(x, tuple) for x in v):
                entry['tupleItems'] = True
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
        k: repr(v) for k, v in _display_locals(frame)
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
        _operation_pending.pop(id(frame), None)
        _binary_frames.pop(id(frame), None)
        _window_frames.pop(id(frame), None)
        _learning_pending.pop(id(frame), None)
        _pair_frames.pop(id(frame), None)
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
    if event == 'call' and not is_module_frame:
        code = frame.f_code
        count = code.co_argcount + code.co_kwonlyargcount
        count += bool(code.co_flags & 0x04) + bool(code.co_flags & 0x08)
        snapshot['arguments'] = {}
        for name in code.co_varnames[:count]:
            if name in ('self', 'cls') or name not in frame.f_locals:
                continue
            value = frame.f_locals[name]
            try:
                serialized = _serialize(value)
            except Exception:
                serialized = '<value unavailable>'
            snapshot['arguments'][name] = {'value': serialized, 'type': type(value).__name__, 'changed': False}
    snapshot['visual'] = _visual_lines.get(frame.f_lineno, {'names': [], 'cells': []}) if event == 'line' else {'names': [], 'cells': []}
    learning = _learning_step(frame, event, arg)
    if learning:
        snapshot['visual'] = dict(snapshot['visual'], learning=[dict(e, key=str(e['key']), keyType='tuple') if type(e.get('key')) is tuple else e for e in learning])
    pair = _pair_step(frame, event)
    if pair:
        snapshot['visual'] = dict(snapshot['visual'], pair=pair)
    window = _window_step(frame, event)
    if window:
        snapshot['visual'] = dict(snapshot['visual'], window=window)
    binary = _binary_step(frame, event)
    if binary:
        snapshot['visual'] = dict(snapshot['visual'], binary=binary)
    operation = _operation_step(frame, event)
    if operation:
        snapshot['visual'] = dict(snapshot['visual'], operation=operation)
    if snapshot['visual'].get('levelLoop') and any(
            frame.f_locals.get(name, frame.f_globals.get(name, builtin)) is not builtin
            for name, builtin in [('range', builtins.range), ('len', builtins.len)]):
        snapshot['visual'] = dict(snapshot['visual'], levelLoop=None)

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
        values.append(_serialize(cur.val))
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
        out.append(_serialize(node.val))
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
    _learning_pending.clear()
    _learning_containers.clear()
    _pair_frames.clear()
    _window_frames.clear()
    _binary_frames.clear()
    _operation_pending.clear()
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



def _detect_pattern(tree):
    """Conservative structural signals, scored together. Scores are heuristic,
    not calibrated probabilities; absence of evidence produces no badge."""
    scores = {}
    descriptions = {
        'binary_search': 'Halves a search interval using a midpoint and boundary updates.',
        'sliding_window': 'Expands a window, then advances its start while shrinking its contents.',
        'two_pointer': 'Moves two indices toward one another through a sequence.',
        'fast_slow_pointers': 'Advances node pointers by one and two links.',
        'bfs': 'Consumes a queue from the front to explore in breadth-first order.',
        'dfs': 'Explores subproblems through recursive calls.',
        'backtracking': 'Adds a choice, explores recursively, then removes that choice.',
        'dynamic_programming': 'Reuses cached subproblems or earlier table entries.',
        'heap_top_k': 'Maintains a priority queue with heap operations.',
        'monotonic_stack': 'Pops from a stack while its top violates an ordering condition.',
        'prefix_sum': 'Builds cumulative totals and subtracts them to answer range queries.',
        'union_find': 'Follows and updates parent links to maintain disjoint sets.',
        'greedy': 'Processes sorted candidates and conditionally accepts a local choice.',
    }
    def award(kind, score):
        scores[kind] = max(scores.get(kind, 0), score)
    def name(node):
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return name(node.value) + '.' + node.attr
        return ''
    def calls(nodes):
        return [n for n in nodes if isinstance(n, ast.Call)]
    def method(n, attr):
        return isinstance(n.func, ast.Attribute) and n.func.attr == attr
    def base(n):
        while isinstance(n, ast.Subscript):
            n = n.value
        return name(n)
    aliases = {}
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            for a in n.names:
                aliases[a.asname or a.name] = a.name
        elif isinstance(n, ast.ImportFrom):
            for a in n.names:
                aliases[a.asname or a.name] = (n.module or '') + '.' + a.name
    def canonical(n):
        parts = name(n).split('.')
        return '.'.join([aliases.get(parts[0], parts[0]), *parts[1:]])
    # Scope each analysis to one function, excluding nested helpers.
    def local_walk(node):
        yield node
        for child in ast.iter_child_nodes(node):
            if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                yield from local_walk(child)
    functions = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    for fn in functions:
        nodes = list(local_walk(fn))
        cs = calls(nodes)
        recursive = [c for c in cs if name(c.func) in (fn.name, 'self.' + fn.name)]
        if recursive:
            award('dfs', .66)
        for dec in fn.decorator_list:
            target = dec.func if isinstance(dec, ast.Call) else dec
            if canonical(target) in ('cache', 'lru_cache', 'functools.cache', 'functools.lru_cache') and recursive:
                award('dynamic_programming', .96)
        for c in cs:
            if canonical(c.func) in ('heapq.heappush', 'heapq.heappop', 'heapq.heapify',
                                     'heapq.heappushpop', 'heapq.heapreplace', 'heapq.nlargest', 'heapq.nsmallest'):
                award('heap_top_k', .9)
        if recursive:
            for push in cs:
                if method(push, 'append'):
                    if any(method(pop, 'pop') and not pop.args and
                           name(pop.func.value) == name(push.func.value) and
                           push.lineno < rec.lineno < pop.lineno
                           for pop in cs for rec in recursive):
                        award('backtracking', .95)
            parents = [n for n in nodes if isinstance(n, ast.Subscript) and isinstance(n.ctx, ast.Store)]
            if fn.name == 'find' and any(
                base(p) in {'parent', 'parents', 'self.parent', 'self.parents'} for p in parents
            ):
                award('union_find', .98)
        next_steps = {}
        for n in nodes:
            if isinstance(n, ast.Assign) and isinstance(n.value, ast.Attribute):
                for t in n.targets:
                    dest = name(t)
                    path = name(n.value)
                    if dest and path.startswith(dest + '.'):
                        next_steps[dest] = path[len(dest):]
        if '.next' in next_steps.values() and '.next.next' in next_steps.values():
            award('fast_slow_pointers', .98)
        for loop in [n for n in nodes if isinstance(n, (ast.While, ast.For))]:
            ln = list(local_walk(loop))
            lc = calls(ln)
            if any(method(c, 'popleft') for c in lc):
                queues = {name(c.func.value) for c in lc if method(c, 'popleft')}
                if any(isinstance(n, ast.Assign) and isinstance(n.value, ast.Call)
                       and canonical(n.value.func) in ('deque', 'collections.deque')
                       and any(name(t) in queues for t in n.targets) for n in nodes):
                    award('bfs', .9)
            if isinstance(loop, ast.While):
                test = list(ast.walk(loop.test))
                top_arrays = {base(n) for n in test if isinstance(n, ast.Subscript)
                              and isinstance(n.slice, ast.UnaryOp) and isinstance(n.slice.op, ast.USub)
                              and isinstance(n.slice.operand, ast.Constant) and n.slice.operand.value == 1}
                if any(isinstance(n, ast.Compare) for n in test) and any(
                    method(c, 'pop') and not c.args and name(c.func.value) in top_arrays for c in lc
                ):
                    award('monotonic_stack', .97)
                moves = [n for n in ln if isinstance(n, ast.AugAssign)]
                plus = {name(n.target) for n in moves if isinstance(n.op, ast.Add)}
                minus = {name(n.target) for n in moves if isinstance(n.op, ast.Sub)}
                test_names = {n.id for n in test if isinstance(n, ast.Name)}
                if plus & test_names and minus & test_names:
                    award('two_pointer', .84)
                mids = [n for n in ln if isinstance(n, ast.Assign) and isinstance(n.value, ast.BinOp)
                        and isinstance(n.value.op, ast.FloorDiv)
                        and isinstance(n.value.right, ast.Constant) and n.value.right.value == 2
                        and isinstance(n.value.left, ast.BinOp) and isinstance(n.value.left.op, ast.Add)]
                for mid in mids:
                    mid_names = {name(t) for t in mid.targets}
                    if any(isinstance(n, ast.Assign) and isinstance(n.value, ast.BinOp)
                           and isinstance(n.value.op, (ast.Add, ast.Sub))
                           and name(n.value.left) in mid_names
                           and any(name(t) in test_names for t in n.targets) for n in ln):
                        award('binary_search', .96)
            if isinstance(loop, ast.For):
                for inner in [n for n in ln if isinstance(n, ast.While)]:
                    ins = list(local_walk(inner))
                    if any(isinstance(n, ast.AugAssign) and isinstance(n.op, ast.Add)
                           and isinstance(n.value, ast.Constant) and n.value.value == 1 for n in ins) and any(
                        isinstance(n, ast.Delete) or isinstance(n, ast.AugAssign) and isinstance(n.op, ast.Sub)
                        for n in ins
                    ):
                        award('sliding_window', .94)
            for a in [n for n in ln if isinstance(n, ast.Assign)]:
                for target in a.targets:
                    if not isinstance(target, ast.Subscript):
                        continue
                    reads = [n for n in ast.walk(a.value) if isinstance(n, ast.Subscript) and base(n) == base(target)]
                    offset_reads = [r for r in reads if any(isinstance(n, ast.BinOp) and
                                    isinstance(n.op, (ast.Add, ast.Sub)) for n in ast.walk(r.slice))]
                    target_offset = any(isinstance(n, ast.BinOp) and isinstance(n.op, (ast.Add, ast.Sub)) for n in ast.walk(target.slice))
                    if offset_reads or reads and target_offset:
                        award('dynamic_programming', .84)
                        # A cumulative recurrence plus a later difference of the same table.
                        if isinstance(a.value, ast.BinOp) and isinstance(a.value.op, ast.Add) and any(
                            isinstance(n, ast.BinOp) and isinstance(n.op, ast.Sub)
                            and isinstance(n.left, ast.Subscript) and isinstance(n.right, ast.Subscript)
                            and base(n.left) == base(target) == base(n.right) for n in nodes
                        ):
                            award('prefix_sum', .97)
        # Deliberately low confidence: sorting alone is never a greedy signal.
        if any(canonical(c.func) == 'sorted' or method(c, 'sort') for c in cs):
            if any(isinstance(n, ast.For) and any(isinstance(i, ast.If) and any(
                isinstance(x, ast.AugAssign) or isinstance(x, ast.Call) and method(x, 'append')
                for x in ast.walk(i)) for i in local_walk(n)) for n in nodes):
                award('greedy', .61)
    if not scores:
        return None
    best = max(scores, key=scores.get)
    return {'type': best, 'confidence': scores[best], 'description': descriptions[best]}


def run_traced(code_string, examples=None):
    global _user_max_line, _usage, _visual_lines, _learning_lines, _window_specs, _binary_specs, _operation_roles

    _user_max_line = code_string.count('\n') + 1

    # Compile with filename '<exec>' so the tracer filter matches; exec()'s
    # default is '<string>', which would silently reject every line event.
    try:
        compiled = compile(code_string, USER_FILENAME, 'exec')
    except SyntaxError as exc:
        return _dump({
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

    _operation_roles = _operation_analyze(tree) if tree is not None else {}
    _usage = _analyze_usage(tree) if tree is not None else {}
    _visual_lines = _analyze_visual_lines(tree) if tree is not None else {}
    _learning_lines = _analyze_learning_lines(tree) if tree is not None else {}
    _window_specs = _analyze_window_specs(tree) if tree is not None else {}
    _binary_specs = _analyze_binary_specs(tree) if tree is not None else {}
    indexing = _analyze_indexing(tree) if tree is not None else {}

    namespace = _build_namespace()
    candidates = _build_arg_candidates(tree, examples, namespace)
    if examples and not candidates and _find_solution_method(tree) is not None:
        return _dump({
            'snapshots': [], 'truncated': False, 'limit': None,
            'indexing': indexing, 'returnValue': None,
            'error': {'message': 'Could not parse the testcase inputs. Check that each value is a valid Python or JSON literal.', 'line': 1},
        })

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
        'pattern': _detect_pattern(tree) if tree is not None else None,
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

    return _dump(result)
