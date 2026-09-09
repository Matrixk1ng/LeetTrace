import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import { linkedListModel } from '../../src/panel/components/visualizers/linkedListModel';
import LinkedListTraceViz from '../../src/panel/components/visualizers/LinkedListTraceViz';

const raw: RawTraceResult = JSON.parse(execFileSync('python', ['-c', "import sys; from pathlib import Path; sys.path.insert(0, 'src/offscreen'); import tracer; print(tracer.run_traced(Path('tests/dev/linked-list-example.py').read_text(), ['head = [2,2,7]']))"], { encoding: 'utf8' }));
const snapshots = processSnapshots(raw.snapshots, createTraceContext(raw.indexing));
afterEach(cleanup);

it('keeps duplicate nodes distinct and reverses their links without moving their identities', () => {
  expect(raw.error).toBeNull();
  const start = linkedListModel(snapshots, 0), end = linkedListModel(snapshots, snapshots.length - 1);
  expect(start.order).toHaveLength(3);
  expect(end.order).toEqual(start.order);
  const [a,b,c] = end.order;
  expect([...end.nodes.values()].map(n => n.next).sort()).toEqual([null,a,b].sort());
  expect(end.nodes.get(c)?.next).toBe(b);
  expect(end.nodes.get(b)?.next).toBe(a);
  expect(end.aliases.get('head')).toBe(a);
  expect(end.aliases.get('return')).toBe(c);
});

it('separates link writes from later pointer assignments', () => {
  const step = snapshots.findIndex((_,i) => linkedListModel(snapshots,i).changedLinks.size > 0);
  const m = linkedListModel(snapshots,step), next = linkedListModel(snapshots,step+1);
  expect(m.nodes.get(m.order[0])?.next).toBeNull();
  expect(m.aliases.get('prev')).toBeNull();
  expect(next.aliases.get('prev')).toBe(m.order[0]);
  expect(next.changedLinks.size).toBe(0);
});

it('renders arrows, inspection and prefix-only history when rewinding', () => {
  const dispatch = vi.fn();
  const node = (step: number) => <TraceContext.Provider value={{state:{...initialState,snapshots,currentStep:step,totalSteps:snapshots.length},dispatch}}><LinkedListTraceViz /></TraceContext.Provider>;
  const view = render(node(snapshots.length-1));
  expect(view.container.querySelector('[data-from="C"]')?.getAttribute('data-to')).toBe('B');
  fireEvent.click(screen.getByLabelText('Inspect node B'));
  expect(screen.getByText('Node B · value 2 · next = A')).toBeTruthy();
  fireEvent.click(view.container.querySelector('.tp-history button')!);
  expect(dispatch.mock.calls[0][0]).toEqual({type:'PAUSE'});
  view.rerender(node(0));
  expect(view.container.querySelectorAll('.tp-history button')).toHaveLength(0);
  expect(view.container.querySelector('[data-from="A"]')?.getAttribute('data-to')).toBe('B');
});

it('does not retain stale arrows for nodes no longer reachable', () => {
  const first = snapshots[0];
  const lost = {...first,variables:{}};
  const m = linkedListModel([first,lost],1);
  expect(m.order).toHaveLength(3);
  expect(m.nodes.size).toBe(0);
});
