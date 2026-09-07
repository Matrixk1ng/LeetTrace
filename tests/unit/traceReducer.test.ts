/**
 * M4 — the half of B17 that lives in the store.
 *
 * Visualizers diff against the step the user navigated *away from*. Assuming
 * `currentStep - 1` meant that stepping backwards re-reported the step ahead
 * as brand new.
 */

import { describe, expect, it } from 'vitest';
import { initialState, traceReducer, type TraceState } from '../../src/panel/store/traceReducer';
import type { Snapshot } from '../../src/shared/types';

function snapshot(step: number): Snapshot {
  return {
    step,
    line: step + 1,
    event: 'line',
    frameId: 'solve#1',
    frameName: 'solve',
    callDepth: 1,
    variables: {},
    dataStructures: [],
    highlights: [],
  };
}

function loaded(count = 4): TraceState {
  return traceReducer(initialState, {
    type: 'LOAD_SNAPSHOTS',
    payload: { snapshots: Array.from({ length: count }, (_, i) => snapshot(i)) },
  });
}

describe('previousStep (B17)', () => {
  it('starts unset so the first step diffs against nothing', () => {
    expect(loaded().previousStep).toBeNull();
  });

  it('records where a forward step came from', () => {
    const state = traceReducer(loaded(), { type: 'NEXT_STEP' });
    expect([state.previousStep, state.currentStep]).toEqual([0, 1]);
  });

  it('records where a backward step came from — not currentStep - 1', () => {
    let state = loaded();
    state = traceReducer(state, { type: 'NEXT_STEP' });
    state = traceReducer(state, { type: 'NEXT_STEP' });
    state = traceReducer(state, { type: 'PREV_STEP' });

    expect(state.currentStep).toBe(1);
    // Came down from 2, so that is what step 1 must be compared against.
    expect(state.previousStep).toBe(2);
  });

  it('records a scrubber jump', () => {
    const state = traceReducer(loaded(), { type: 'SET_STEP', payload: 3 });
    expect([state.previousStep, state.currentStep]).toEqual([0, 3]);
  });

  it('leaves previousStep alone when the step does not actually move', () => {
    let state = loaded();
    state = traceReducer(state, { type: 'NEXT_STEP' });
    const pinned = state.previousStep;

    // Already at 0 going back, and a SET_STEP to where we already are.
    state = traceReducer(state, { type: 'SET_STEP', payload: 1 });
    expect(state.previousStep).toBe(pinned);

    let atStart = loaded();
    atStart = traceReducer(atStart, { type: 'PREV_STEP' });
    expect(atStart.previousStep).toBeNull();
  });

  it('clears on reset and on a fresh load', () => {
    let state = traceReducer(loaded(), { type: 'NEXT_STEP' });
    expect(traceReducer(state, { type: 'RESET' }).previousStep).toBeNull();

    state = traceReducer(state, {
      type: 'LOAD_SNAPSHOTS',
      payload: { snapshots: [snapshot(0)] },
    });
    expect(state.previousStep).toBeNull();
  });
});

describe('LOAD_SNAPSHOTS carries the trace envelope', () => {
  it('stores truncation and the return value', () => {
    const state = traceReducer(initialState, {
      type: 'LOAD_SNAPSHOTS',
      payload: {
        snapshots: [snapshot(0)],
        truncated: true,
        limit: 'events',
        returnValue: [0, 1],
      },
    });

    expect(state.truncated).toBe(true);
    expect(state.limit).toBe('events');
    expect(state.returnValue).toEqual([0, 1]);
  });
});
