import type {
  Snapshot,
  DataStructureState,
  Pointer,
  Highlight,
  DetectedPattern,
} from '../shared/types';
import { MAX_EXECUTION_TIME, MAX_SNAPSHOTS, POINTER_COLORS } from '../shared/constants';

interface PyodideInstance {
  runPython: (code: string) => unknown;
  globals: {
    set: (name: string, value: unknown) => void;
    get: (name: string) => unknown;
  };
}

let pyodide: PyodideInstance | null = null;
let initPromise: Promise<void> | null = null;

export type ExecuteResult =
  | { snapshots: Snapshot[]; pattern?: DetectedPattern }
  | { error: string; line?: number };

// Pyodide is shipped inside the extension at /pyodide/ — see scripts/copy-pyodide.mjs
function pyodideUrl(file: string): string {
  return chrome.runtime.getURL(`pyodide/${file}`);
}

async function loadPyodideLocal(): Promise<PyodideInstance> {
  const mod = (await import(/* @vite-ignore */ pyodideUrl('pyodide.mjs'))) as {
    loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance>;
  };
  return mod.loadPyodide({ indexURL: pyodideUrl('') });
}

const TRACER_SCRIPT = `
import sys
import json
import ast
import re

_snapshots = []
_prev_locals = {}
_user_max_line = 10**9
_MAX_SNAPSHOTS = ${MAX_SNAPSHOTS}

# Names that _build_namespace() injects (typing helpers, ListNode/TreeNode,
# stdlib modules). These are not user variables, so they should never appear
# as snapshot variables or count toward "is this snapshot interesting?".
_BASELINE_NAMES = frozenset({
    'List', 'Dict', 'Set', 'Tuple', 'Optional', 'Any', 'Union', 'Deque',
    'defaultdict', 'deque', 'Counter', 'OrderedDict',
    'math', 'heapq', 'bisect', 'functools', 'itertools',
    'ListNode', 'TreeNode', 'Solution',
    '__leettrace_sol',
})

def _serialize(v, _depth=0):
    if v is None or isinstance(v, (bool, int, float, str)):
        return v

    if isinstance(v, (list, tuple)):
        return [_serialize(x, _depth + 1) for x in v]

    if isinstance(v, dict):
        return {str(k): _serialize(val, _depth + 1) for k, val in v.items()}

    if isinstance(v, set):
        try:
            return sorted([_serialize(x, _depth + 1) for x in v], key=str)
        except Exception:
            return [_serialize(x, _depth + 1) for x in v]

    if (hasattr(v, 'val') and hasattr(v, 'next')
            and not hasattr(v, 'left') and not hasattr(v, 'right')):
        nodes = []
        seen = set()
        cur = v
        has_cycle = False
        while cur is not None:
            node_id = id(cur)
            if node_id in seen:
                has_cycle = True
                break
            seen.add(node_id)
            nodes.append(_serialize(cur.val))
            cur = cur.next
        return {'__type': 'linked_list', 'nodes': nodes, 'has_cycle': has_cycle}

    if hasattr(v, 'val') and hasattr(v, 'left') and hasattr(v, 'right'):
        if _depth > 10:
            return repr(v)
        return {'__type': 'tree', 'root': _serialize_tree_node(v, _depth)}

    return repr(v)


def _serialize_tree_node(node, depth=0):
    if node is None or depth > 10:
        return None
    return {
        'val': _serialize(node.val),
        'left': _serialize_tree_node(getattr(node, 'left', None), depth + 1),
        'right': _serialize_tree_node(getattr(node, 'right', None), depth + 1),
    }


def _tracer(frame, event, arg):
    global _prev_locals

    if frame.f_code.co_filename != '<exec>':
        return _tracer

    # Suppress snapshots for the auto-injected runner stub (lines beyond the
    # user's original code). We still keep tracing because calls into the user's
    # method body originate from here.
    if frame.f_lineno > _user_max_line:
        return _tracer

    if event in ('line', 'return'):
        if len(_snapshots) >= _MAX_SNAPSHOTS:
            sys.settrace(None)
            return None

        current_locals = {}
        for k, v in frame.f_locals.items():
            if k.startswith('_') or k in _BASELINE_NAMES:
                continue
            try:
                serialized = _serialize(v)
                current_locals[k] = {
                    'value': serialized,
                    'type': type(v).__name__,
                    'changed': k not in _prev_locals or _prev_locals.get(k) != repr(v),
                }
            except Exception:
                current_locals[k] = {
                    'value': repr(v),
                    'type': type(v).__name__,
                    'changed': True,
                }

        is_module_frame = frame.f_code.co_name == '<module>'

        if event == 'return':
            # Surface the returned value as a synthetic 'return' variable so the
            # user can see the function's result on the final snapshot. Skip
            # returns from the module frame (those are the runner-stub epilogue).
            if not is_module_frame and arg is not None:
                try:
                    serialized = _serialize(arg)
                    current_locals['return'] = {
                        'value': serialized,
                        'type': type(arg).__name__,
                        'changed': True,
                    }
                except Exception:
                    current_locals['return'] = {
                        'value': repr(arg),
                        'type': type(arg).__name__,
                        'changed': True,
                    }
            elif is_module_frame:
                return _tracer

        # Skip class-definition / runner-stub line events that have no user
        # variables — these would otherwise show up as empty "junk" steps before
        # the real method body executes.
        if is_module_frame and not current_locals:
            return _tracer

        _snapshots.append({
            'step': len(_snapshots),
            'line': frame.f_lineno,
            'variables': current_locals,
        })

        _prev_locals = {
            k: repr(v) for k, v in frame.f_locals.items()
            if not k.startswith('_') and k not in _BASELINE_NAMES
        }

    return _tracer


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


def _deepest_user_line(tb):
    # Walk to the deepest traceback frame inside user code ('<exec>'); fall
    # back to the deepest frame overall, then to 0.
    line = 0
    cur = tb
    while cur is not None:
        if cur.tb_frame.f_code.co_filename == '<exec>':
            line = cur.tb_lineno
        cur = cur.tb_next
    if line == 0 and tb is not None:
        cur = tb
        while cur.tb_next is not None:
            cur = cur.tb_next
        line = cur.tb_lineno
    return line


def _build_auto_runner(code_string, examples):
    # Returns a snippet that instantiates Solution and invokes its first
    # public method using kwargs parsed from a LeetCode example input string
    # like "nums = [2,7,11,15], target = 9". Returns None when the user's
    # code already calls something at the top level, when there's no
    # Solution class, or when no usable example is available.
    if not examples:
        return None

    try:
        tree = ast.parse(code_string)
    except SyntaxError:
        return None

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

    method_name = None
    for node in sol_class.body:
        if isinstance(node, ast.FunctionDef) and not node.name.startswith('_'):
            method_name = node.name
            break

    if method_name is None:
        return None

    for example in examples:
        # LeetCode inputs look like "nums = [2,7,11,15], target = 9".
        # dict(nums = [2,7,11,15], target = 9) is valid Python and gives us
        # the kwargs dict directly — much safer than hand-splitting on commas.
        py_example = re.sub(r'\\bnull\\b', 'None', example)
        py_example = re.sub(r'\\btrue\\b', 'True', py_example)
        py_example = re.sub(r'\\bfalse\\b', 'False', py_example)
        wrapped = 'dict(' + py_example + ')'
        try:
            ast.parse(wrapped, mode='eval')
        except SyntaxError:
            continue
        return '\\n__leettrace_sol = Solution()\\n__leettrace_sol.' + method_name + '(**' + wrapped + ')\\n'

    return None


def run_traced(code_string, examples=None):
    global _snapshots, _prev_locals, _user_max_line
    _snapshots = []
    _prev_locals = {}
    _user_max_line = code_string.count('\\n') + 1

    runner = _build_auto_runner(code_string, examples or [])
    full_code = code_string + (runner or '')

    # Compile with filename '<exec>' so the tracer filter
    # (frame.f_code.co_filename == '<exec>') matches; the default for exec() is
    # '<string>', which would silently reject every line event.
    compiled = compile(full_code, '<exec>', 'exec')

    namespace = _build_namespace()
    sys.settrace(_tracer)
    try:
        exec(compiled, namespace)
    except Exception as exc:
        _snapshots.append({
            'step': len(_snapshots),
            'line': _deepest_user_line(getattr(exc, '__traceback__', None)),
            'error': type(exc).__name__ + ': ' + str(exc),
            'variables': {},
        })
    finally:
        sys.settrace(None)

    return json.dumps(_snapshots)
`;

export async function initPyodide(): Promise<void> {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 0 } });
    const instance = await loadPyodideLocal();
    broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 80 } });
    instance.runPython(TRACER_SCRIPT);
    pyodide = instance;
    broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 100 } });
    broadcastToPanel({ type: 'PYODIDE_READY' });
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export async function executePython(
  code: string,
  examples: string[] = [],
): Promise<ExecuteResult> {
  if (!pyodide) {
    await initPyodide();
  }

  let rawJson: string;
  try {
    const result = await Promise.race([runWithPyodide(code, examples), timeout(MAX_EXECUTION_TIME)]);
    rawJson = result as string;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  let rawSnapshots: RawSnapshot[];
  try {
    rawSnapshots = JSON.parse(rawJson) as RawSnapshot[];
  } catch {
    return { error: 'Failed to parse execution output' };
  }

  const lastSnap = rawSnapshots[rawSnapshots.length - 1];
  if (lastSnap && 'error' in lastSnap && typeof lastSnap.error === 'string') {
    return { error: lastSnap.error, line: lastSnap.line };
  }

  return {
    snapshots: rawSnapshots.map(processSnapshot),
    pattern: detectPattern(code),
  };
}

async function runWithPyodide(code: string, examples: string[]): Promise<string> {
  pyodide!.globals.set('__user_code', code);
  pyodide!.globals.set('__user_examples', examples);
  return pyodide!.runPython(
    'run_traced(__user_code, list(__user_examples) if __user_examples is not None else [])',
  ) as string;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Execution timed out after ${ms / 1000}s`)), ms),
  );
}

function broadcastToPanel(message: object): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Panel may not be open — ignore.
  });
}

interface RawVariable {
  value: unknown;
  type: string;
  changed: boolean;
}

interface RawSnapshot {
  step: number;
  line: number;
  variables: Record<string, RawVariable>;
  error?: string;
}

function processSnapshot(raw: RawSnapshot): Snapshot {
  const dataStructures: DataStructureState[] = [];
  const highlights: Highlight[] = [];

  for (const [name, variable] of Object.entries(raw.variables)) {
    const ds = buildDataStructure(name, variable);
    if (ds) dataStructures.push(ds);
  }

  let colorIdx = 0;
  for (const [name, variable] of Object.entries(raw.variables)) {
    if (variable.type !== 'int') continue;
    const idx = variable.value as number;

    for (const ds of dataStructures) {
      if (ds.type === 'array') {
        const arr = ds.data as unknown[];
        if (Number.isInteger(idx) && idx >= 0 && idx < arr.length) {
          const pointer: Pointer = {
            name,
            index: idx,
            color: POINTER_COLORS[colorIdx % POINTER_COLORS.length],
          };
          ds.pointers.push(pointer);
          colorIdx++;

          if (variable.changed) {
            highlights.push({ structureId: ds.id, indices: [idx], type: 'current' });
          }
        }
      }
    }
  }

  return {
    step: raw.step,
    line: raw.line,
    variables: raw.variables,
    dataStructures,
    highlights,
  };
}

function buildDataStructure(name: string, variable: RawVariable): DataStructureState | null {
  const { value, type } = variable;

  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { __type?: string }).__type === 'linked_list'
  ) {
    return { id: name, type: 'linked_list', data: value, pointers: [] };
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { __type?: string }).__type === 'tree'
  ) {
    return { id: name, type: 'tree', data: value, pointers: [] };
  }

  if (type === 'list' && Array.isArray(value)) {
    const isMatrix =
      value.length > 0 &&
      Array.isArray(value[0]) &&
      (value[0] as unknown[]).every((x) => !Array.isArray(x));

    return {
      id: name,
      type: isMatrix ? 'matrix' : 'array',
      data: value,
      pointers: [],
    };
  }

  if (type === 'dict') {
    return { id: name, type: 'hashmap', data: value, pointers: [] };
  }

  return null;
}

export function detectPattern(code: string): DetectedPattern | undefined {
  const lines = code.split('\n');
  const full = code;

  if (
    /while\s+\w*lo\w*\s*<=?\s*\w*hi\w*/i.test(full) ||
    /while\s+\w*left\w*\s*<=?\s*\w*right\w*/i.test(full) ||
    (/\bmid\b/.test(full) && /\blo\b|\bleft\b/.test(full) && /\bhi\b|\bright\b/.test(full))
  ) {
    return {
      type: 'binary_search',
      confidence: 0.85,
      description:
        'Binary search: repeatedly halves the search space using two boundary pointers and a midpoint.',
    };
  }

  if (/\bdeque\b|\bqueue\b/i.test(full) && /\bappend\b|\bpopleft\b|\bappendleft\b/i.test(full)) {
    return {
      type: 'bfs',
      confidence: 0.85,
      description: 'Breadth-first search: explores nodes level by level using a queue.',
    };
  }

  const hasRecursion = lines.some((l) => {
    const fnMatch = l.match(/def\s+(\w+)\s*\(/);
    if (fnMatch) {
      return new RegExp(`\\b${fnMatch[1]}\\s*\\(`).test(
        lines.slice(lines.indexOf(l) + 1).join('\n'),
      );
    }
    return false;
  });
  if (hasRecursion && /\bvisited\b/i.test(full)) {
    return {
      type: 'dfs',
      confidence: 0.8,
      description:
        'Depth-first search: explores paths recursively, using a visited set to avoid revisiting nodes.',
    };
  }

  if (
    hasRecursion &&
    /\bappend\b/.test(full) &&
    /\bpop\b/.test(full) &&
    /result|res|ans/i.test(full)
  ) {
    return {
      type: 'backtracking',
      confidence: 0.75,
      description:
        'Backtracking: recursively builds candidates and abandons those that fail the constraints.',
    };
  }

  if (/@cache|@lru_cache/i.test(full) || /\[0\]\s*\*/.test(full) || /dp\s*=\s*\[/.test(full)) {
    return {
      type: 'dynamic_programming',
      confidence: 0.8,
      description:
        'Dynamic programming: breaks the problem into overlapping subproblems and memoizes results.',
    };
  }

  {
    const twoPointerPatterns = [
      /while\s+\w*left\w*\s*<\s*\w*right\w*/i,
      /while\s+\w*lo\w*\s*<\s*\w*hi\w*/i,
      /\bleft\s*\+=\s*1\b.*\bright\s*-=\s*1\b/is,
    ];
    if (twoPointerPatterns.some((p) => p.test(full))) {
      return {
        type: 'two_pointer',
        confidence: 0.8,
        description:
          'Two pointer: uses two indices moving toward each other to efficiently process sorted data.',
      };
    }
  }

  return undefined;
}
