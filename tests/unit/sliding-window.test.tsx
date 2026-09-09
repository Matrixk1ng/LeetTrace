import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import SlidingWindowViz from '../../src/panel/components/visualizers/SlidingWindowViz';

const raw: RawTraceResult = JSON.parse(execFileSync('python', ['-c', "import sys; from pathlib import Path; sys.path.insert(0, 'src/offscreen'); import tracer; print(tracer.run_traced(Path('tests/dev/sliding-window-example.py').read_text(), ['nums = [2,1,5,1,3,2], k = 3']))"], { encoding: 'utf8' }));
const snapshots = processSnapshots(raw.snapshots, createTraceContext(raw.indexing));
afterEach(cleanup);
function view(index: number) {
  const dispatch = vi.fn();
  const node = (step: number) => <TraceContext.Provider value={{ state: { ...initialState, status: 'paused', snapshots, currentStep: step, totalSteps: snapshots.length }, dispatch }}><SlidingWindowViz observation={snapshots[step].visual!.window!} /></TraceContext.Provider>;
  const result = render(node(index));
  return { ...result, dispatch, change: (step: number) => result.rerender(node(step)) };
}

it('shows removed membership independently from the raw left pointer', () => {
  const index = snapshots.findIndex(s => s.visual?.window?.kind === 'remove');
  const { container } = view(index);
  expect(snapshots[index].variables.left.value).toBe(0);
  expect(container.querySelectorAll('.tp-cell.inside').length).toBe(2);
  expect(screen.getByText('8 − (2) = 6')).toBeTruthy();
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('8');
  fireEvent.click(screen.getByRole('button', { name: 'nums[1] = 1, included in total' }));
  expect(screen.getByText('nums[1] = 1')).toBeTruthy();
});

it('rewinds recorded best results and full-window history', () => {
  const end = snapshots.findLastIndex(s => s.visual?.window);
  const first = snapshots.findIndex(s => s.visual?.window);
  const { container, change } = view(end);
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('9');
  expect(container.querySelectorAll('.tp-history button').length).toBe(4);
  change(first);
  expect(container.querySelector('.sw-best strong')?.textContent).toBe('—');
  expect(container.querySelectorAll('.tp-history button').length).toBe(0);
});

it('history clicks pause at the completed result assignment', () => {
  const { container, dispatch } = view(snapshots.findLastIndex(s => s.visual?.window));
  fireEvent.click(container.querySelector('.tp-history button')!);
  expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'PAUSE' }, { type: 'SET_STEP', payload: snapshots.findIndex(s => s.visual?.window?.kind === 'save') }]);
});
