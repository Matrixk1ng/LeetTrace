/**
 * M2 — the routing layer: which visualizer kind a traced variable becomes.
 *
 * Fixtures mirror what `tracer.py` actually emits; the tracer side of the same
 * behaviour is pinned in tests/tracer/test_serialization.py.
 */

import { describe, expect, it } from 'vitest';
import { buildDataStructure, isMatrix, processSnapshot } from '../../src/offscreen/snapshot-builder';
import type { VariableState } from '../../src/shared/types';

function variable(partial: Partial<VariableState> & Pick<VariableState, 'value' | 'type'>): VariableState {
  return { changed: false, ...partial };
}

function kindOf(v: VariableState): string | null {
  return buildDataStructure('x', v)?.type ?? null;
}

describe('buildDataStructure — structural tags', () => {
  it('routes a linked list', () => {
    expect(
      kindOf(variable({ value: { __type: 'linked_list', nodes: [1, 2], has_cycle: false }, type: 'ListNode' })),
    ).toBe('linked_list');
  });

  it('routes a tree', () => {
    expect(
      kindOf(variable({ value: { __type: 'tree', root: { val: 1, left: null, right: null } }, type: 'TreeNode' })),
    ).toBe('tree');
  });

  it('routes a deque to queue', () => {
    expect(kindOf(variable({ value: { __type: 'deque', items: [1, 2] }, type: 'deque' }))).toBe('queue');
  });

  it('routes a set', () => {
    expect(
      kindOf(variable({ value: { __type: 'set', items: [1, 2], frozen: false }, type: 'set' })),
    ).toBe('set');
  });
});

describe('buildDataStructure — dict families (B4)', () => {
  // These used to fall through to the raw JSON dump because the check was
  // `type === 'dict'` and their Python type names are their own class names.
  it.each(['dict', 'defaultdict', 'Counter', 'OrderedDict'])('routes %s to hashmap', (type) => {
    expect(kindOf(variable({ value: { a: 1 }, type }))).toBe('hashmap');
  });

  it('does not route an unrelated object type', () => {
    expect(kindOf(variable({ value: '<Foo object>', type: 'Foo' }))).toBeNull();
  });
});

describe('buildDataStructure — list families and usage kinds', () => {
  it('routes a plain list to array', () => {
    expect(kindOf(variable({ value: [1, 2, 3], type: 'list' }))).toBe('array');
  });

  it('routes a tuple to array', () => {
    expect(kindOf(variable({ value: [1, 2], type: 'tuple' }))).toBe('array');
  });

  it('routes a heap-tagged list to heap', () => {
    expect(kindOf(variable({ value: [1, 2], type: 'list', kind: 'heap' }))).toBe('heap');
  });

  it('routes a stack-tagged list to stack', () => {
    expect(kindOf(variable({ value: [1, 2], type: 'list', kind: 'stack' }))).toBe('stack');
  });

  it('ignores a usage kind once the name holds a non-list', () => {
    expect(kindOf(variable({ value: 7, type: 'int', kind: 'stack' }))).toBeNull();
  });

  it('does not route a bare scalar', () => {
    expect(kindOf(variable({ value: 5, type: 'int' }))).toBeNull();
    expect(kindOf(variable({ value: 'abc', type: 'str' }))).toBeNull();
  });
});

describe('isMatrix (B13)', () => {
  it('accepts a rectangular grid', () => {
    expect(isMatrix([[1, 2], [3, 4]])).toBe(true);
  });

  it('accepts a ragged grid — a triangular DP table is still a grid', () => {
    expect(isMatrix([[1], [1, 2], [1, 2, 3]])).toBe(true);
  });

  it('rejects a list whose only row is empty (used to be a 0-column matrix)', () => {
    expect(isMatrix([[]])).toBe(false);
  });

  it('rejects jaggedness past row 0 (only row 0 used to be checked)', () => {
    expect(isMatrix([[1, 2], [3, [4]]])).toBe(false);
    expect(isMatrix([[1, 2], 3])).toBe(false);
  });

  it('rejects a flat list and an empty list', () => {
    expect(isMatrix([1, 2, 3])).toBe(false);
    expect(isMatrix([])).toBe(false);
  });

  it('routes a real grid to matrix and a flat list to array', () => {
    expect(kindOf(variable({ value: [[1, 2], [3, 4]], type: 'list' }))).toBe('matrix');
    expect(kindOf(variable({ value: [[]], type: 'list' }))).toBe('array');
  });
});

describe('processSnapshot', () => {
  const raw = {
    step: 0,
    line: 4,
    event: 'line' as const,
    frameId: 'twoSum#2',
    frameName: 'twoSum',
    callDepth: 1,
    variables: {
      nums: variable({ value: [2, 7, 11], type: 'list' }),
      i: variable({ value: 1, type: 'int', changed: true }),
      seen: variable({ value: { '2': 0 }, type: 'dict' }),
    },
  };

  it('carries the schema v2 fields through', () => {
    const snap = processSnapshot(raw);
    expect(snap).toMatchObject({
      step: 0,
      line: 4,
      event: 'line',
      frameId: 'twoSum#2',
      frameName: 'twoSum',
      callDepth: 1,
    });
  });

  it('builds one structure per routable variable', () => {
    const snap = processSnapshot(raw);
    expect(snap.dataStructures.map((d) => [d.id, d.type])).toEqual([
      ['nums', 'array'],
      ['seen', 'hashmap'],
    ]);
  });

  it('omits stdout when the step emitted none', () => {
    expect(processSnapshot(raw).stdout).toBeUndefined();
    expect(processSnapshot({ ...raw, stdout: 'hi\n' }).stdout).toBe('hi\n');
  });
});
