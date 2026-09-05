/**
 * Turns the tracer's raw Python output into the panel's Snapshot schema:
 * data structures, pointers and highlights are derived here in TypeScript
 * (docs/DESIGN.md §4 — the Python side only emits variables plus the static
 * analysis results it can only compute from the AST).
 */

import type {
  DataStructureState,
  Highlight,
  NodePointer,
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

/** Which variables actually index which arrays, per the tracer's AST pass. */
export type IndexingMap = Record<string, { row: string[]; col: string[] }>;

/** The envelope `run_traced` returns. */
export interface RawTraceResult {
  snapshots: RawSnapshot[];
  truncated: boolean;
  limit: 'events' | 'snapshots' | 'time' | null;
  error: { message: string; line: number } | null;
  returnValue: unknown;
  indexing: IndexingMap;
}

interface LinkedListData {
  __type: 'linked_list';
  nodes: unknown[];
  nodeIds: string[];
  has_cycle: boolean;
  cycleIndex: number;
}

interface TreeNodeData {
  id: string;
  val: unknown;
  left: TreeNodeData | null;
  right: TreeNodeData | null;
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

/** Kinds whose `data` is a flat sequence an index pointer can address. */
const SEQUENCE_KINDS = new Set<StructureKind>(['array', 'stack', 'heap']);

function taggedType(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const tag = (value as { __type?: unknown }).__type;
  return typeof tag === 'string' ? tag : null;
}

/**
 * Hands each pointer name one colour for the whole trace (bug B3).
 *
 * Colours used to be handed out per snapshot with a counter that advanced on
 * every attach, so the same variable changed colour between steps and between
 * arrays. One assigner per trace keeps a name's colour fixed.
 */
export function createColorAssigner(indexing: IndexingMap = {}): (name: string) => string {
  const colors = new Map<string, string>();

  const take = (name: string): string => {
    const existing = colors.get(name);
    if (existing) return existing;
    const color = POINTER_COLORS[colors.size % POINTER_COLORS.length];
    colors.set(name, color);
    return color;
  };

  // Seed from the static map so colours depend on the code, not on which step
  // happened to mention a name first.
  for (const axes of Object.values(indexing)) {
    for (const name of [...axes.row, ...axes.col]) take(name);
  }

  return take;
}

export interface TraceContext {
  indexing: IndexingMap;
  colorOf: (name: string) => string;
}

export function createTraceContext(indexing: IndexingMap = {}): TraceContext {
  return { indexing, colorOf: createColorAssigner(indexing) };
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

// ---------------------------------------------------------------------------
// Pointers
// ---------------------------------------------------------------------------

function intValue(variable: VariableState | undefined): number | null {
  if (!variable || variable.type !== 'int') return null;
  const value = variable.value;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Index pointers, built only for arrays a variable demonstrably indexes.
 *
 * The old rule attached every in-range int to every array, so `target = 9`
 * rendered as an arrow on a 15-element `nums` and counters like `n`/`total`
 * looked like cursors (bug B3).
 */
function attachIndexPointers(
  ds: DataStructureState,
  variables: Record<string, VariableState>,
  context: TraceContext,
  highlights: Highlight[],
): void {
  const axes = context.indexing[ds.id];
  if (!axes) return;

  if (SEQUENCE_KINDS.has(ds.type)) {
    const length = (ds.data as unknown[]).length;
    for (const name of [...axes.row, ...axes.col]) {
      const index = intValue(variables[name]);
      if (index === null || index < 0 || index >= length) continue;

      ds.pointers.push({ name, index, color: context.colorOf(name) });
      if (variables[name].changed) {
        highlights.push({ structureId: ds.id, indices: [index], type: 'current' });
      }
    }
    return;
  }

  if (ds.type === 'matrix') {
    attachMatrixPointers(ds, variables, context, axes, highlights);
  }
}

/**
 * Matrix pointers carry which axis they move along: `cell.col === -1` marks a
 * row cursor, `cell.row === -1` a column cursor. MatrixViz draws the marker on
 * that axis and highlights the intersection of the two.
 */
function attachMatrixPointers(
  ds: DataStructureState,
  variables: Record<string, VariableState>,
  context: TraceContext,
  axes: { row: string[]; col: string[] },
  highlights: Highlight[],
): void {
  const rows = ds.data as unknown[][];

  let activeRow = -1;
  let activeCol = -1;

  for (const name of axes.row) {
    const index = intValue(variables[name]);
    if (index === null || index < 0 || index >= rows.length) continue;
    ds.pointers.push({ name, index, cell: { row: index, col: -1 }, color: context.colorOf(name) });
    if (activeRow === -1) activeRow = index;
  }

  const width = Math.max(0, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
  for (const name of axes.col) {
    const index = intValue(variables[name]);
    if (index === null || index < 0 || index >= width) continue;
    ds.pointers.push({ name, index, cell: { row: -1, col: index }, color: context.colorOf(name) });
    if (activeCol === -1) activeCol = index;
  }

  if (activeRow >= 0 && activeCol >= 0 && activeCol < (rows[activeRow]?.length ?? 0)) {
    highlights.push({
      structureId: ds.id,
      indices: [activeRow * width + activeCol],
      type: 'current',
    });
  }
}

/** Pre-order ids of a serialized tree — the order NodePointer.nodeIndex uses. */
function treeNodeIds(root: TreeNodeData | null | undefined, out: string[] = []): string[] {
  if (!root) return out;
  out.push(root.id);
  treeNodeIds(root.left, out);
  treeNodeIds(root.right, out);
  return out;
}

function nodeIdsOf(ds: DataStructureState): string[] {
  if (ds.type === 'linked_list') {
    const ids = (ds.data as LinkedListData).nodeIds;
    return Array.isArray(ids) ? ids : [];
  }
  return treeNodeIds((ds.data as { root?: TreeNodeData | null }).root);
}

/**
 * Collapse variables that alias a node of a bigger structure into pointers on
 * it.
 *
 * `slow`, `fast` and `curr` each serialize as a whole linked list of their own,
 * so a cycle-detection trace used to render three overlapping chains instead of
 * one list with three cursors on it. Node identity (`nodeIds`, and `id` on tree
 * nodes) is what makes the aliasing visible.
 */
function collapseNodeAliases(dataStructures: DataStructureState[], context: TraceContext): DataStructureState[] {
  const kept: DataStructureState[] = [];

  for (const kind of ['linked_list', 'tree'] as const) {
    const group = dataStructures.filter((ds) => ds.type === kind);
    if (group.length === 0) continue;

    const ids = new Map(group.map((ds) => [ds.id, nodeIdsOf(ds)]));

    // The primary is the largest structure; ties go to the one that appeared
    // first, so the choice is stable from step to step.
    const primaries: DataStructureState[] = [];
    for (const ds of group) {
      const own = ids.get(ds.id)!;
      const host = primaries.find((p) => ids.get(p.id)!.includes(own[0]));
      if (!host) primaries.push(ds);
    }

    for (const ds of group) {
      const own = ids.get(ds.id)!;
      const host = primaries.find(
        (p) => p !== ds && own.length > 0 && ids.get(p.id)!.includes(own[0]),
      );

      if (host) {
        const nodeIndex = ids.get(host.id)!.indexOf(own[0]);
        const pointer: NodePointer = { name: ds.id, nodeIndex, color: context.colorOf(ds.id) };
        host.nodePointers = [...(host.nodePointers ?? []), pointer];
      } else {
        kept.push(ds);
      }
    }
  }

  const collapsedKinds = new Set(['linked_list', 'tree']);
  return dataStructures.filter((ds) => !collapsedKinds.has(ds.type) || kept.includes(ds));
}

// ---------------------------------------------------------------------------

export function processSnapshot(raw: RawSnapshot, context: TraceContext): Snapshot {
  const dataStructures: DataStructureState[] = [];
  const highlights: Highlight[] = [];

  for (const [name, variable] of Object.entries(raw.variables)) {
    const ds = buildDataStructure(name, variable);
    if (ds) dataStructures.push(ds);
  }

  const sorted = group(dataStructures, context);

  for (const ds of sorted) {
    attachIndexPointers(ds, raw.variables, context, highlights);
  }

  return {
    step: raw.step,
    line: raw.line,
    event: raw.event,
    frameId: raw.frameId,
    frameName: raw.frameName,
    callDepth: raw.callDepth,
    variables: raw.variables,
    dataStructures: sorted,
    highlights,
    ...(raw.stdout ? { stdout: raw.stdout } : {}),
  };
}

function group(dataStructures: DataStructureState[], context: TraceContext): DataStructureState[] {
  const hasNodes = dataStructures.some((ds) => ds.type === 'linked_list' || ds.type === 'tree');
  return hasNodes ? collapseNodeAliases(dataStructures, context) : dataStructures;
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
