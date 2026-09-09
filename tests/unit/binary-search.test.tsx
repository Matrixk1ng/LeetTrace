import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import BinarySearchViz from '../../src/panel/components/visualizers/BinarySearchViz';

const raw: RawTraceResult = JSON.parse(execFileSync('python', ['-c', "import sys; from pathlib import Path; sys.path.insert(0, 'src/offscreen'); import tracer; print(tracer.run_traced(Path('tests/dev/binary-search-example.py').read_text(), ['nums = [1,3,5,7,9,11,13], target = 11']))"], { encoding: 'utf8' }));
const snapshots = processSnapshots(raw.snapshots, createTraceContext(raw.indexing));
afterEach(cleanup);
function view(index: number) {
  const dispatch = vi.fn();
  const node = (step: number) => <TraceContext.Provider value={{ state: { ...initialState, status: 'paused', snapshots, currentStep: step, totalSteps: snapshots.length }, dispatch }}><BinarySearchViz observation={snapshots[step].visual!.binary!} /></TraceContext.Provider>;
  const result = render(node(index));
  return { ...result, dispatch, change: (step: number) => result.rerender(node(step)) };
}

it('highlights the new interval without a stale midpoint after bounds move', () => {
  const step = snapshots.findIndex(s => s.visual?.binary?.kind === 'move');
  const { container } = view(step);
  expect(container.querySelectorAll('.candidate').length).toBe(3);
  expect(container.querySelectorAll('.midpoint').length).toBe(0);
  expect(screen.getByText('Previous mid = 3')).toBeTruthy();
  expect(screen.getByText('7 < 11 · True')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('nums[4] = 9'));
  expect(screen.getByText('nums[4] = 9')).toBeTruthy();
});

it('rewinds comparison history and exposes only a computed midpoint', () => {
  const { container, change } = view(snapshots.findLastIndex(s => s.visual?.binary));
  expect(container.querySelectorAll('.tp-history button').length).toBeGreaterThan(1);
  change(snapshots.findIndex(s => s.visual?.binary?.kind === 'midpoint'));
  expect(container.querySelectorAll('.midpoint').length).toBe(1);
  expect(container.querySelectorAll('.tp-history button').length).toBe(0);
  change(snapshots.findIndex(s => s.visual?.binary));
  expect(container.querySelectorAll('.midpoint').length).toBe(0);
});

it('comparison history pauses and jumps to the observed branch outcome', () => {
  const { container, dispatch } = view(snapshots.findLastIndex(s => s.visual?.binary));
  fireEvent.click(container.querySelector('.tp-history button')!);
  expect(dispatch.mock.calls[0][0]).toEqual({ type: 'PAUSE' });
  expect(snapshots[dispatch.mock.calls[1][0].payload].visual?.binary?.kind).toBe('compare');
});

