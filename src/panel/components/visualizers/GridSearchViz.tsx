import { gridSearchStructures } from './gridSearch';
import GridFocusViz from './GridFocusViz';
import QueueViz from './QueueViz';
import { useTrace } from '../../store/useTrace';
import { formatValue, itemsOf } from './format';

export default function GridSearchViz() {
  const {state, currentSnapshot: snapshot, dispatch} = useTrace();
  const structures = gridSearchStructures(snapshot, state.detectedPattern?.type);
  if(!structures || !snapshot) return null;
  const {grid,queue} = structures;
  const refs = snapshot.visual?.cells.filter(c => c.structure === grid.id) ?? [];
  const search = snapshot.gridSearch;
  const waiting = itemsOf(queue.data);
  const frontier = search?.frontier;
  const effects = search?.effects ?? [];
  const lastEffect = effects.at(-1);
  const events = state.snapshots.flatMap((s,i) => s.gridSearch?.event ? [i] : []);
  const prev = events.filter(i => i < state.currentStep).at(-1);
  const next = events.find(i => i > state.currentStep);
  const jump = (step: number | undefined) => {if(step !== undefined) {dispatch({type:'PAUSE'});dispatch({type:'SET_STEP',payload:step});}};
  const chips = (values: unknown[]) => <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{values.length ? values.map((v,i) => <span key={i} className="max-w-full break-all rounded border border-trace-border bg-trace-bg-secondary px-2 py-1 font-mono text-xs">{formatValue(v)}</span>) : <span className="text-xs text-trace-text-muted">Empty</span>}</div>;
  return <section className="space-y-3" aria-label="Grid search">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Grid search</h2><span className="text-xs text-trace-text-secondary">{frontier ? 'Layer pass '+frontier.pass : 'BFS'}</span></div>
    <div className="rounded-r-lg border-l-[3px] border-amber-300 bg-amber-300/5 px-3 py-2">
      <p className="text-sm font-semibold">{lastEffect ? {enqueue:'Added to the queue',dequeue:'Process the dequeued state',write:'Updated a grid cell'}[lastEffect.kind] : refs.some(c => c.write) ? 'Prepare to update a cell' : refs.length ? 'Inspect a grid expression' : snapshot.event === 'return' ? 'Return from this call' : 'Follow the current statement'}</p>
      <p className="mt-1 text-xs text-trace-text-secondary">{snapshot.event === 'line' ? 'Before line ' : 'Line '}{snapshot.line} · {snapshot.frameName}()</p>
    </div>
    <section id={'structure-'+encodeURIComponent(grid.id)} className="rounded-xl border border-trace-border bg-trace-bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold">{grid.id}</h3><GridFocusViz dataStructure={grid} snapshot={snapshot}/>
    </section>
    <section id={'structure-'+encodeURIComponent(queue.id)} className="rounded-xl border border-trace-border bg-trace-bg-card p-3">
      {frontier ? <div className="grid grid-cols-2 gap-3">
        <div><h3 className="mb-2 text-xs font-semibold">Current frontier · {frontier.remaining}</h3>{chips(waiting.slice(0,frontier.remaining))}</div>
        <div><h3 className="mb-2 text-xs font-semibold">Next frontier · {waiting.length-frontier.remaining}</h3>{chips(waiting.slice(frontier.remaining))}</div>
      </div> : <><h3 className="mb-2 text-xs font-semibold">{queue.id} · Waiting queue</h3><QueueViz dataStructure={queue} previousDataStructure={null}/></>}
      <p className="mt-2 text-[11px] text-trace-text-muted">{frontier ? 'Waiting now / appended during this fixed-size loop.' : 'Front is next to leave. No verified level boundary.'}</p>
    </section>
    {effects.length>0 && <div className="space-y-1 text-xs" aria-label="Observed effects">{effects.map((e,i)=><p key={i} className="break-all text-emerald-200"><span className="text-trace-text-muted">After line {e.line}: </span>{e.kind==='write' ? `${grid.id}[${e.cell![0]}][${e.cell![1]}] ${formatValue(e.before)} → ${formatValue(e.after)}` : `${queue.id} ${e.kind==='enqueue'?'+':'−'} ${formatValue(e.value)}`}</p>)}</div>}
    {events.length>0 && <nav className="flex justify-between gap-2 border-t border-trace-border pt-2 text-xs" aria-label="Grid search events">
      <button type="button" onClick={()=>jump(prev)} disabled={prev===undefined} className="rounded border border-trace-border px-2 py-1 text-trace-accent disabled:opacity-40">← Previous event</button>
      <button type="button" onClick={()=>jump(next)} disabled={next===undefined} className="rounded border border-trace-border px-2 py-1 text-trace-accent disabled:opacity-40">Next event →</button>
    </nav>}
  </section>;
}
