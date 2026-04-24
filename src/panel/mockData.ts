import type { Snapshot } from '../shared/types';

const snapshots: Snapshot[] = [
  {
    step: 1,
    line: 1,
    variables: {
      nums: { value: [2, 7, 11, 15], type: 'list[int]', changed: false },
      target: { value: 9, type: 'int', changed: false },
      seen: { value: {}, type: 'dict[int, int]', changed: true },
      i: { value: 0, type: 'int', changed: true },
      num: { value: 2, type: 'int', changed: true },
      complement: { value: 7, type: 'int', changed: true },
    },
    dataStructures: [],
    highlights: [],
  },
  {
    step: 2,
    line: 2,
    variables: {
      nums: { value: [2, 7, 11, 15], type: 'list[int]', changed: false },
      target: { value: 9, type: 'int', changed: false },
      seen: { value: { 2: 0 }, type: 'dict[int, int]', changed: true },
      i: { value: 0, type: 'int', changed: false },
      num: { value: 2, type: 'int', changed: false },
      complement: { value: 7, type: 'int', changed: false },
    },
    dataStructures: [],
    highlights: [],
  },
  {
    step: 3,
    line: 1,
    variables: {
      nums: { value: [2, 7, 11, 15], type: 'list[int]', changed: false },
      target: { value: 9, type: 'int', changed: false },
      seen: { value: { 2: 0 }, type: 'dict[int, int]', changed: false },
      i: { value: 1, type: 'int', changed: true },
      num: { value: 7, type: 'int', changed: true },
      complement: { value: 2, type: 'int', changed: true },
    },
    dataStructures: [],
    highlights: [],
  },
  {
    step: 4,
    line: 2,
    variables: {
      nums: { value: [2, 7, 11, 15], type: 'list[int]', changed: false },
      target: { value: 9, type: 'int', changed: false },
      seen: { value: { 2: 0 }, type: 'dict[int, int]', changed: false },
      i: { value: 1, type: 'int', changed: false },
      num: { value: 7, type: 'int', changed: false },
      complement: { value: 2, type: 'int', changed: false },
      found: { value: true, type: 'bool', changed: true },
    },
    dataStructures: [],
    highlights: [],
  },
  {
    step: 5,
    line: 3,
    variables: {
      nums: { value: [2, 7, 11, 15], type: 'list[int]', changed: false },
      target: { value: 9, type: 'int', changed: false },
      seen: { value: { 2: 0 }, type: 'dict[int, int]', changed: false },
      i: { value: 1, type: 'int', changed: false },
      num: { value: 7, type: 'int', changed: false },
      complement: { value: 2, type: 'int', changed: false },
      result: { value: [0, 1], type: 'list[int]', changed: true },
    },
    dataStructures: [],
    highlights: [],
  },
];

export const mockExecutionResult = {
  snapshots,
  pattern: {
    type: 'two_pointer',
    confidence: 0.82,
    description: 'Mock pattern shown so the panel can be exercised before worker integration.',
  },
};