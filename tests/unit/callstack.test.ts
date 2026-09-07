/**
 * M5 — reconstructing the call stack from the event stream.
 *
 * A snapshot carries only its own frame, so the enclosing frames have to be
 * recovered by replaying call/return in order.
 */

import { describe, expect, it } from 'vitest';
import {
  createTraceContext,
  processSnapshots,
  type RawSnapshot,
} from '../../src/offscreen/snapshot-builder';
import type { TraceEvent } from '../../src/shared/types';

function raw(
  event: TraceEvent,
  frameName: string,
  frameId: string,
  line: number,
  callDepth = 0,
): RawSnapshot {
  return { step: 0, line, event, frameId, frameName, callDepth, variables: {} };
}

function names(stack: { frameName: string }[]): string[] {
  return stack.map((frame) => frame.frameName);
}

describe('processSnapshots — call stack', () => {
  it('pushes on call and pops on return', () => {
    const snaps = processSnapshots(
      [
        raw('call', 'solve', 'solve#1', 2),
        raw('line', 'solve', 'solve#1', 3),
        raw('call', 'helper', 'helper#2', 8),
        raw('line', 'helper', 'helper#2', 9),
        raw('return', 'helper', 'helper#2', 10),
        raw('line', 'solve', 'solve#1', 4),
      ],
      createTraceContext(),
    );

    expect(snaps.map((s) => names(s.callStack))).toEqual([
      ['solve'],
      ['solve'],
      ['solve', 'helper'],
      ['solve', 'helper'],
      // The returning frame is still on the stack for its own return step.
      ['solve', 'helper'],
      ['solve'],
    ]);
  });

  it('tracks recursion depth', () => {
    const snaps = processSnapshots(
      [
        raw('call', 'dfs', 'dfs#1', 5),
        raw('call', 'dfs', 'dfs#2', 5),
        raw('call', 'dfs', 'dfs#3', 5),
        raw('return', 'dfs', 'dfs#3', 6),
        raw('line', 'dfs', 'dfs#2', 6),
      ],
      createTraceContext(),
    );

    expect(snaps.map((s) => s.callStack.length)).toEqual([1, 2, 3, 3, 2]);
    expect(snaps[2].callStack.map((f) => f.frameId)).toEqual(['dfs#1', 'dfs#2', 'dfs#3']);
  });

  it('keeps the module frame out of the stack', () => {
    const snaps = processSnapshots(
      [raw('line', '<module>', '<module>#1', 1), raw('call', 'solve', 'solve#2', 2)],
      createTraceContext(),
    );

    expect(snaps[0].callStack).toEqual([]);
    expect(names(snaps[1].callStack)).toEqual(['solve']);
  });

  it('tracks the line each frame is sitting on', () => {
    const snaps = processSnapshots(
      [
        raw('call', 'solve', 'solve#1', 2),
        raw('line', 'solve', 'solve#1', 3),
        raw('call', 'helper', 'helper#2', 8),
      ],
      createTraceContext(),
    );

    // The parent is parked on the line that made the call.
    expect(snaps[2].callStack).toEqual([
      { frameId: 'solve#1', frameName: 'solve', line: 3 },
      { frameId: 'helper#2', frameName: 'helper', line: 8 },
    ]);
  });

  it('resyncs when a return event never arrives', () => {
    // A budget can cut a trace mid-unwind, so the frame a step belongs to may
    // sit below the recorded top.
    const snaps = processSnapshots(
      [
        raw('call', 'solve', 'solve#1', 2),
        raw('call', 'helper', 'helper#2', 8),
        raw('line', 'solve', 'solve#1', 4),
      ],
      createTraceContext(),
    );

    expect(names(snaps[2].callStack)).toEqual(['solve']);
  });

  it('gives each snapshot its own copy of the stack', () => {
    const snaps = processSnapshots(
      [raw('call', 'solve', 'solve#1', 2), raw('call', 'helper', 'helper#2', 8)],
      createTraceContext(),
    );

    expect(snaps[0].callStack).toHaveLength(1);
    expect(snaps[1].callStack).toHaveLength(2);
  });
});
