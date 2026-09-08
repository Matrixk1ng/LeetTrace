import { expect, it } from 'vitest';
import { createTraceContext, processSnapshots, type RawSnapshot } from '../../src/offscreen/snapshot-builder';
import type { VisualReferences } from '../../src/shared/types';

const base = [[1,2],[3,4]];
const index = {grid:{row:['r','nr'],col:['c','nc']}};
function raw(line:number, q:unknown[], visual:Partial<VisualReferences>={}, grid=base): RawSnapshot {
  return {step:0,line,event:'line',frameId:'f',frameName:'bfs',callDepth:1,
    visual:{names:[],cells:[],...visual},variables:{
      grid:{type:'list',value:grid,changed:false},q:{type:'deque',value:{__type:'deque',items:q},changed:false},
      r:{type:'int',value:0,changed:false},c:{type:'int',value:0,changed:false},
      nr:{type:'int',value:0,changed:false},nc:{type:'int',value:1,changed:false}}};
}
const loop = {line:2,queue:'q'};
const initial=[[0,0],[1,0]], rest=[[1,0]], appended=[[1,0],[0,1]];
function fixture() {
  return [raw(1,initial),raw(2,initial,{levelLoop:loop}),
    raw(3,initial,{levelLoop:loop,queueOperation:{kind:'popleft',queue:'q',targets:['r','c']}}),
    raw(4,rest,{levelLoop:loop,cells:[{structure:'grid',indices:['nr','nc'],write:true}]}),
    raw(5,rest,{levelLoop:loop,queueOperation:{kind:'append',queue:'q'}},[[1,9],[3,4]]),
    raw(6,appended,{levelLoop:loop},[[1,9],[3,4]])];
}
function run(rows:RawSnapshot[]) {return processSnapshots(rows.map((r,step)=>({...r,step})),createTraceContext(index));}

it('derives current, queue slices and observed effects without future entries',()=>{
  const s=run(fixture());
  expect(s[1].gridSearch?.frontier).toEqual({remaining:2,pass:1});
  expect(s[2].gridSearch?.current).toBeUndefined();
  expect(s[3].gridSearch?.current).toEqual([0,0]);
  expect(s[3].gridSearch?.frontier?.remaining).toBe(1);
  expect(s[4].gridSearch?.effects).toEqual([{kind:'write',line:4,cell:[0,1],before:2,after:9}]);
  expect(s[4].gridSearch?.effects.some(e=>e.kind==='enqueue')).toBe(false);
  expect(s[5].gridSearch?.effects).toEqual([{kind:'enqueue',line:5,value:[0,1]}]);
  expect(s[1].gridSearch?.frontier?.remaining).toBe(2);
});
it('falls back when an unexplained queue change invalidates the boundary',()=>{
  const f=fixture();f[3].variables.q.value={__type:'deque',items:[[99,99]]};
  expect(run(f)[3].gridSearch?.frontier).toBeUndefined();
});
it('does not create layers without an explicit fixed-size loop',()=>{
  const f=fixture().map(r=>({...r,visual:{...r.visual!,levelLoop:undefined}}));
  expect(run(f).every(s=>!s.gridSearch?.frontier)).toBe(true);
});
it('increments a pass only after exiting and re-entering the level loop',()=>{
  const f=fixture();f.push(raw(9,appended),raw(2,appended,{levelLoop:loop}));
  const s=run(f);expect(s[6].gridSearch?.frontier).toBeUndefined();
  expect(s[7].gridSearch?.frontier).toEqual({remaining:2,pass:2});
});
it('does not invent effects across another frame',()=>{
  const f=fixture();f.splice(3,0,{...raw(20,initial),frameId:'helper',frameName:'helper'});
  expect(run(f)[4].gridSearch?.effects).toEqual([]);
});
it('matches duplicate queue values by suffix, not unequal first items',()=>{
  const f=[raw(1,[[0,0],[0,0]],{queueOperation:{kind:'popleft',queue:'q',targets:['r','c']}}),raw(2,[[0,0]])];
  expect(run(f)[1].gridSearch?.effects[0]?.kind).toBe('dequeue');
});
it('does not put unrelated unpacked coordinates on the grid',()=>{
  const f=fixture();f[2].visual!.queueOperation!.targets=['distance','node'];
  expect(run(f)[3].gridSearch?.current).toBeUndefined();
});
it('binds offset coordinates only after their assignment is observed',()=>{
  const f=fixture();
  f[3].visual!.offsets=[{target:'nr',base:'r'},{target:'nc',base:'c'}];
  const s=processSnapshots(f,createTraceContext({grid:{row:['nr'],col:['nc']}}));
  expect(s[3].gridSearch?.current).toBeUndefined();
  expect(s[4].gridSearch?.current).toEqual([0,0]);
});
