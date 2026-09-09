import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { processSnapshots, createTraceContext, type RawTraceResult } from '../../src/offscreen/snapshot-builder';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import BatchStructureViz from '../../src/panel/components/visualizers/BatchStructureViz';
import OperationDetails from '../../src/panel/components/OperationDetails';
import VizRouter from '../../src/panel/components/visualizers/VizRouter';
import type { Snapshot } from '../../src/shared/types';

const results: { id: string; trace: RawTraceResult }[] = JSON.parse(execFileSync('python',['-c',"import sys,json; from pathlib import Path; sys.path.insert(0,'src/offscreen'); import tracer; cases=json.loads(Path('tests/dev/batch-examples.json').read_text()); print(json.dumps([{'id':c['id'],'trace':json.loads(tracer.run_traced('def solve():\\n'+'\\n'.join('    '+line for line in c['body'].splitlines())+'\\nresult = solve()', []))} for c in cases]))"],{encoding:'utf8',maxBuffer:32*1024*1024}));
const cases=results.map(r=>({id:r.id,snapshots:processSnapshots(r.trace.snapshots,createTraceContext(r.trace.indexing)),error:r.trace.error}));
afterEach(cleanup);
function provider(snapshots:Snapshot[],step:number,children:React.ReactNode,dispatch=vi.fn()) {
  return <TraceContext.Provider value={{state:{...initialState,snapshots,currentStep:step,totalSteps:snapshots.length},dispatch}}>{children}</TraceContext.Provider>;
}

it.each(cases)('renders every real batch fixture: $id',({snapshots,error})=>{
  expect(error).toBeNull();
  for(const step of [Math.floor(snapshots.length/2),snapshots.findLastIndex(s=>s.frameName==='solve')]){
    const html=renderToStaticMarkup(provider(snapshots,step,<><OperationDetails/><VizRouter/></>));
    expect(html).not.toMatch(/(?:NaN|undefined)(?:px|[ ,"])/);
    if (snapshots[step].visual?.operation) expect(html).toContain('batch-operation');
  }
});

it('renders graph links automatically from source relationships',()=>{
  const snapshots=cases.find(c=>c.id==='graph-bfs')!.snapshots;
  const step=snapshots.findLastIndex(s=>s.frameName==='solve');
  const graph=snapshots[step].dataStructures.find(ds=>ds.id==='graph')!;
  const view=render(provider(snapshots,step,<BatchStructureViz dataStructure={graph} previous={null}/>));
  expect(view.container.querySelectorAll('path.edge')).toHaveLength(4);
  fireEvent.click(screen.getByLabelText('Inspect graph node A'));
  expect(screen.getByText(/graph\[A\] =/)).toBeTruthy();
});

it('operation history rewinds without retaining future outcomes',()=>{
  const snapshots=cases.find(c=>c.id==='inline-pair')!.snapshots,step=snapshots.findLastIndex(s=>s.frameName==='solve');
  const dispatch=vi.fn();const view=render(provider(snapshots,step,<OperationDetails/>,dispatch));
  const count=view.container.querySelectorAll('.batch-history button').length;
  fireEvent.click(view.container.querySelector('.batch-history button')!);
  expect(dispatch.mock.calls[0][0]).toEqual({type:'PAUSE'});
  const earlier=dispatch.mock.calls[1][0].payload;
  view.rerender(provider(snapshots,earlier,<OperationDetails/>,dispatch));
  expect(view.container.querySelectorAll('.batch-history button').length).toBeLessThan(count);
});

it('keeps overlapping pointer colors and moves them with the current snapshot', () => {
  const snapshots = cases.find(c => c.id === 'inline-pair')!.snapshots;
  const structure = {
    id: 'nums', type: 'array' as const, data: [2, 4, 7],
    pointers: [{name: 'left', index: 0, color: '#38bdf8'}, {name: 'right', index: 0, color: '#f87171'}],
  };
  const view = render(provider(snapshots, 0, <BatchStructureViz dataStructure={structure} previous={null}/>));
  const shared = screen.getByRole('button', {name: 'nums[0] = 2; pointers: left, right'});
  expect(shared.style.getPropertyValue('--pointer-fill')).toContain('#38bdf8');
  expect(shared.style.getPropertyValue('--pointer-fill')).toContain('#f87171');
  expect(shared.querySelectorAll('.batch-pointer')).toHaveLength(2);
  const moved = {...structure, pointers: structure.pointers.map(p => ({...p, index: 2}))};
  view.rerender(provider(snapshots, 0, <BatchStructureViz dataStructure={moved} previous={null}/>));
  expect(screen.getByRole('button', {name: 'nums[0] = 2'}).style.getPropertyValue('--pointer-fill')).toBe('');
  fireEvent.click(screen.getByRole('button', {name: 'nums[2] = 7; pointers: left, right'}));
  expect(screen.getByText('nums[2] = 7')).toBeTruthy();
  view.rerender(provider(snapshots, 0, <BatchStructureViz dataStructure={structure} previous={null}/>));
  expect(screen.getByRole('button', {name: 'nums[0] = 2; pointers: left, right'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'nums[2] = 7'}).querySelectorAll('.batch-pointer')).toHaveLength(0);
});
