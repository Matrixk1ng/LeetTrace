import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatTraceValue, visibleVariables } from '../../src/shared/display';
import { traceReducer, initialState } from '../../src/panel/store/traceReducer';
import { TraceContext } from '../../src/panel/store/useTrace';
import VariableInspector from '../../src/panel/components/VariableInspector';
import StepDetails from '../../src/panel/components/StepDetails';
import ArrayViz from '../../src/panel/components/visualizers/ArrayViz';
import HeapViz from '../../src/panel/components/visualizers/HeapViz';
import TreeViz from '../../src/panel/components/visualizers/TreeViz';
import { findLineElement, updateGutterAnnotations } from '../../src/content/gutter';
import type { Snapshot } from '../../src/shared/types';

afterEach(cleanup);
const snapshot: Snapshot = {
  step: 0, line: 17, event: 'return', frameId: 'f1', frameName: 'isValidBST', callDepth: 1,
  callStack: [], highlights: [],
  variables: {
    self: {type: 'Solution', value: '<Solution object at 0x123>', changed: false},
    dfs: {type: 'function', value: '<function Solution.dfs at 0x123>', changed: true},
    root: {type: 'TreeNode', value: {__type: 'tree', root: {id: '123', val: 2, left: null, right: null}}, changed: false},
    low: {type: 'float', value: '-inf', changed: false},
    return: {type: 'bool', value: true, changed: true},
  },
  dataStructures: [{id: 'root', type: 'tree', data: {}, pointers: []}],
};

it('renders the screenshot case without addresses or serialized tree internals', () => {
  const state = {...initialState, snapshots: [snapshot], totalSteps: 1, returnValue: true};
  render(<TraceContext.Provider value={{state, dispatch: () => {}}}><VariableInspector /><StepDetails /></TraceContext.Provider>);
  expect(screen.getByText('Tree · root 2')).toBeTruthy();
  expect(screen.getByRole('link', {name: /View root diagram/}).getAttribute('href')).toBe('#structure-root');
  expect(screen.queryByText('self')).toBeNull();
  expect(screen.queryByText('dfs')).toBeNull();
  expect(document.body.textContent).not.toContain('0x123');
  expect(document.body.textContent).not.toContain('__type');
  expect(screen.getAllByText('True').length).toBeGreaterThan(0);
  expect(screen.getByText('-inf')).toBeTruthy();
});
it('keeps regular string inf quoted and bounds nested previews', () => {
  expect(formatTraceValue('inf', 'str')).toBe('"inf"');
  expect(formatTraceValue('inf', 'float')).toBe('inf');
  expect(formatTraceValue(Array.from({length: 200}, (_, i) => i)).length).toBeLessThan(100);
  expect(visibleVariables(snapshot).map(([n]) => n)).toEqual(['return', 'low', 'root']);
});
it('restarts playback at the end and preserves an error for inspection', () => {
  const state = {...initialState, snapshots: [snapshot, snapshot], totalSteps: 2, currentStep: 1, error: 'bad'};
  const playing = traceReducer(state, {type: 'PLAY'});
  expect(playing.currentStep).toBe(0);
  expect(playing.previousStep).toBeNull();
  expect(playing.error).toBe('bad');
  expect(traceReducer({...playing}, {type: 'MARK_STALE'}).status).toBe('paused');
});
it('windows a 5000-item array around its pointer, keeps true indices and allows browsing', () => {
  const {container} = render(<ArrayViz dataStructure={{
    id: 'nums', type: 'array', data: Array.from({length: 5000}, (_, i) => i),
    pointers: [{name: 'i', index: 4500, color: 'red'}],
  }} highlights={[]} />);
  expect(container.querySelectorAll('[title]').length).toBe(60);
  expect(screen.getByText('i')).toBeTruthy();
  expect(screen.getAllByText('4500').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', {name: /Earlier/}));
  expect(container.querySelectorAll('[title]').length).toBe(60);
  fireEvent.click(screen.getByRole('button', {name: 'Follow pointer'}));
  expect(screen.getByText('i')).toBeTruthy();
});
it('renders heap positions with a bounded tree and an array disclosure', () => {
  const {container} = render(<HeapViz dataStructure={{id: 'heap', type: 'heap', data: Array.from({length: 100}, (_, i) => i), pointers: []}} />);
  expect(container.querySelectorAll('circle').length).toBe(31);
  expect(screen.getByText(/69 more items/)).toBeTruthy();
});
it('caps a deep tree at six visible levels and expands the remainder', () => {
  let root: unknown = null;
  for (let i = 9; i >= 0; i--) root = {id: String(i), val: i, left: root, right: null};
  const {container} = render(<TreeViz dataStructure={{id: 'root', type: 'tree', data: {root}, pointers: []}} />);
  expect(container.querySelectorAll('circle').length).toBe(6);
  fireEvent.click(screen.getByRole('button', {name: 'Expand 4 deeper nodes'}));
  expect(container.querySelectorAll('circle').length).toBe(10);
});
it('matches absolute document lines after scrolling and clears offscreen badges', () => {
  document.body.innerHTML = '<div class="monaco-editor"><div class="view-lines"><div class="view-line" style="top:400px;height:20px">line 21</div><div class="view-line" style="top:420px;height:20px">line 22</div></div></div>';
  expect(findLineElement(20)?.textContent).toBe('line 21');
  expect(findLineElement(0)).toBeNull();
  updateGutterAnnotations(20, [{variable: 'x', value: '1', changed: true}]);
  expect(document.querySelector('.leettrace-gutter-badge')).not.toBeNull();
  updateGutterAnnotations(100, []);
  expect(document.querySelector('.leettrace-gutter-badge')).toBeNull();
  expect(document.querySelector('.leettrace-line-highlight')).toBeNull();
});
