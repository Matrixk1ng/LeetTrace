import { useState } from 'react';
import { useTrace } from '../../store/useTrace';
import type { PairObservation } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';
import './two-pointer.css';

export default function TwoPointerViz({ observation: p }: { observation: PairObservation }) {
  const { state, currentSnapshot, dispatch } = useTrace();
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const values = currentSnapshot?.variables[p.structure]?.value;
  if (!Array.isArray(values)) return null;
  const related = state.snapshots.flatMap((s, step) => {
    const q = s.visual?.pair;
    return q && s.frameId === currentSnapshot?.frameId && q.identity === p.identity && q.names.join(',') === p.names.join(',') ? [{ ...q, step }] : [];
  });
  const prefix = related.filter(q => q.step <= state.currentStep);
  const comparisons = prefix.filter(q => q.kind === 'compare');
  const move = prefix.findLast(q => q.kind === 'move');
  const steps = related.filter(q => q.kind !== 'state').map(q => q.step);
  const previous = steps.filter(i => i < state.currentStep).at(-1), next = steps.find(i => i > state.currentStep);
  const jump = (i: number | undefined) => { if (i !== undefined) { dispatch({ type: 'PAUSE' }); dispatch({ type: 'SET_STEP', payload: i }); } };
  const start = Math.max(0, Math.min(page ?? Math.min(...p.indices), Math.max(0, values.length - 12)));
  const visible = values.slice(start, start + 12);
  const c = p.comparison;
  const changed = p.previous ? p.names.flatMap((name, i) => p.indices[i] !== p.previous![i] ? [`${name}: ${p.previous![i]} → ${p.indices[i]}`] : []) : [];
  const expression = p.kind === 'read' ? `${p.values?.join(' + ')} = ?` : c ? `${c.sum} ${c.operator} ${c.target} · ${c.outcome ? 'True' : 'False'}` : p.pair ? `${p.pair.values.join(' + ')} = ${p.pair.sum}` : 'No new comparison';
  const heading = p.kind === 'read' ? 'Read the next pair' : p.kind === 'sum' ? 'The pair sum was computed' : p.kind === 'compare' ? 'Comparison evaluated' : p.kind === 'move' ? 'Pointer update completed' : currentSnapshot?.event === 'return' ? `Returned ${formatTraceValue(currentSnapshot.variables.return?.value)}` : p.indices[0] === p.indices[1] ? 'Both pointers are at the same index' : 'Follow the current pointers';
  return <section className="two-pointer">
    <h2>Compare values. Follow the pointers.</h2>
    <div className="tp-action" aria-live="polite"><strong>{heading}</strong><p>{changed.length ? changed.join(' · ') : p.kind === 'compare' ? 'The recorded branch establishes this outcome.' : `Line ${currentSnapshot?.line} · ${p.kind === 'read' ? 'before the pair is added' : 'actual values from this trace step'}`}</p></div>
    <div className="tp-hero"><div className="tp-heading"><b>{p.structure} · array</b><span>Index above · value below</span></div>
      {values.length > 12 && <div className="tp-navigation"><button disabled={start === 0} onClick={() => setPage(Math.max(0, start - 12))}>← Earlier</button><span>{start}–{start + visible.length - 1} / {values.length}</span><button disabled={start + 12 >= values.length} onClick={() => setPage(start + 12)}>Later →</button></div>}
      <div className="tp-array" style={{ gridTemplateColumns: `repeat(${Math.min(6, visible.length)}, minmax(0, 1fr))` }}>
        {visible.map((value, offset) => { const index = start + offset; const pointers = p.names.filter((_, i) => p.indices[i] === index); return <div className="tp-slot" key={index}><small>{index}</small><button className={'tp-cell' + (p.indices[0] === index ? ' first' : '') + (p.indices[1] === index ? ' second' : '')} aria-label={`${p.structure}[${index}] = ${formatTraceValue(value)}${pointers.length ? ', ' + pointers.join(' and ') : ''}`} onClick={() => setSelected(index)}>{formatTraceValue(value)}</button><div className="tp-labels">{p.names.map((name, i) => p.indices[i] === index ? <span className={i ? 'tp-second' : 'tp-first'} key={name}>↑ {name}</span> : null)}</div></div>; })}
      </div>
      <div className="tp-bindings">{p.names.map((name, i) => <button key={name} className={i ? 'tp-second' : 'tp-first'} onClick={() => setPage(Math.max(0, p.indices[i] - 3))}>{name} = {p.indices[i]}{p.indices[i] < 0 || p.indices[i] >= values.length ? ' · outside array' : ''}</button>)}</div>
      <p className="tp-note">{selected !== null && selected < values.length ? `${p.structure}[${selected}] = ${formatTraceValue(values[selected])}` : 'Select a cell to inspect. Pointer buttons jump to their indices.'}</p>
    </div>
    <div className="tp-equation"><small>{p.kind === 'move' || p.kind === 'state' ? 'Last computed pair · may precede the current pointer positions' : p.kind === 'read' ? 'Upcoming pair' : 'Recorded operation'}</small><strong>{expression}</strong>{p.pair && <p>{p.pair.indices.map(i => `${p.structure}[${i}]`).join(' + ')}</p>}</div>
    {move?.previous && <p className="tp-note">Last move: {move.names.map((name, i) => `${name}: ${move.previous![i]} → ${move.indices[i]}`).join(' · ')}</p>}
    <div className="tp-heading"><b>Comparisons so far</b><span>Select to revisit</span></div>
    <div className="tp-history">{comparisons.slice(-30).map(q => <button key={q.step} onClick={() => jump(q.step)}><code>[{q.comparison?.indices.join(', ')}] · {q.comparison?.sum} {q.comparison?.operator} {q.comparison?.target}</code><span>{q.comparison?.outcome ? 'True' : 'False'}</span></button>)}{!comparisons.length && <p className="tp-note">No comparison outcome recorded yet.</p>}</div>
    {comparisons.length > 30 && <p className="tp-note">Last 30 comparisons shown; exact stepping retains earlier events.</p>}
    <nav className="tp-navigation" aria-label="Two-pointer events"><button disabled={previous === undefined} onClick={() => jump(previous)}>← Previous event</button><button disabled={next === undefined} onClick={() => jump(next)}>Next event →</button></nav>
  </section>;
}
