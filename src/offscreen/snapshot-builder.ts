/**
 * Turns the tracer's raw Python output into the panel's Snapshot schema:
 * data structures, pointers and highlights are derived here in TypeScript
 * (docs/DESIGN.md §4 — the Python side only emits variables).
 */

import type {
  DataStructureState,
  Highlight,
  Pointer,
  Snapshot,
  StructureKind,
  TraceEvent,
  VariableState,
} from '../shared/types';
import { POINTER_COLORS } from '../shared/constants';

/** One snapshot exactly as `tracer.py` emits it. */
export interface RawSnapshot {
  step: number;
  line: number;
  event: TraceEvent;
  frameId: string;
  frameName: string;
  callDepth: number;
  variables: Record<string, VariableState>;
  stdout?: string;
}

/** The envelope `run_traced` returns. */
export interface RawTraceResult {
  snapshots: RawSnapshot[];
  truncated: boolean;
  limit: 'events' | 'snapshots' | 'time' | null;
  error: { message: string; line: number } | null;
  returnValue: unknown;
}

/**
 * Dict *families*, not exact type names (bug B4).
 *
 * Counter/defaultdict/OrderedDict are dict subclasses that serialize fine, but
 * `type` carries their own class name — so matching `type === 'dict'` sent
 * every counting and grouping problem to the raw JSON fallback.
 */
const DICT_LIKE_TYPES = new Set([
  'dict',
  'defaultdict',
  'OrderedDict',
  'Counter',
  'ChainMap',
  'mappingproxy',
]);

/** Sequence families. Tuples serialize to arrays and read the same way. */
const LIST_LIKE_TYPES = new Set(['list', 'tuple']);

/** Usage-derived kinds the tracer tags onto plain lists. */
const USAGE_KINDS = new Set<StructureKind>(['heap', 'stack']);

function taggedType(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const tag = (value as { __type?: unknown }).__type;
  return typeof tag === 'string' ? tag : null;
}

/**
 * A matrix is a rectangular-ish list of lists of scalars (bug B13).
 *
 * The old check tested only `value[0]`, so `[[]]` became a zero-column matrix
 * and `[[1,2],[3,[4]]]` — jagged past row 0 — passed as one. Row lengths are
 * allowed to differ (a triangular DP table is still a grid), but every row
 * must be a list, at least one must be non-empty, and no cell may itself be a
 * list.
 */
export function isMatrix(value: unknown[]): boolean {
  if (value.length === 0) return false;
  if (!value.every((row) => Array.isArray(row))) return false;

  const rows = value as unknown[][];
  if (!rows.some((row) => row.length > 0)) return false;

  return rows.every((row) => row.every((cell) => !Array.isArray(cell)));
}

export function processSnapshot(raw: RawSnapshot): Snapshot {
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
    event: raw.event,
    frameId: raw.frameId,
    frameName: raw.frameName,
    callDepth: raw.callDepth,
    variables: raw.variables,
    dataStructures,
    highlights,
    ...(raw.stdout ? { stdout: raw.stdout } : {}),
  };
}

export function buildDataStructure(
  name: string,
  variable: VariableState,
): DataStructureState | null {
  const { value, type, kind } = variable;

  // 1. Structural tags the tracer attached — the value's own shape.
  switch (taggedType(value)) {
    case 'linked_list':
      return { id: name, type: 'linked_list', data: value, pointers: [] };
    case 'tree':
      return { id: name, type: 'tree', data: value, pointers: [] };
    case 'deque':
      return { id: name, type: 'queue', data: value, pointers: [] };
    case 'set':
      return { id: name, type: 'set', data: value, pointers: [] };
  }

  // 2. Usage tags — a heap and a stack are both `list` at runtime, so only the
  //    tracer's static analysis of how the code uses the name can tell them
  //    apart.
  if (Array.isArray(value) && kind && USAGE_KINDS.has(kind as StructureKind)) {
    return { id: name, type: kind as StructureKind, data: value, pointers: [] };
  }

  // 3. Families.
  if (Array.isArray(value) && LIST_LIKE_TYPES.has(type)) {
    return {
      id: name,
      type: isMatrix(value) ? 'matrix' : 'array',
      data: value,
      pointers: [],
    };
  }

  if (DICT_LIKE_TYPES.has(type) && value !== null && typeof value === 'object') {
    return { id: name, type: 'hashmap', data: value, pointers: [] };
  }

  return null;
}
