import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import TwoPointerViz from '../../src/panel/components/visualizers/TwoPointerViz';

const raw: RawTraceResult = JSON.parse(execFileSync('python', ['-c', "import sys; from pathlib import Path; sys.path.insert(0, 'src/offscreen'); import tracer; print(tracer.run_traced(Path('tests/dev/two-pointer-example.py').read_text(), ['nums = [1,3,4,6,8,10], target = 12']))"], { encoding: 'utf8' }));
const snapshots = processSnapshots(raw.snapshots, createTraceContext(raw.indexing));
afterEach(cleanup);
function view(index: number) {
  const dispatch = vi.fn();
  const node = (step: number) => <TraceContext.Provider value={{ state: { ...initialState, status: 'paused', snapshots, currentStep: step, totalSteps: snapshots.length }, dispatch }}><TwoPointerViz observation={snapshots[step].visual!.pair!} /></TraceContext.Provider>;
  const result = render(node(index));
  return { ...result, dispatch, change: (step: number) => result.rerender(node(step)) };
}

it('keeps the old equation distinct from newly moved pointers', () => {
  const step = snapshots.findIndex(s => s.visual?.pair?.kind === 'move');
  const { container } = view(step);
  expect(screen.getByText('1 + 10 = 11')).toBeTruthy();
  expect(screen.getByText(/Last computed pair/)).toBeTruthy();
  expect(container.querySelector('.tp-cell.first')?.textContent).toBe('3');
  fireEvent.click(screen.getByRole('button', { name: 'nums[1] = 3, left' }));
  expect(screen.getByText('nums[1] = 3')).toBeTruthy();
});

it('rewind hides future comparisons and shows the upcoming sum as unknown', () => {
  const end = snapshots.findLastIndex(s => s.visual?.pair);
  const first = snapshots.findIndex(s => s.visual?.pair?.kind === 'read');
  const { container, change } = view(end);
  expect(container.querySelectorAll('.tp-history button').length).toBe(7);
  change(first);
  expect(container.querySelectorAll('.tp-history button').length).toBe(0);
  expect(screen.getByText('1 + 10 = ?')).toBeTruthy();
});

it('history navigation pauses and selects the original branch observation', () => {
  const step = snapshots.findLastIndex(s => s.visual?.pair);
  const { container, dispatch } = view(step);
  fireEvent.click(container.querySelector('.tp-history button')!);
  expect(dispatch.mock.calls[0][0]).toEqual({ type: 'PAUSE' });
  expect(dispatch.mock.calls[1][0]).toEqual({ type: 'SET_STEP', payload: snapshots.findIndex(s => s.visual?.pair?.kind === 'compare') });
});
