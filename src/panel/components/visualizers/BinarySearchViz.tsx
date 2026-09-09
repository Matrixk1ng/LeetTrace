import { useState } from 'react';
import { useTrace } from '../../store/useTrace';
import type { BinaryObservation } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';
import './two-pointer.css';
import './binary-search.css';

export default function BinarySearchViz({ observation: p }: { observation: BinaryObservation }) {
  const { state, currentSnapshot, dispatch } = useTrace();
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const values = currentSnapshot?.variables[p.structure]?.value;
  if (!Array.isArray(values)) return null;
  const related = state.snapshots.flatMap((s, step) => {
    const q = s.visual?.binary;
    return q && s.frameId === currentSnapshot?.frameId && q.identity === p.identity && q.lowName === p.lowName && q.highName === p.highName && q.midName === p.midName ? [{ ...q, step }] : [];
  });
  const history = related.filter(q => q.step <= state.currentStep && q.kind === 'compare');
  const events = related.filter(q => q.kind !== 'state').map(q => q.step);
  const jump = (step: number | undefined) => { if (step !== undefined) { dispatch({ type: 'PAUSE' }); dispatch({ type: 'SET_STEP', payload: step }); } };
  const empty = p.low > p.high;
  const start = Math.max(0, Math.min(page ?? p.low, Math.max(0, values.length - 12)));
  const visible = values.slice(start, start + 12);
  const c = p.comparison ?? p.lastComparison;
  const match = p.midCurrent && p.comparison?.operator === '==' && p.comparison.outcome && p.comparison.mid === p.mid;
  const heading = currentSnapshot?.event === 'return' ? `Returned ${formatTraceValue(currentSnapshot.variables.return?.value)}` : p.kind === 'move' ? 'Bounds updated' : p.kind === 'midpoint' ? 'Midpoint computed' : p.kind === 'compare' ? 'Comparison evaluated' : empty ? 'The candidate interval is empty' : 'Follow the candidate interval';
  return <section className="two-pointer binary-search">
    <h2>Narrow the interval. Check the midpoint.</h2>
    <div className="tp-action" aria-live="polite"><strong>{heading}</strong><p>{p.kind === 'move' ? `[${p.previous.join(', ')}] → [${p.low}, ${p.high}] · midpoint must be recomputed` : `Line ${currentSnapshot?.line} · observed trace values`}</p></div>
    <div className="tp-hero"><div className="tp-heading"><b>{p.structure} · sorted array</b><span>Index above · value below</span></div>
      {values.length > 12 && <nav className="tp-navigation" aria-label="Array pages"><button disabled={start === 0} onClick={() => setPage(Math.max(0, start - 12))}>← Earlier</button><span>{start}–{start + visible.length - 1}</span><button disabled={start + 12 >= values.length} onClick={() => setPage(start + 12)}>Later →</button></nav>}
      {!values.length && <p className="tp-note">Empty array · no values to inspect</p>}
      <div className="tp-array" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(7, visible.length))}, minmax(0, 1fr))` }}>
        {visible.map((value, offset) => { const i = start + offset; const active = !empty && i >= p.low && i <= p.high; const mid = active && p.midCurrent && i === p.mid; return <div className="tp-slot" key={i}><small>{i}</small><button className={`tp-cell ${active ? 'candidate' : 'outside'}${mid ? ' midpoint' : ''}${mid && match ? ' match' : ''}`} aria-label={`${p.structure}[${i}] = ${formatTraceValue(value)}${mid ? ', midpoint' : ''}`} onClick={() => setSelected(i)}>{formatTraceValue(value)}</button><div className="tp-labels">{i === p.low && <span className="tp-first">↑ {p.lowName}</span>}{mid && <span className="tp-second">↑ {p.midName}</span>}{i === p.high && <span className="tp-first">↑ {p.highName}</span>}</div></div>; })}
      </div>
      <div className="bs-band">{empty ? 'Empty interval · no candidates' : `Candidate interval [${p.low}, ${p.high}] · ${p.high - p.low + 1} values · inclusive`}</div>
      <div className="tp-bindings">{[[p.lowName, p.low], [p.highName, p.high]].map(([name, value]) => <button key={name} onClick={() => setPage(Math.max(0, Number(value) - 3))}>{name} = {value}</button>)}<span>{p.midCurrent ? p.midName : `Previous ${p.midName}`} = {p.mid ?? '—'}</span></div>
      <p className="tp-note">{selected !== null && selected < values.length ? `${p.structure}[${selected}] = ${formatTraceValue(values[selected])}` : 'Cyan: candidates · amber: current midpoint · green: equal comparison'}</p>
    </div>
    <div className="tp-equation"><small>{p.comparison ? 'Recorded comparison' : 'Previous comparison · may precede these bounds'}</small><strong>{c ? `${c.value} ${c.operator} ${c.target} · ${c.outcome ? 'True' : 'False'}` : 'No comparison recorded yet'}</strong>{c && <p>{p.structure}[{c.mid}] · bounds [{c.bounds.join(', ')}]</p>}</div>
    <div className="tp-heading"><b>Comparisons so far</b><span>Select to revisit</span></div>
    <div className="tp-history">{history.slice(-30).map(q => <button key={q.step} onClick={() => jump(q.step)}><code>[{q.comparison?.mid}] · {q.comparison?.value} {q.comparison?.operator} {q.comparison?.target}</code><span>{q.comparison?.outcome ? 'True' : 'False'}</span></button>)}{!history.length && <p className="tp-note">No comparison outcome recorded yet.</p>}</div>
    {history.length > 30 && <p className="tp-note">Last 30 comparisons shown.</p>}
    <nav className="tp-navigation" aria-label="Binary-search events"><button disabled={!events.some(i => i < state.currentStep)} onClick={() => jump(events.findLast(i => i < state.currentStep))}>← Previous event</button><button disabled={!events.some(i => i > state.currentStep)} onClick={() => jump(events.find(i => i > state.currentStep))}>Next event →</button></nav>
  </section>;
}
