/**
 * M3 — pointer correctness (bug B3 and friends).
 *
 * The indexing maps here are what `tracer.py`'s `_analyze_indexing` produces;
 * that side is pinned in tests/tracer/test_pointers.py.
 */

import { describe, expect, it } from 'vitest';
import {
  createColorAssigner,
  createTraceContext,
  processSnapshot,
  type IndexingMap,
  type RawSnapshot,
} from '../../src/offscreen/snapshot-builder';
import type { VariableState } from '../../src/shared/types';
import { POINTER_COLORS } from '../../src/shared/constants';

function variable(
  partial: Partial<VariableState> & Pick<VariableState, 'value' | 'type'>,
): VariableState {
  return { changed: false, ...partial };
}

function snapshot(variables: Record<string, VariableState>, step = 0): RawSnapshot {
  return {
    step,
    line: 3,
    event: 'line',
    frameId: 'solve#1',
    frameName: 'solve',
    callDepth: 1,
    variables,
  };
}

function structure(snap: ReturnType<typeof processSnapshot>, id: string) {
  const found = snap.dataStructures.find((d) => d.id === id);
  if (!found) throw new Error(`no structure ${id} in [${snap.dataStructures.map((d) => d.id)}]`);
  return found;
}

// ---------------------------------------------------------------------------
// B3 — only real index variables become pointers
// ---------------------------------------------------------------------------

describe('index pointers (B3)', () => {
  const indexing: IndexingMap = { nums: { row: ['i'], col: [] } };

  it('attaches a variable that indexes the array', () => {
    const snap = processSnapshot(
      snapshot({
        nums: variable({ value: [2, 7, 11, 15], type: 'list' }),
        i: variable({ value: 2, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

    expect(structure(snap, 'nums').pointers).toEqual([
      { name: 'i', index: 2, color: expect.any(String) },
    ]);
  });

  it('does not attach an in-range int that never indexes the array', () => {
    // The headline B3 symptom: `target = 9` rendered as an arrow on `nums`.
    const snap = processSnapshot(
      snapshot({
        nums: variable({ value: [2, 7, 11, 15, 1, 3, 8, 4, 6, 0], type: 'list' }),
        target: variable({ value: 9, type: 'int' }),
        count: variable({ value: 3, type: 'int' }),
        n: variable({ value: 4, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

    expect(structure(snap, 'nums').pointers).toEqual([]);
  });

  it('does not attach an index variable to an array it does not index', () => {
    const snap = processSnapshot(
      snapshot({
        nums: variable({ value: [1, 2, 3], type: 'list' }),
        other: variable({ value: [9, 9, 9], type: 'list' }),
        i: variable({ value: 1, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

    expect(structure(snap, 'nums').pointers.map((p) => p.name)).toEqual(['i']);
    expect(structure(snap, 'other').pointers).toEqual([]);
  });

  it('drops an index that has run out of range', () => {
    const snap = processSnapshot(
      snapshot({
        nums: variable({ value: [1, 2, 3], type: 'list' }),
        i: variable({ value: 3, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

    expect(structure(snap, 'nums').pointers).toEqual([]);
  });

  it('highlights the cell only when the index changed on this step', () => {
    const context = createTraceContext(indexing);
    const moved = processSnapshot(
      snapshot({
        nums: variable({ value: [1, 2, 3], type: 'list' }),
        i: variable({ value: 1, type: 'int', changed: true }),
      }),
      context,
    );
    const still = processSnapshot(
      snapshot({
        nums: variable({ value: [1, 2, 3], type: 'list' }),
        i: variable({ value: 1, type: 'int', changed: false }),
      }),
      context,
    );

    expect(moved.highlights).toEqual([{ structureId: 'nums', indices: [1], type: 'current' }]);
    expect(still.highlights).toEqual([]);
  });

  it('attaches pointers to stacks and heaps too', () => {
    const snap = processSnapshot(
      snapshot({
        nums: variable({ value: [5, 6, 7], type: 'list', kind: 'stack' }),
        i: variable({ value: 1, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

    expect(structure(snap, 'nums').type).toBe('stack');
    expect(structure(snap, 'nums').pointers.map((p) => p.name)).toEqual(['i']);
  });
});

// ---------------------------------------------------------------------------
// Stable colours
// ---------------------------------------------------------------------------

describe('stable pointer colours (B3)', () => {
  it('gives a name the same colour on every step', () => {
    const context = createTraceContext({
      nums: { row: ['left', 'right'], col: [] },
    });

    const colorsAt = (left: number, right: number) => {
      const snap = processSnapshot(
        snapshot({
          nums: variable({ value: [1, 2, 3, 4, 5], type: 'list' }),
          left: variable({ value: left, type: 'int' }),
          right: variable({ value: right, type: 'int' }),
        }),
        context,
      );
      return Object.fromEntries(structure(snap, 'nums').pointers.map((p) => [p.name, p.color]));
    };

    const first = colorsAt(0, 4);
    const later = colorsAt(2, 3);

    expect(first.left).toBe(later.left);
    expect(first.right).toBe(later.right);
    expect(first.left).not.toBe(first.right);
  });

  it('gives one name one colour across different arrays', () => {
    // Colours used to advance a counter on every attach, so the same variable
    // was a different colour on each array it landed on.
    const context = createTraceContext({
      a: { row: ['i'], col: [] },
      b: { row: ['i'], col: [] },
    });

    const snap = processSnapshot(
      snapshot({
        a: variable({ value: [1, 2, 3], type: 'list' }),
        b: variable({ value: [4, 5, 6], type: 'list' }),
        i: variable({ value: 1, type: 'int' }),
      }),
      context,
    );

    expect(structure(snap, 'a').pointers[0].color).toBe(structure(snap, 'b').pointers[0].color);
  });

  it('assigns colours from the palette in order', () => {
    const colorOf = createColorAssigner();
    expect(colorOf('i')).toBe(POINTER_COLORS[0]);
    expect(colorOf('j')).toBe(POINTER_COLORS[1]);
    expect(colorOf('i')).toBe(POINTER_COLORS[0]);
  });
});

// ---------------------------------------------------------------------------
// Matrix row/col pointers
// ---------------------------------------------------------------------------

describe('matrix pointers', () => {
  const indexing: IndexingMap = { grid: { row: ['i'], col: ['j'] } };

  const snap = () =>
    processSnapshot(
      snapshot({
        grid: variable({ value: [[1, 2, 3], [4, 5, 6]], type: 'list' }),
        i: variable({ value: 1, type: 'int' }),
        j: variable({ value: 2, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

  it('marks the row cursor and the column cursor on their own axes', () => {
    const grid = structure(snap(), 'grid');
    expect(grid.type).toBe('matrix');
    expect(grid.pointers).toEqual([
      { name: 'i', index: 1, cell: { row: 1, col: -1 }, color: expect.any(String) },
      { name: 'j', index: 2, cell: { row: -1, col: 2 }, color: expect.any(String) },
    ]);
  });

  it('highlights the flattened cell where the two cross', () => {
    expect(snap().highlights).toEqual([
      { structureId: 'grid', indices: [1 * 3 + 2], type: 'current' },
    ]);
  });

  it('drops an axis cursor that is out of bounds', () => {
    const out = processSnapshot(
      snapshot({
        grid: variable({ value: [[1, 2], [3, 4]], type: 'list' }),
        i: variable({ value: 5, type: 'int' }),
        j: variable({ value: 1, type: 'int' }),
      }),
      createTraceContext(indexing),
    );

    expect(structure(out, 'grid').pointers.map((p) => p.name)).toEqual(['j']);
    expect(out.highlights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Node pointers
// ---------------------------------------------------------------------------

function list(ids: string[], values: number[], cycle = false, cycleIndex = -1) {
  return {
    __type: 'linked_list',
    nodes: values,
    nodeIds: ids,
    has_cycle: cycle,
    cycleIndex,
  };
}

describe('node pointers — linked lists', () => {
  it('collapses aliasing variables into cursors on the full list', () => {
    // slow/fast each serialize as a whole list of their own, so this used to
    // render three overlapping chains instead of one list with two cursors.
    const snap = processSnapshot(
      snapshot({
        head: variable({ value: list(['a', 'b', 'c', 'd'], [1, 2, 3, 4]), type: 'ListNode' }),
        slow: variable({ value: list(['b', 'c', 'd'], [2, 3, 4]), type: 'ListNode' }),
        fast: variable({ value: list(['d'], [4]), type: 'ListNode' }),
      }),
      createTraceContext(),
    );

    expect(snap.dataStructures.map((d) => d.id)).toEqual(['head']);
    expect(structure(snap, 'head').nodePointers).toEqual([
      { name: 'slow', nodeIndex: 1, color: expect.any(String) },
      { name: 'fast', nodeIndex: 3, color: expect.any(String) },
    ]);
  });

  it('keeps a variable that heads a genuinely separate chain', () => {
    // reverseList builds `prev` out of nodes it has already detached.
    const snap = processSnapshot(
      snapshot({
        curr: variable({ value: list(['c', 'd'], [3, 4]), type: 'ListNode' }),
        prev: variable({ value: list(['b', 'a'], [2, 1]), type: 'ListNode' }),
      }),
      createTraceContext(),
    );

    expect(snap.dataStructures.map((d) => d.id).sort()).toEqual(['curr', 'prev']);
  });

  it('makes an alias of the head a cursor at index 0', () => {
    const snap = processSnapshot(
      snapshot({
        head: variable({ value: list(['a', 'b'], [1, 2]), type: 'ListNode' }),
        curr: variable({ value: list(['a', 'b'], [1, 2]), type: 'ListNode' }),
      }),
      createTraceContext(),
    );

    expect(snap.dataStructures.map((d) => d.id)).toEqual(['head']);
    expect(structure(snap, 'head').nodePointers?.[0]).toMatchObject({ name: 'curr', nodeIndex: 0 });
  });

  it('keeps the cycle flag on the surviving structure', () => {
    const snap = processSnapshot(
      snapshot({
        head: variable({ value: list(['a', 'b', 'c'], [3, 2, 0], true, 1), type: 'ListNode' }),
      }),
      createTraceContext(),
    );

    expect(structure(snap, 'head').data).toMatchObject({ has_cycle: true, cycleIndex: 1 });
  });
});

describe('node pointers — trees', () => {
  const tree = {
    __type: 'tree',
    root: {
      id: 'r',
      val: 1,
      left: { id: 'l', val: 2, left: null, right: null },
      right: { id: 'x', val: 3, left: null, right: null },
    },
  };

  it('collapses a variable holding an inner node into a pre-order cursor', () => {
    const snap = processSnapshot(
      snapshot({
        root: variable({ value: tree, type: 'TreeNode' }),
        node: variable({
          value: { __type: 'tree', root: { id: 'x', val: 3, left: null, right: null } },
          type: 'TreeNode',
        }),
      }),
      createTraceContext(),
    );

    expect(snap.dataStructures.map((d) => d.id)).toEqual(['root']);
    // Pre-order over root: r, l, x
    expect(structure(snap, 'root').nodePointers).toEqual([
      { name: 'node', nodeIndex: 2, color: expect.any(String) },
    ]);
  });

  it('keeps an unrelated tree as its own structure', () => {
    const snap = processSnapshot(
      snapshot({
        root: variable({ value: tree, type: 'TreeNode' }),
        other: variable({
          value: { __type: 'tree', root: { id: 'z', val: 9, left: null, right: null } },
          type: 'TreeNode',
        }),
      }),
      createTraceContext(),
    );

    expect(snap.dataStructures.map((d) => d.id).sort()).toEqual(['other', 'root']);
  });
});
