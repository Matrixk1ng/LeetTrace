import type { GridSearchState, Snapshot } from '../shared/types';
import type { IndexingMap } from './snapshot-builder';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const items = (s: Snapshot, name: string): unknown[] | null => {
  const v = s.variables[name]?.value as {__type?: string; items?: unknown[]} | undefined;
  return v?.__type === 'deque' && Array.isArray(v.items) ? v.items : null;
};

/** Replay observations once, independently of playback direction. Never eval code. */
export function enrichGridSearch(snapshots: Snapshot[], indexing: IndexingMap): Snapshot[] {
  const frames = new Map<string, {previous: Snapshot; current?: [number,number]; queue?: string;
    unpacked?: {value:[number,number]; names:[string,string]; row:boolean; col:boolean};
    boundary?: {line:number; queue:string; remaining:number; pass:number}; passes: Map<number,number>}>();
  for (let i=0;i<snapshots.length;i++) {
    const s=snapshots[i];
    const state=frames.get(s.frameId) ?? {previous:s, passes:new Map<number,number>()};
    const grids=s.dataStructures.filter(d=>d.type==='matrix');
    const queues=s.dataStructures.filter(d=>d.type==='queue');
    if(grids.length!==1 || queues.length!==1 || !s.visual) {
      state.current=undefined; state.unpacked=undefined; state.boundary=undefined; state.previous=s;
      frames.set(s.frameId,state); continue;
    }
    const grid=grids[0], queue=queues[0], now=items(s,queue.id)!;
    const previous=state.previous;
    if(state.queue!==queue.id) {state.current=undefined;state.unpacked=undefined;state.boundary=undefined;state.queue=queue.id;}
    const before=items(previous,queue.id);
    const adjacent=i>0 && snapshots[i-1]===previous && previous.event==='line';
    const operation=adjacent ? previous.visual?.queueOperation : undefined;
    const effects: GridSearchState['effects']=[];
    let accounted = before !== null && equal(before,now);
    if(operation?.queue===queue.id && before) {
      if(operation.kind==='append' && now.length===before.length+1 && equal(before,now.slice(0,-1))) {
        effects.push({kind:'enqueue',line:previous.line,value:now.at(-1)});accounted=true;
      }
      if(operation.kind==='popleft' && before.length===now.length+1 && equal(before.slice(1),now)) {
        effects.push({kind:'dequeue',line:previous.line,value:before[0]});accounted=true;
        state.current=undefined;
        state.unpacked=undefined;
        const coord=before[0]; const names=operation.targets; const axes=indexing[grid.id];
        // The unpacked names must be associated with the grid's matching axes.
        if(names && Array.isArray(coord) && coord.length===2 && coord.every(Number.isInteger) &&
           equal(names.map(n=>s.variables[n]?.value),coord)) {
          state.unpacked={value:[coord[0],coord[1]],names,row:!!axes?.row.includes(names[0]),col:!!axes?.col.includes(names[1])};
        }
        if(state.boundary) {
          if(state.boundary.remaining>0) state.boundary={...state.boundary,remaining:state.boundary.remaining-1};
          else state.boundary=undefined;
        }
      }
    }
    if(!accounted) {state.boundary=undefined;state.current=undefined;state.unpacked=undefined;}
    if(state.unpacked) {
      const u=state.unpacked, axes=indexing[grid.id];
      if(adjacent && equal(u.names.map(n=>s.variables[n]?.value),u.value)) {
        for(const offset of previous.visual?.offsets ?? []) {
          if(offset.base===u.names[0] && axes?.row.includes(offset.target)) u.row=true;
          if(offset.base===u.names[1] && axes?.col.includes(offset.target)) u.col=true;
        }
      }
      if(u.row && u.col) state.current=u.value;
    }
    const loop=s.visual.levelLoop;
    if(!loop || loop.queue!==queue.id) state.boundary=undefined;
    else if(s.line===loop.line && previous.visual?.levelLoop?.line!==loop.line &&
            // The builtins must really be the builtins, not user-shadowed helpers.
            !('range' in s.variables) && !('len' in s.variables)) {
      const pass=(state.passes.get(loop.line) ?? 0)+1;state.passes.set(loop.line,pass);
      state.boundary={line:loop.line,queue:queue.id,remaining:now.length,pass};
    }
    if(adjacent) {
      const oldGrid=previous.variables[grid.id]?.value;
      const newGrid=grid.data as unknown[][];
      for(const c of previous.visual?.cells ?? []) {
        if(c.structure!==grid.id || !c.write || !Array.isArray(oldGrid)) continue;
        const [r,col]=c.indices.map(x=>typeof x==='number'?x:previous.variables[x]?.value);
        if(typeof r!=='number'||typeof col!=='number'||!Number.isInteger(r)||!Number.isInteger(col)||r<0||col<0) continue;
        if(!Array.isArray(oldGrid[r]) || col>=oldGrid[r].length || !Array.isArray(newGrid[r]) || col>=newGrid[r].length) continue;
        if(!equal(oldGrid[r][col],newGrid[r][col])) effects.push({kind:'write',line:previous.line,cell:[r,col],before:oldGrid[r][col],after:newGrid[r][col]});
      }
    }
    const ref=s.visual.cells.some(c=>c.structure===grid.id);
    s.gridSearch={grid:grid.id,queue:queue.id,current:state.current,
      frontier:state.boundary ? {remaining:state.boundary.remaining,pass:state.boundary.pass} : undefined,
      effects,event:effects.length>0 || ref && (previous.line!==s.line || previous.frameId!==s.frameId)};
    state.previous=s;
    if(s.event==='return') frames.delete(s.frameId); else frames.set(s.frameId,state);
  }
  return snapshots;
}
