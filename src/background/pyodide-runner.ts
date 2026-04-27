import type { Snapshot, DataStructureState, Pointer, Highlight, DetectedPattern } from '../shared/types';
import { PYODIDE_CDN, MAX_EXECUTION_TIME, MAX_SNAPSHOTS, POINTER_COLORS } from '../shared/constants';

// ---------------------------------------------------------------------------
// Pyodide globals
// ---------------------------------------------------------------------------
interface PyodideInstance {
  runPython: (code: string) => unknown;
  globals: {
    set: (name: string, value: unknown) => void;
    get: (name: string) => unknown;
  };
}

let pyodide: PyodideInstance | null = null;

// Module service workers do not support importScripts(); use a dynamic import
// against the ESM build of Pyodide instead.  The manifest's CSP must include
// cdn.jsdelivr.net for this to be permitted.
async function loadPyodideFromCDN(): Promise<PyodideInstance> {
  const mod = await import(
    /* @vite-ignore */
    `${PYODIDE_CDN}pyodide.mjs`
  ) as { loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance> };
  return mod.loadPyodide({ indexURL: PYODIDE_CDN });
}

// ---------------------------------------------------------------------------
// Python tracer — embedded as a template string, loaded once into Pyodide
// ---------------------------------------------------------------------------
const TRACER_SCRIPT = `
import sys
import json
import copy

_snapshots = []
_prev_locals = {}
_MAX_SNAPSHOTS = ${MAX_SNAPSHOTS}

# ---- serialization --------------------------------------------------------

def _serialize(v, _depth=0):
    """Convert any Python value to a JSON-safe structure."""
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

    # Linked-list detection: has .val and .next, but not .left/.right
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

    # Tree detection: has .val, .left, .right
    if hasattr(v, 'val') and hasattr(v, 'left') and hasattr(v, 'right'):
        if _depth > 10:
            return repr(v)
        return {
            '__type': 'tree',
            'root': _serialize_tree_node(v, _depth),
        }

    return repr(v)


def _serialize_tree_node(node, depth=0):
    if node is None or depth > 10:
        return None
    return {
        'val': _serialize(node.val),
        'left': _serialize_tree_node(getattr(node, 'left', None), depth + 1),
        'right': _serialize_tree_node(getattr(node, 'right', None), depth + 1),
    }


# ---- tracer ---------------------------------------------------------------

def _tracer(frame, event, arg):
    global _prev_locals

    # Only trace user code (executed via exec → filename is '<exec>')
    if frame.f_code.co_filename != '<exec>':
        return _tracer

    if event == 'line':
        if len(_snapshots) >= _MAX_SNAPSHOTS:
            sys.settrace(None)
            return None

        current_locals = {}
        for k, v in frame.f_locals.items():
            if k.startswith('_'):
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

        _snapshots.append({
            'step': len(_snapshots),
            'line': frame.f_lineno,
            'variables': current_locals,
        })

        _prev_locals = {k: repr(v) for k, v in frame.f_locals.items() if not k.startswith('_')}

    return _tracer


# ---- public entry-point ---------------------------------------------------

def run_traced(code_string):
    global _snapshots, _prev_locals
    _snapshots = []
    _prev_locals = {}

    namespace = {}
    sys.settrace(_tracer)
    try:
        exec(code_string, namespace)  # noqa: S102
    except Exception as exc:
        _snapshots.append({
            'step': len(_snapshots),
            'line': getattr(exc, '__traceback__', None) and exc.__traceback__.tb_lineno or 0,
            'error': type(exc).__name__ + ': ' + str(exc),
            'variables': {},
        })
    finally:
        sys.settrace(None)

    return json.dumps(_snapshots)
`;

// ---------------------------------------------------------------------------
// initPyodide
// ---------------------------------------------------------------------------
export async function initPyodide(): Promise<void> {
  if (pyodide) return;

  broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 0 } });
  broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 30 } });

  pyodide = await loadPyodideFromCDN();

  broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 80 } });

  // Load tracer once
  pyodide.runPython(TRACER_SCRIPT);

  broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: 100 } });
  broadcastToPanel({ type: 'PYODIDE_READY' });
}

// ---------------------------------------------------------------------------
// executePython
// ---------------------------------------------------------------------------
export async function executePython(
  code: string,
): Promise<{ snapshots: Snapshot[]; pattern?: DetectedPattern } | { error: string; line?: number }> {
  if (!pyodide) {
    await initPyodide();
  }

  // Execution with timeout
  let rawJson: string;
  try {
    const result = await Promise.race([
      runWithPyodide(code),
      timeout(MAX_EXECUTION_TIME),
    ]);
    rawJson = result as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }

  // Parse raw snapshots
  let rawSnapshots: RawSnapshot[];
  try {
    rawSnapshots = JSON.parse(rawJson) as RawSnapshot[];
  } catch {
    return { error: 'Failed to parse execution output' };
  }

  // Check for Python-level error snapshot
  const lastSnap = rawSnapshots[rawSnapshots.length - 1];
  if (lastSnap && 'error' in lastSnap) {
    return { error: (lastSnap as { error: string; line?: number }).error, line: (lastSnap as { line?: number }).line };
  }

  // Post-process
  const snapshots = rawSnapshots.map((raw) => processSnapshot(raw));
  const pattern = detectPattern(code);

  return { snapshots, pattern };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function runWithPyodide(code: string): Promise<string> {
  // Use globals.set() to avoid string interpolation issues
  pyodide!.globals.set('__user_code', code);
  return pyodide!.runPython('run_traced(__user_code)') as string;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Execution timed out after ${ms / 1000}s`)), ms),
  );
}

function broadcastToPanel(message: object): void {
  // In MV3 service workers we send to all extension contexts
  chrome.runtime.sendMessage(message).catch(() => {
    // Panel may not be open yet — ignore
  });
}

// ---------------------------------------------------------------------------
// Raw snapshot type (from Python)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Post-processing: build full Snapshot from RawSnapshot
// ---------------------------------------------------------------------------
function processSnapshot(raw: RawSnapshot): Snapshot {
  const dataStructures: DataStructureState[] = [];
  const highlights: Highlight[] = [];

  // First pass: identify data structures
  for (const [name, variable] of Object.entries(raw.variables)) {
    const ds = buildDataStructure(name, variable);
    if (ds) {
      dataStructures.push(ds);
    }
  }

  // Second pass: detect pointers (int variable → valid index into an array)
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

          // Highlight current position when the pointer just moved
          if (variable.changed) {
            highlights.push({
              structureId: ds.id,
              indices: [idx],
              type: 'current',
            });
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

  // Linked list
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { __type?: string }).__type === 'linked_list'
  ) {
    return {
      id: name,
      type: 'linked_list',
      data: value,
      pointers: [],
    };
  }

  // Tree
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { __type?: string }).__type === 'tree'
  ) {
    return {
      id: name,
      type: 'tree',
      data: value,
      pointers: [],
    };
  }

  // Array or Matrix
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

  // Hashmap
  if (type === 'dict') {
    return {
      id: name,
      type: 'hashmap',
      data: value,
      pointers: [],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------
export function detectPattern(code: string): DetectedPattern | undefined {
  const lines = code.split('\n');
  const full = code;

  // Binary Search
  if (
    /while\s+\w*lo\w*\s*<=?\s*\w*hi\w*/i.test(full) ||
    /while\s+\w*left\w*\s*<=?\s*\w*right\w*/i.test(full) ||
    (/\bmid\b/.test(full) && /\blo\b|\bleft\b/.test(full) && /\bhi\b|\bright\b/.test(full))
  ) {
    return {
      type: 'binary_search',
      confidence: 0.85,
      description: 'Binary search: repeatedly halves the search space using two boundary pointers and a midpoint.',
    };
  }

  // BFS
  if (/\bdeque\b|\bqueue\b/i.test(full) && /\bappend\b|\bpopleft\b|\bappendleft\b/i.test(full)) {
    return {
      type: 'bfs',
      confidence: 0.85,
      description: 'Breadth-first search: explores nodes level by level using a queue.',
    };
  }

  // DFS (recursive + visited set)
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
      description: 'Depth-first search: explores paths recursively, using a visited set to avoid revisiting nodes.',
    };
  }

  // Backtracking
  if (
    hasRecursion &&
    /\bappend\b/.test(full) &&
    /\bpop\b/.test(full) &&
    /result|res|ans/i.test(full)
  ) {
    return {
      type: 'backtracking',
      confidence: 0.75,
      description: 'Backtracking: recursively builds candidates and abandons those that fail the constraints.',
    };
  }

  // Dynamic Programming
  if (/@cache|@lru_cache/i.test(full) || /\[0\]\s*\*/.test(full) || /dp\s*=\s*\[/.test(full)) {
    return {
      type: 'dynamic_programming',
      confidence: 0.8,
      description: 'Dynamic programming: breaks the problem into overlapping subproblems and memoizes results.',
    };
  }

  // Two Pointer
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
        description: 'Two pointer: uses two indices moving toward each other to efficiently process sorted data.',
      };
    }
  }

  return undefined;
}
