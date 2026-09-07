/**
 * Fixtures for visualizer development (docs/DESIGN.md §10).
 *
 * Every shape here is what the offscreen builder actually produces — copy a
 * real trace into one of these rather than inventing a shape, or the component
 * will be built against a payload it never receives.
 *
 * Also used by the unit tests, so a drift between fixture and reality shows up
 * as a failure rather than as a visualizer that only works in a mock.
 */

import type { DataStructureState, Highlight, StackFrame } from '../../../shared/types';
import { POINTER_COLORS } from '../../../shared/constants';

const [BLUE, RED, GREEN, AMBER] = POINTER_COLORS;

export const mockArray: DataStructureState = {
  id: 'nums',
  type: 'array',
  data: [2, 7, 11, 15, 1, 8],
  pointers: [
    { name: 'left', index: 1, color: BLUE },
    { name: 'right', index: 4, color: RED },
  ],
};

export const mockString: DataStructureState = {
  id: 's',
  type: 'string',
  data: ['r', 'a', 'c', 'e', 'c', 'a', 'r'],
  pointers: [
    { name: 'left', index: 2, color: BLUE },
    { name: 'right', index: 4, color: RED },
  ],
};

/** Row cursor `i`, column cursor `j`, crossing cell highlighted. */
export const mockMatrix: DataStructureState = {
  id: 'grid',
  type: 'matrix',
  data: [
    [1, 1, 1, 1],
    [1, 2, 3, 4],
    [1, 3, 6, 10],
  ],
  pointers: [
    { name: 'i', index: 1, cell: { row: 1, col: -1 }, color: BLUE },
    { name: 'j', index: 2, cell: { row: -1, col: 2 }, color: GREEN },
  ],
};

export const mockMatrixHighlights: Highlight[] = [
  // Flattened: row 1, col 2, width 4.
  { structureId: 'grid', indices: [1 * 4 + 2], type: 'current' },
];

/** Grid with rows of different lengths — a triangular DP table. */
export const mockRaggedMatrix: DataStructureState = {
  id: 'dp',
  type: 'matrix',
  data: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]],
  pointers: [{ name: 'i', index: 2, cell: { row: 2, col: -1 }, color: BLUE }],
};

export const mockStack: DataStructureState = {
  id: 'stack',
  type: 'stack',
  data: [3, 1, 4, 1, 5],
  pointers: [],
};

export const mockQueue: DataStructureState = {
  id: 'queue',
  type: 'queue',
  data: { __type: 'deque', items: [4, 8, 15, 16] },
  pointers: [],
};

export const mockSet: DataStructureState = {
  id: 'seen',
  type: 'set',
  data: { __type: 'set', items: [2, 3, 5, 7], frozen: false },
  pointers: [],
};

export const mockFrozenSet: DataStructureState = {
  id: 'blocked',
  type: 'set',
  data: { __type: 'set', items: ['a', 'b'], frozen: true },
  pointers: [],
};

export const mockHeap: DataStructureState = {
  id: 'heap',
  type: 'heap',
  data: [1, 3, 2, 7, 4],
  pointers: [],
};

export const mockHashMap: DataStructureState = {
  id: 'seen',
  type: 'hashmap',
  data: { '2': 0, '7': 1, '11': 2 },
  pointers: [],
};

/** The previous step of `mockHashMap`: '11' is new, '7' changed 9 → 1. */
export const mockHashMapPrevious: DataStructureState = {
  id: 'seen',
  type: 'hashmap',
  data: { '2': 0, '7': 9 },
  pointers: [],
};

export const mockLinkedList: DataStructureState = {
  id: 'head',
  type: 'linked_list',
  data: {
    __type: 'linked_list',
    nodes: [3, 2, 0, -4],
    nodeIds: ['n1', 'n2', 'n3', 'n4'],
    has_cycle: true,
    cycleIndex: 1,
  },
  pointers: [],
  nodePointers: [
    { name: 'slow', nodeIndex: 2, color: BLUE },
    { name: 'fast', nodeIndex: 3, color: AMBER },
  ],
};

export const mockTree: DataStructureState = {
  id: 'root',
  type: 'tree',
  data: {
    __type: 'tree',
    root: {
      id: 't1',
      val: 3,
      left: { id: 't2', val: 9, left: null, right: null },
      right: {
        id: 't3',
        val: 20,
        left: { id: 't4', val: 15, left: null, right: null },
        right: { id: 't5', val: 7, left: null, right: null },
      },
    },
  },
  pointers: [],
  nodePointers: [{ name: 'node', nodeIndex: 2, color: BLUE }],
};

export const mockEmptyArray: DataStructureState = {
  id: 'out',
  type: 'array',
  data: [],
  pointers: [],
};

export const mockLongArray: DataStructureState = {
  id: 'big',
  type: 'array',
  data: Array.from({ length: 60 }, (_, i) => i * 3),
  pointers: [{ name: 'i', index: 42, color: BLUE }],
};

/** An acyclic list, so the tail renders as `→ None`. */
export const mockPlainLinkedList: DataStructureState = {
  id: 'head',
  type: 'linked_list',
  data: {
    __type: 'linked_list',
    nodes: [1, 2, 3, 4, 5],
    nodeIds: ['a', 'b', 'c', 'd', 'e'],
    has_cycle: false,
    cycleIndex: -1,
  },
  pointers: [],
  nodePointers: [{ name: 'curr', nodeIndex: 2, color: BLUE }],
};

/** A tree with no cursor on it. */
export const mockPlainTree: DataStructureState = {
  id: 'root',
  type: 'tree',
  data: {
    __type: 'tree',
    root: {
      id: 'p1',
      val: 4,
      left: {
        id: 'p2',
        val: 2,
        left: { id: 'p4', val: 1, left: null, right: null },
        right: { id: 'p5', val: 3, left: null, right: null },
      },
      right: { id: 'p3', val: 7, left: null, right: null },
    },
  },
  pointers: [],
};

/** Mid-recursion in a backtracking solve. */
export const mockCallStack: StackFrame[] = [
  { frameId: 'subsets#1', frameName: 'subsets', line: 2 },
  { frameId: 'backtrack#2', frameName: 'backtrack', line: 6 },
  { frameId: 'backtrack#5', frameName: 'backtrack', line: 7 },
  { frameId: 'backtrack#9', frameName: 'backtrack', line: 5 },
];
