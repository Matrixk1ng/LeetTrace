/**
 * Formatting shared by every visualizer, so a value reads the same whichever
 * card it lands in — and always in Python's spelling, not JavaScript's.
 */

import type { Highlight } from '../../../shared/types';
import { HIGHLIGHT_COLORS } from '../../../shared/constants';

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text;
}

export const HIGHLIGHT_BG: Record<Highlight['type'], string> = {
  compare: 'rgba(252, 211, 77, 0.18)',
  visit: 'rgba(96, 165, 250, 0.18)',
  swap: 'rgba(251, 146, 60, 0.18)',
  current: 'rgba(167, 139, 250, 0.20)',
  result: 'rgba(74, 222, 128, 0.20)',
};

/** Strongest wins when a cell carries several highlights at once. */
const HIGHLIGHT_PRIORITY: Highlight['type'][] = ['result', 'swap', 'compare', 'visit', 'current'];

export const IDLE_BORDER = '#2d3a5c';
export const IDLE_BG = '#16213e';

export function pickStrongestHighlight(
  types: Set<Highlight['type']> | undefined,
): Highlight['type'] | null {
  if (!types) return null;
  for (const type of HIGHLIGHT_PRIORITY) {
    if (types.has(type)) return type;
  }
  return null;
}

/** index → highlight types, for one structure. */
export function highlightsByIndex(
  highlights: Highlight[],
  structureId: string,
): Map<number, Set<Highlight['type']>> {
  const byIndex = new Map<number, Set<Highlight['type']>>();
  for (const highlight of highlights) {
    if (highlight.structureId !== structureId) continue;
    for (const index of highlight.indices) {
      let set = byIndex.get(index);
      if (!set) {
        set = new Set();
        byIndex.set(index, set);
      }
      set.add(highlight.type);
    }
  }
  return byIndex;
}

export function cellColors(type: Highlight['type'] | null): { border: string; background: string } {
  return type
    ? { border: HIGHLIGHT_COLORS[type], background: HIGHLIGHT_BG[type] }
    : { border: IDLE_BORDER, background: IDLE_BG };
}

/** Sequence payloads: arrays are flat, deque/set arrive as `{__type, items}`. */
export function itemsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const items = (data as { items?: unknown })?.items;
  return Array.isArray(items) ? items : [];
}
