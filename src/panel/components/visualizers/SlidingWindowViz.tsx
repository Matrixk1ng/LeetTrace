import { useState } from 'react';
import { useTrace } from '../../store/useTrace';
import type { WindowObservation } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';
import './two-pointer.css';
import './sliding-window.css';

export default function SlidingWindowViz({ observation: w }: { observation: WindowObservation }) {
  const { state, currentSnapshot, dispatch } = useTrace();
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const values = currentSnapshot?.variables[w.structure]?.value;
  if (!Array.isArray(values)) return null;
  const variable = w.mode === 'variable';
  const condition = w.condition;
  const related = state.snapshots.flatMap((s, step) => {
    const x = s.visual?.window;
    return x && s.frameId === currentSnapshot?.frameId && x.identity === w.identity && x.aggregate === w.aggregate ? [{ ...x, step }] : [];
  });
  const history = related.filter(x => x.step <= state.currentStep && (variable ? x.kind === 'condition' && x.condition?.outcome === true : x.kind === 'save' || x.kind === 'check'));
  const steps = related.filter(x => x.kind !== 'state').map(x => x.step);
  const previous = steps.filter(i => i < state.currentStep).at(-1), next = steps.find(i => i > state.currentStep);
  const jump = (step: number | undefined) => { if (step !== undefined) { dispatch({ type: 'PAUSE' }); dispatch({ type: 'SET_STEP', payload: step }); } };
  const start = Math.max(0, Math.min(page ?? Math.max(0, (w.indices[0] ?? 0) - 1), Math.max(0, values.length - 12)));
  const visible = values.slice(start, start + 12);
  const range = (indices: number[]) => indices.length ? `${indices[0]}–${indices.at(-1)}` : 'none';
  const arithmetic = w.kind === 'add' || w.kind === 'remove';
  const title = w.kind === 'add' ? `Include ${w.value} at index ${w.index}` : w.kind === 'remove' ? `Remove ${w.value} at index ${w.index}` : w.kind === 'save' ? `Save a ${variable ? 'shorter answer' : 'new best'} · ${w.best?.value}${variable ? ' values' : ''}` : w.kind === 'check' ? (variable ? 'Window length compared with the saved answer' : 'Full-window result checked') : w.kind === 'condition' ? (condition?.outcome ? 'Target reached · window qualifies' : 'Below target · condition is false') : currentSnapshot?.event === 'return' ? `Returned ${formatTraceValue(currentSnapshot.variables.return?.value)}` : 'Follow the included values';
  return <section className="two-pointer sliding-window">
    <h2>{variable ? 'Grow to qualify. Shrink to improve.' : 'Keep the window. Update its total.'}</h2>
    <div className="tp-action" aria-live="polite"><strong>{title}</strong><p>{arithmetic ? 'The accumulator update completed. Pointer variables may advance on a separate line.' : w.kind === 'save' || w.kind === 'check' ? `The best-result assignment completed for this ${variable ? 'qualifying' : 'full'} window.` : `Line ${currentSnapshot?.line} · ${w.indices.length} values currently contribute to ${w.aggregate}.`}</p></div>
    <div className="tp-hero"><div className="tp-heading"><b>{w.structure} · array</b><span>{w.indices.length}{variable ? '' : ` / ${w.width}`} values</span></div>
      {values.length > 12 && <div className="tp-navigation"><button disabled={start === 0} onClick={() => setPage(Math.max(0, start - 12))}>← Earlier</button><span>Indices {start}–{start + visible.length - 1}</span><button disabled={start + 12 >= values.length} onClick={() => setPage(start + 12)}>Later →</button></div>}
      <div className="tp-array" style={{ gridTemplateColumns: `repeat(${Math.min(6, visible.length)}, minmax(0, 1fr))` }}>{visible.map((value, offset) => {
        const index = start + offset, included = w.indices.includes(index);
        return <div key={index} className={'tp-slot' + (included ? ' sw-included' : '')}><small>{index}</small><button className={'tp-cell' + (included ? ' inside' : '') + (w.kind === 'remove' && w.index === index ? ' removed' : '')} aria-label={`${w.structure}[${index}] = ${formatTraceValue(value)}${included ? ', included in total' : ''}`} onClick={() => setSelected(index)}>{formatTraceValue(value)}</button></div>;
      })}</div>
      <p className="sw-band">Included indices: {range(w.indices)} · {variable ? `${w.indices.length} values in the current window` : w.indices.length === w.width ? 'full window' : w.indices.length < w.width ? 'partial window' : 'oversized · removal pending'}</p>
      {values.length > 12 && <div className="tp-bindings">{w.indices.length > 0 && <><button onClick={() => setPage(Math.max(0, w.indices[0] - 1))}>Window start</button><button onClick={() => setPage(Math.max(0, w.indices.at(-1)! - 10))}>Window end</button></>}</div>}
      {w.indices.some(i => i < start || i >= start + 12) && <p className="tp-note">Part of the window is outside this page. Use the boundary buttons to inspect it.</p>}
      <p className="tp-note">{selected !== null && selected < values.length ? `${w.structure}[${selected}] = ${formatTraceValue(values[selected])}` : 'Cyan: included in total · dashed violet: just removed'}</p>
    </div>
    {variable && condition && <div className={'sw-condition ' + (condition.outcome === undefined ? '' : condition.outcome ? 'valid' : 'invalid')}><small>Condition · {w.aggregate} ≥ target</small><strong>{condition.total} ≥ {condition.target} · {condition.outcome === undefined ? 'awaiting check' : condition.outcome ? 'True' : 'False'}</strong><p>{condition.outcome === undefined ? 'The included values changed, or the condition is about to run. No outcome is assumed.' : condition.outcome ? 'This window qualifies. It may still be longer than the saved answer.' : 'This window does not meet the target.'}</p></div>}
    <div className="sw-stats"><div><small>{variable ? 'Current window length' : `Current total · ${w.aggregate}`}</small><strong>{variable ? `${w.indices.length} values` : w.total}</strong><p>{variable ? `Sum ${w.total} · indices ${range(w.indices)}` : w.indices.length <= 8 ? w.indices.map(i => `(${values[i]})`).join(' + ') || 'Empty window' : `${w.indices.length} included values`}</p></div><div className="sw-best"><small>{variable ? 'Shortest saved window' : 'Best full window recorded'}</small><strong>{w.best ? `${w.best.value}${variable ? ' values' : ''}` : '—'}</strong><p>{w.best ? `${w.best.name} · indices ${range(w.best.indices)}` : 'No improved result recorded yet'}</p></div></div>
    {arithmetic && <div className="tp-equation"><small>Running-total update</small><strong>{w.before} {w.kind === 'add' ? '+' : '−'} ({w.value}) = {w.total}</strong><p>{w.structure}[{w.index}] {w.kind === 'add' ? 'included' : 'removed'}</p></div>}
    <div className="tp-heading"><b>{variable ? 'Valid windows checked' : 'Full windows checked'}</b><span>Select to revisit</span></div>
    <div className="tp-history">{history.slice(-30).map(x => <button key={x.step} onClick={() => jump(x.step)}><code>Indices {range(x.indices)}</code><span>{variable ? `${x.indices.length} values · ` : ''}total {x.total}{x.kind === 'save' ? ' · saved' : ''}</span></button>)}{!history.length && <p className="tp-note">No {variable ? 'valid windows' : 'completed full-window result checks'} recorded yet.</p>}</div>
    {history.length > 30 && <p className="tp-note">Last 30 checks shown; exact stepping retains the full trace.</p>}
    <nav className="tp-navigation" aria-label="Sliding-window events"><button disabled={previous === undefined} onClick={() => jump(previous)}>← Previous event</button><button disabled={next === undefined} onClick={() => jump(next)}>Next event →</button></nav>
  </section>;
}
