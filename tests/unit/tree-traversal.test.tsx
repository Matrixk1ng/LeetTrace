import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTraceContext, processSnapshots, type RawSnapshot } from '../../src/offscreen/snapshot-builder';
import TreeViz from '../../src/panel/components/visualizers/TreeViz';
import CallStackViz from '../../src/panel/components/visualizers/CallStackViz';

const left = {id:'b', val:1, left:null, right:null};
const right = {id:'c', val:1, left:null, right:null};
const root = {id:'a', val:2, left, right};
function raw(event: RawSnapshot['event'], frameId: string, node: typeof root | typeof left | null, extra = {}): RawSnapshot {
  return {step:0, line:5, event, frameId, frameName:'dfs', callDepth:0,
    variables:{node:{type:node ? 'TreeNode' : 'NoneType', value:node ? {__type:'tree',root:node} : null, changed:false}, ...extra}};
}
function run(raws: RawSnapshot[]) {
  return processSnapshots(raws.map((r,step) => ({...r,step})), createTraceContext());
}
function fixture() {
  return run([raw('call','a',root), raw('call','c',right), raw('call','nil',null),
    raw('return','nil',null), raw('return','c',right), raw('line','a',root),
    raw('call','b',left), raw('return','b',left), raw('return','a',root)]);
}
describe('recorded tree traversal', () => {
  it('preserves enclosing tree during child and empty calls', () => {
    const snaps=fixture();
    expect(snaps[2].dataStructures).toHaveLength(1);
    expect(snaps[2].dataStructures[0].data).toEqual({__type:'tree', root});
    expect(snaps[2].callStack.at(-1)?.treeNode).toEqual({name:'node',nodeId:null,value:null});
    expect(snaps[2].dataStructures[0].traversal?.currentNodeId).toBeNull();
    expect(snaps[2].dataStructures[0].traversal?.path).toEqual(['a','c']);
  });
  it('records actual right-first calls by identity and never leaks future entries', () => {
    const snaps=fixture();
    expect(snaps[0].dataStructures[0].traversal?.entered.map(e => e.nodeId)).toEqual(['a']);
    expect(snaps[6].dataStructures[0].traversal?.entered.map(e => e.nodeId)).toEqual(['a','c','b']);
    expect(snaps[4].dataStructures[0].traversal?.returnedNodeIds).toEqual(['c']);
    expect(snaps[1].dataStructures[0].traversal?.returnedNodeIds).toEqual([]);
    expect(snaps[4].dataStructures[0].traversal?.action).toMatchObject({kind:'return',nodeId:'c',parentId:'a'});
  });
  it('does not mark untouched branches entered when recursion ends early', () => {
    const snaps=run([raw('call','a',root),raw('call','c',right),raw('return','c',right),raw('return','a',root)]);
    expect(snaps[3].dataStructures[0].traversal?.entered.map(e => e.nodeId)).toEqual(['a','c']);
  });
  it('patches mutations into enclosing trees without altering earlier snapshots', () => {
    const changed={...right,val:99};
    const snaps=run([raw('call','a',root),raw('call','c',right),raw('line','c',changed)]);
    expect(snaps[2].dataStructures[0].data).toEqual({__type:'tree',root:{...root,right:changed}});
    expect(snaps[0].dataStructures[0].data).toEqual({__type:'tree',root});
  });
  it('abstains when recursive calls have multiple distinct tree parameters', () => {
    const extra={other:{type:'TreeNode', value:{__type:'tree',root:left},changed:false}};
    const snaps=run([raw('call','a',root,extra),raw('call','c',right,extra)]);
    expect(snaps[1].dataStructures.every(ds => !ds.traversal)).toBe(true);
  });
  it('renders current and returned node states plus working entry links', () => {
    const snaps=fixture();
    const jump=vi.fn();
    const {container,rerender}=render(<TreeViz dataStructure={snaps[6].dataStructures[0]} onSelectStep={jump}/>);
    expect(container.querySelector('[data-node-id="b"]')?.getAttribute('data-state')).toBe('Current');
    expect(container.querySelector('[data-node-id="c"]')?.getAttribute('data-state')).toBe('Returned');
    fireEvent.click(screen.getByTitle('Entry 2 · step 2'));
    expect(jump).toHaveBeenCalledWith(1);
    rerender(<TreeViz dataStructure={snaps[0].dataStructures[0]} onSelectStep={jump}/>);
    expect(screen.queryByTitle('Entry 2 · step 2')).toBeNull();
  });
  it('labels recursive stack arguments including empty children', () => {
    render(<CallStackViz frames={fixture()[2].callStack}/>);
    expect(screen.getByText('dfs(node = None)')).toBeTruthy();
    expect(screen.getByText('dfs(node = 2)')).toBeTruthy();
  });
});
