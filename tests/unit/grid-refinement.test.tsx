import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { createTraceContext, processSnapshot, type RawSnapshot } from '../../src/offscreen/snapshot-builder';
import GridFocusViz from '../../src/panel/components/visualizers/GridFocusViz';
import TupleSequenceViz from '../../src/panel/components/visualizers/TupleSequenceViz';
import { gridSearchStructures } from '../../src/panel/components/visualizers/gridSearch';
import GridSearchViz from '../../src/panel/components/visualizers/GridSearchViz';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';

afterEach(cleanup);

const raw: RawSnapshot = {step:0,event:'line',line:8,frameId:'f',frameName:'solve',callDepth:1,
  visual:{names:['grid','nr','nc'],cells:[{structure:'grid',indices:['nr','nc'],write:false}]},
  variables:{grid:{type:'list',value:[[1,2],[3,4]],changed:false},
    directions:{type:'list',value:[[-1,0],[0,1]],tupleItems:true,changed:false},
    i:{type:'int',value:1,changed:false},j:{type:'int',value:1,changed:false},
    nr:{type:'int',value:0,changed:false},nc:{type:'int',value:1,changed:false}}};
const build = (r=raw) => processSnapshot(r,createTraceContext({grid:{row:['i','nr'],col:['j','nc']}}));
it('uses the current statement instead of stale matrix pointers', () => {
  const s=build(); const grid=s.dataStructures.find(d => d.id==='grid')!;
  expect(grid.pointers).toEqual([]);
  render(<GridFocusViz dataStructure={grid} snapshot={s}/>);
  expect(screen.getByRole('button',{name:'grid[0][1] = 2, referenced by this line'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'grid[1][1] = 4'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'grid[1][1] = 4'}));
  expect(screen.getByRole('status').textContent).toBe('grid[1][1] = 4');
});
it('renders tuple records without matrix axes', () => {
  const ds=build().dataStructures.find(d => d.id==='directions')!;
  expect(ds.type).toBe('array');
  render(<TupleSequenceViz dataStructure={ds}/>);
  expect(screen.getByText('(-1, 0)')).toBeTruthy();
});
it('does not invent a cell for missing or out of bounds indices', () => {
  const s=build({...raw, variables:{...raw.variables,nr:{type:'int',value:99,changed:true}}});
  render(<GridFocusViz dataStructure={s.dataStructures.find(d=>d.id==='grid')!} snapshot={s}/>);
  expect(screen.queryByText('Referenced')).toBeNull();
});
it('does not group ambiguous queues and grids into a BFS hero', () => {
  const s=build();
  s.dataStructures.push({id:'q',type:'queue',data:{__type:'deque',items:[]},pointers:[]});
  expect(gridSearchStructures(s,'bfs')).not.toBeNull();
  expect(gridSearchStructures(s,'dfs')).toBeNull();
  s.dataStructures.push({id:'q2',type:'queue',data:{__type:'deque',items:[]},pointers:[]});
  expect(gridSearchStructures(s,'bfs')).toBeNull();
});
it('event navigation pauses and jumps without replacing exact trace state',()=>{
  const s=build();
  s.dataStructures.push({id:'q',type:'queue',data:{__type:'deque',items:[]},pointers:[]});
  s.gridSearch={grid:'grid',queue:'q',effects:[],event:true};
  const dispatch=vi.fn();
  render(<TraceContext.Provider value={{state:{...initialState,snapshots:[s,s,s],currentStep:1,totalSteps:3,
    detectedPattern:{type:'bfs',confidence:.8,description:''}},dispatch}}><GridSearchViz/></TraceContext.Provider>);
  fireEvent.click(screen.getByRole('button',{name:'Next event →'}));
  expect(dispatch.mock.calls).toEqual([[{type:'PAUSE'}],[{type:'SET_STEP',payload:2}]]);
});
