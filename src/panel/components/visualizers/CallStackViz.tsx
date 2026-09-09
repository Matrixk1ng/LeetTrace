import { useState } from 'react';
import type { StackFrame, TraceEvent } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';
import { formatValue, truncate } from './format';

interface CallStackVizProps { frames: StackFrame[]; event?: TraceEvent; embedded?: boolean }
const MAX_VISIBLE = 6;

export default function CallStackViz({ frames, event, embedded = false }: CallStackVizProps) {
  const [expanded, setExpanded] = useState(false);
  if (!frames.length) return null;
  const ordered = [...frames].reverse();
  const visible = expanded ? ordered : ordered.slice(0, MAX_VISIBLE);
  return <section className={embedded ? 'mt-3 border-t border-trace-border pt-3' : 'rounded-xl border border-trace-border bg-trace-bg-card p-3'}>
    <div className="mb-2 flex justify-between text-xs"><span className="font-semibold">Call stack</span><span className="text-trace-text-muted">depth {frames.length}</span></div>
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {visible.map((frame,index) => {
        const args = Object.entries(frame.arguments ?? {});
        const fallback = frame.treeNode ? frame.treeNode.name + ' = ' + (frame.treeNode.nodeId === null ? 'None' : formatValue(frame.treeNode.value)) : '';
        const summary = args.length ? args.slice(0,3).map(([name,v]) => name + ' = ' +
          truncate(frame.treeNode?.name === name ? frame.treeNode.nodeId === null ? 'None' : formatValue(frame.treeNode.value) : formatTraceValue(v.value,v.type),18)).join(', ') +
          (args.length > 3 ? ', +' + (args.length-3) + ' more' : '') : fallback;
        return <details key={frame.frameId} className="min-w-0 rounded-md border px-2 py-1"
          style={{borderColor:index===0 ? '#38bdf8' : '#2d3a5c', background:index===0 ? '#38bdf812' : '#16213e'}}>
          <summary className="cursor-pointer text-[11px]" title={frame.frameName + '(' + summary + ') — line ' + frame.line}>
            <span className="break-all font-mono">{frame.frameName}({summary})</span>
            <span className="ml-2 text-[10px] text-trace-text-secondary">{index===0 ? event==='return' ? '↑ returning' : '← current' : 'waiting'}</span>
          </summary>
          <p className="mt-2 text-[10px] text-trace-text-muted">Arguments at call entry · line {frame.line}</p>
          {args.length ? <dl className="my-2 space-y-2">{args.map(([name,v]) => {
            const tagged = v.value && typeof v.value==='object' && '__type' in v.value;
            const value = v.value && typeof v.value==='object' && !tagged ? JSON.stringify(v.value,null,2) : formatTraceValue(v.value,v.type);
            return <div key={name}><dt className="font-mono text-xs text-trace-accent">{name} <span className="text-trace-text-muted">· {v.type}</span></dt><dd className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-trace-text-secondary">{value}</dd></div>;
          })}</dl> : <p className="my-2 text-xs text-trace-text-secondary">{frame.arguments ? 'No explicit parameters.' : 'Parameter values were not recorded in this trace.'}</p>}
        </details>;
      })}
    </div>
    {ordered.length > MAX_VISIBLE && <button type="button" className="mt-2 text-xs text-trace-accent" onClick={()=>setExpanded(!expanded)}>{expanded ? 'Show recent calls' : 'Show '+(ordered.length-MAX_VISIBLE)+' older calls'}</button>}
  </section>;
}
