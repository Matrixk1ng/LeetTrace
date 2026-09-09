import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { learningModel } from '../../src/panel/components/visualizers/learningModel';
import RecursionDPViz from '../../src/panel/components/visualizers/RecursionDPViz';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import type { Snapshot } from '../../src/shared/types';

function trace(file: string) {
  const raw: RawTraceResult = JSON.parse(execFileSync('python', ['-c', `import sys; from pathlib import Path; sys.path.insert(0, 'src/offscreen'); import tracer; print(tracer.run_traced(Path('tests/dev/${file}').read_text(), ['n = 5']))`], { encoding: 'utf8' }));
  expect(raw.error).toBeNull();
  return processSnapshots(raw.snapshots, createTraceContext(raw.indexing));
}
const top = trace('dp-top-down-example.py'), bottom = trace('dp-bottom-up-example.py');
afterEach(cleanup);

it('recognizes only the two actual reused calls, not newly computed returns', () => {
  const model = learningModel(top, top.length - 1);
  expect(model.recursive).toBe(true);
  expect(model.rows.filter(r => r.kind === 'reuse').map(r => r.text)).toEqual(['↯ Already saved · memo[2] = 2', '↯ Already saved · memo[3] = 3']);
  expect(model.saved.map(e => e.value)).toEqual([2, 3, 5, 8]);
  expect(model.rows.at(-1)?.text).toBe('← return 8');
  expect(new Set(model.rows.filter(r => r.kind === 'call').map(r => r.frameId)).size).toBe(model.rows.filter(r => r.kind === 'call').length);
});

it('rewinding has no future saved values or returned answers', () => {
  const first = top.findIndex(s => s.callStack.filter(f => f.frameName === 'dfs').length === 2);
  const model = learningModel(top, first);
  expect(model.recursive).toBe(true);
  expect(model.saved).toEqual([]);
  expect(model.rows.some(r => r.kind === 'return' || r.kind === 'reuse')).toBe(false);
});

it('separates current table contents from upcoming and completed assignments', () => {
  const i = bottom.findIndex(s => s.visual?.learning?.some(e => e.kind === 'table-read' && e.key === 4));
  const before = learningModel(bottom, i).table!;
  expect(before.values[4]).toBe(0);
  expect(before.event?.reads).toEqual([3, 2]);
  const after = learningModel(bottom, i + 1).table!;
  expect(after.values[4]).toBe(5);
  expect(after.event?.kind).toBe('table-write');
  // The loop header immediately before this read reports the preceding write.
  expect(learningModel(bottom, i - 1).table?.event?.key).toBe(3);
  expect(learningModel(bottom, i - 1).table?.values[4]).toBe(0);
});

function view(snapshots: Snapshot[], index: number) {
  const dispatch = vi.fn();
  const result = render(<TraceContext.Provider value={{ state: { ...initialState, status: 'paused', snapshots, currentStep: index, totalSteps: snapshots.length }, dispatch }}><RecursionDPViz model={learningModel(snapshots, index)} /></TraceContext.Provider>);
  return { ...result, dispatch };
}

it('folds completed calls and event navigation pauses at an exact trace index', () => {
  const { container, dispatch } = view(top, top.length - 1);
  const root = container.querySelector('.rd-call button')!;
  fireEvent.click(root);
  expect(root.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelectorAll('.rd-row').length).toBe(1);
  fireEvent.click(root);
  expect(container.querySelectorAll('.rd-row').length).toBeGreaterThan(1);
  fireEvent.click(screen.getByText('← Previous event'));
  expect(dispatch.mock.calls[0][0]).toEqual({ type: 'PAUSE' });
  expect(dispatch.mock.calls[1][0].type).toBe('SET_STEP');
});

it('renders dependencies and an unknown result before a write, with inspectable zero', () => {
  const i = bottom.findIndex(s => s.visual?.learning?.some(e => e.kind === 'table-read' && e.key === 4));
  const { container } = view(bottom, i);
  expect(screen.getByText('3 + 2 = ?')).toBeTruthy();
  expect(container.querySelectorAll('.rd-cell.read').length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'dp[4] = 0' }));
  expect(screen.getByText('dp[4] = 0')).toBeTruthy();
});
