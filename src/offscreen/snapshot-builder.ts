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
