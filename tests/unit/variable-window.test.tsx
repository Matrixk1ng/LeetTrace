import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import SlidingWindowViz from '../../src/panel/components/visualizers/SlidingWindowViz';

const raw: RawTraceResult = JSON.parse(execFileSync('python', ['-c', "import sys; from pathlib import Path; sys.path.insert(0, 'src/offscreen'); import tracer; print(tracer.run_traced(Path('tests/dev/variable-window-example.py').read_text(), ['target = 7, nums = [2,3,1,2,4,3]']))"], { encoding: 'utf8' }));
const snapshots = processSnapshots(raw.snapshots, createTraceContext(raw.indexing));
afterEach(cleanup);
function view(index: number) {
  const dispatch = vi.fn();
  const node = (step: number) => <TraceContext.Provider value={{ state: { ...initialState, status: 'paused', snapshots, currentStep: step, totalSteps: snapshots.length }, dispatch }}><SlidingWindowViz observation={snapshots[step].visual!.window!} /></TraceContext.Provider>;
  const result = render(node(index));
  return { ...result, dispatch, change: (step: number) => result.rerender(node(step)) };
}

it('does not declare a condition true merely because an addition reaches the target', () => {
  const index = snapshots.findIndex(s => s.visual?.window?.kind === 'add' && s.visual.window.total === 8);
  const { container, change } = view(index);
  expect(screen.getByText('8 ≥ 7 · awaiting check')).toBeTruthy();
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('—');
  const checked = snapshots.findIndex((s, i) => i > index && s.visual?.window?.kind === 'condition');
  change(checked);
  expect(screen.getByText('8 ≥ 7 · True')).toBeTruthy();
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('—');
  change(checked + 1);
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('4 values');
});

it('rewinds shortest answers and qualifying-window history', () => {
  const { container, change } = view(snapshots.findLastIndex(s => s.visual?.window));
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('2 values');
  expect(container.querySelectorAll('.tp-history button').length).toBeGreaterThan(1);
  change(snapshots.findIndex(s => s.visual?.window));
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('—');
  expect(container.querySelectorAll('.tp-history button').length).toBe(0);
});

it('history returns to a confirmed true condition before the save', () => {
  const { container, dispatch } = view(snapshots.findLastIndex(s => s.visual?.window));
  fireEvent.click(container.querySelector('.tp-history button')!);
  const step = dispatch.mock.calls[1][0].payload;
  expect(dispatch.mock.calls[0][0]).toEqual({ type: 'PAUSE' });
  expect(snapshots[step].visual?.window?.kind).toBe('condition');
  expect(snapshots[step].visual?.window?.best).toBeUndefined();
});
