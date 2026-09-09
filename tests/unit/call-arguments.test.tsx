import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawSnapshot } from '../../src/offscreen/snapshot-builder';
import CallStackViz from '../../src/panel/components/visualizers/CallStackViz';
import TreeViz from '../../src/panel/components/visualizers/TreeViz';
afterEach(cleanup);
const arg=(value: unknown)=>({value,type:typeof value==='number'?'int':'list',changed:false});
const raw=(event:RawSnapshot['event'],frameId:string,row:number):RawSnapshot=>({step:0,line:4,event,frameId,frameName:'dfs',callDepth:0,variables:{row:arg(row)},...(event==='call'?{arguments:{row:arg(row),col:arg(3)}}:{})});
it('preserves distinct parent and child entry arguments through returns',()=>{
  const s=processSnapshots([raw('call','parent',1),raw('call','child',2),raw('line','child',10),raw('return','child',10),raw('line','parent',8)],createTraceContext());
  expect(s[3].callStack.map(f=>f.arguments?.row.value)).toEqual([1,2]);
  expect(s[4].callStack.map(f=>f.arguments?.row.value)).toEqual([1]);
  render(<CallStackViz frames={s[3].callStack} event="return"/>);
  expect(screen.getByText('dfs(row = 2, col = 3)')).toBeTruthy();
  expect(screen.getByText('dfs(row = 1, col = 3)')).toBeTruthy();
  expect(screen.getByText('↑ returning')).toBeTruthy();
});
it('makes recorded long arguments available by expansion',()=>{
  const values=Array.from({length:20},(_,i)=>i);
  render(<CallStackViz frames={[{frameId:'a',frameName:'solve',line:2,arguments:{values:arg(values)}}]}/>);
  const details=document.querySelector('details')!;
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(true);
  expect(details.querySelector('dd')?.textContent).toBe(JSON.stringify(values,null,2));
});
it('selects tree nodes by identity and only offers recorded entry jumps',()=>{
  const jump=vi.fn();
  const data={id:'root',type:'tree' as const,pointers:[],data:{root:{id:'a',val:2,left:{id:'b',val:2,left:null,right:null},right:null}},
    traversal:{currentNodeId:'a',path:['a'],entered:[{nodeId:'a',value:2,step:1}],returnedNodeIds:[],events:[]}};
  const {container}=render(<TreeViz dataStructure={data} onSelectStep={jump}/>);
  fireEvent.keyDown(container.querySelector('[data-node-id="b"]')!,{key:'Enter'});
  expect(screen.queryByRole('button',{name:'Go to first call'})).toBeNull();
  fireEvent.click(container.querySelector('[data-node-id="a"]')!);
  fireEvent.click(screen.getByRole('button',{name:'Go to first call'}));
  expect(jump).toHaveBeenCalledWith(1);
});
