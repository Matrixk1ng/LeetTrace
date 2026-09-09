import { useEffect, useRef, useState } from 'react';
import type { LearningModel } from './learningModel';
import { callLabel } from './learningModel';
import { formatTraceValue } from '../../../shared/display';
import { useTrace } from '../../store/useTrace';
import CallStackViz from './CallStackViz';
import './recursion-dp.css';

export default function RecursionDPViz({ model }: { model: LearningModel }) {
  const { state, dispatch, currentSnapshot } = useTrace();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [follow, setFollow] = useState(true);
  const [inspect, setInspect] = useState<number | null>(null);
  const walk = useRef<HTMLDivElement>(null);
  const rows = model.rows.filter(row => !row.ancestors.some(id => folded.has(id)) && !(row.kind !== 'call' && folded.has(row.frameId))).slice(-300);
  const latest = model.rows.findLast(row => row.step === state.currentStep && row.kind === 'reuse') ?? model.rows.at(-1);
  const table = model.table;
  const effect = table?.event;
  const target = typeof effect?.key === 'number' ? effect.key : -1;
  const start = Math.max(0, Math.min(Math.max(0, (inspect ?? (target >= 0 ? target : 0)) - 10), (table?.values.length ?? 0) - 24));
  const steps = state.snapshots.flatMap((s, i) => (model.recursive ? s.callStack.length && (s.event === 'call' || s.event === 'return' || s.visual?.learning?.some(e => e.kind === 'memo-write')) : s.visual?.learning?.some(e => e.kind === 'table-read' || e.kind === 'table-write')) ? [i] : []);
  const jump = (i: number | undefined) => { if (i !== undefined) { dispatch({ type: 'PAUSE' }); dispatch({ type: 'SET_STEP', payload: i }); } };
  const previous = steps.filter(i => i < state.currentStep).at(-1), next = steps.find(i => i > state.currentStep);
  useEffect(() => {
    if (follow && walk.current) walk.current.scrollTop = walk.current.scrollHeight;
  }, [state.currentStep, follow]);
  return <section className="recursion-dp">
    <h2>{model.recursive ? 'Follow each call to its answer' : 'Build from earlier table entries'}</h2>
    <div className="rd-action" aria-live="polite">
      {model.recursive ? <><strong>{latest?.text ?? 'Follow the calls'}</strong><p>{currentSnapshot?.event === 'line' ? `Line ${currentSnapshot.line} is about to execute. The walkthrough shows recorded calls and completed effects.` : `Line ${currentSnapshot?.line} · ${currentSnapshot?.event} event`}</p></> : <><strong>{effect ? `${effect.kind === 'table-read' ? 'Read inputs for' : 'Write'} ${table?.name}[${target}]` : `${table?.name} · current contents`}</strong><p>{effect?.kind === 'table-read' ? 'Highlighted inputs are about to be read; the destination still shows its current value.' : effect?.kind === 'table-write' ? 'The assignment completed. These inputs produced the highlighted entry.' : 'Exact values from this step. No table write is inferred.'}</p></>}
    </div>
    {model.recursive && <>
      <div className="rd-heading"><b>Calls and returns</b><button aria-pressed={follow} onClick={() => setFollow(!follow)}>Follow current: {follow ? 'on' : 'off'}</button></div>
      <p className="rd-note">Active: {model.frames.slice(-4).map(callLabel).join(' → ')}{model.frames.length > 4 ? ' · last 4 calls' : ''}</p>
      <div className="rd-walk" ref={walk} aria-label="Nested call walkthrough">
        {rows.map(row => <div key={row.key} className={'rd-row rd-' + row.kind + (row.step === state.currentStep ? ' rd-current' : '')} style={{ marginLeft: Math.min(row.depth, 8) * 12 }}>
          {row.kind === 'call' ? <button aria-expanded={!folded.has(row.frameId)} onClick={() => setFolded(old => { const result = new Set(old); if (result.has(row.frameId)) result.delete(row.frameId); else result.add(row.frameId); return result; })}>{folded.has(row.frameId) ? '▸' : '▾'} {row.text}{row.returned !== undefined && <span className="rd-return"> → {row.returned}</span>}</button> : row.text}
          {row.depth > 8 && <small>Call depth {row.depth + 1}</small>}
        </div>)}
      </div>
      <p className="rd-note">Fold a call to hide its contents. {model.rows.length > 300 ? 'Showing up to 300 recent visible events; exact steps retain the full trace.' : 'Indentation shows caller and child relationships.'}</p>
      {model.saved.length > 0 && <details open className="rd-saved"><summary>Saved entries · {model.saved.length}</summary><div>{model.saved.slice(-30).map((entry, i) => <code key={i}>{entry.name}[{entry.keyType === 'tuple' ? entry.key : formatTraceValue(entry.key)}] = {formatTraceValue(entry.value)}</code>)}</div>{model.saved.length > 30 && <p className="rd-note">Last 30 saved entries shown. Current containers remain in Variables.</p>}</details>}
      <details><summary>Call parameters and current stack</summary><CallStackViz frames={model.frames} event={currentSnapshot?.event} /></details>
    </>}
    {table && <>
      <div className="rd-heading"><b>{table.name} · table</b><span>Index above · value below</span></div>
      <div className="rd-table">{table.values.slice(start, start + 24).map((value, offset) => {
        const index = start + offset;
        const cls = index === target ? (effect?.kind === 'table-write' ? 'written' : 'target') : effect?.reads?.includes(index) ? 'read' : '';
        return <button key={index} className={'rd-cell ' + cls} aria-label={`${table.name}[${index}] = ${formatTraceValue(value)}`} onClick={() => setInspect(index)}><small>{index}</small><b>{formatTraceValue(value)}</b></button>;
      })}</div>
      <p className="rd-note">{inspect !== null && inspect < table.values.length ? `${table.name}[${inspect}] = ${formatTraceValue(table.values[inspect])}` : 'Select an entry to inspect. Zero and None are actual stored values.'}</p>
      {table.values.length > 24 && <label className="rd-note">Inspect index <input type="number" min={0} max={table.values.length - 1} value={inspect ?? 0} onChange={e => setInspect(Math.max(0, Math.min(table.values.length - 1, Number(e.target.value))))} /> · {start}–{Math.min(start + 23, table.values.length - 1)} of {table.values.length} entries</label>}
      {effect?.operands && <div className="rd-equation"><strong>{effect.operands.join(' + ')} = {effect.kind === 'table-write' ? formatTraceValue(effect.value) : '?'}</strong><p>{effect.reads?.map(i => `${table.name}[${i}]`).join(' + ')} → {table.name}[{target}]</p></div>}
      <p className="rd-note">Cyan: inputs · dashed amber: destination before write · green: written</p>
      {table.history.length > 0 && <details open className="rd-saved"><summary>Recent completed writes</summary><div>{table.history.map((e, i) => <code key={i}>{table.name}[{e.key}] = {e.operands?.join(' + ')} = {formatTraceValue(e.value)}</code>)}</div></details>}
    </>}
    <nav className="rd-heading" aria-label="Recursion and table events"><button disabled={previous === undefined} onClick={() => jump(previous)}>← Previous event</button><button disabled={next === undefined} onClick={() => jump(next)}>Next event →</button></nav>
  </section>;
}
