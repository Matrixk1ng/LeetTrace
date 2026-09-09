import { useTrace } from '../../store/useTrace';

export default function TreeEventNavigation({structureId}: {structureId:string}) {
  const {state,dispatch}=useTrace();
  const steps=state.snapshots.flatMap((s,i)=>s.dataStructures.some(d=>d.id===structureId && d.traversal?.action) ? [i] : []);
  if(!steps.length) return null;
  const previous=steps.filter(i=>i<state.currentStep).at(-1), next=steps.find(i=>i>state.currentStep);
  const jump=(step:number|undefined)=>{if(step!==undefined){dispatch({type:'PAUSE'});dispatch({type:'SET_STEP',payload:step});}};
  return <nav aria-label="Tree call events" className="mt-3 flex justify-between gap-2 border-t border-trace-border pt-2 text-xs">
    <button type="button" className="rounded border border-trace-border px-2 py-1 text-trace-accent disabled:opacity-40" disabled={previous===undefined} onClick={()=>jump(previous)}>← Previous event</button>
    <button type="button" className="rounded border border-trace-border px-2 py-1 text-trace-accent disabled:opacity-40" disabled={next===undefined} onClick={()=>jump(next)}>Next event →</button>
  </nav>;
}
