import { useTrace } from '../store/useTrace';
import { formatTraceValue } from '../../shared/display';
import './visualizers/batch.css';
import SearchBounds from './SearchBounds';

export default function OperationDetails() {
  const { state, currentSnapshot, dispatch } = useTrace();
  const operation = currentSnapshot?.visual?.operation;
  if (!operation) return null;
  const { completed, upcoming } = operation;
  const changes = completed?.names.filter(name => name in (completed.after ?? {}) && JSON.stringify(completed.before[name]) !== JSON.stringify(completed.after?.[name])) ?? [];
  const history = state.snapshots.slice(0, state.currentStep + 1).flatMap((s, i) => s.frameId === currentSnapshot?.frameId && s.visual?.operation?.completed ? [{ ...s.visual.operation.completed, step: i }] : []);
  const text = (v: unknown) => v === undefined ? 'not assigned' : formatTraceValue(v);
  const writes = completed?.accesses.filter(a=>a.write) ?? [];
  const collectionCall = completed?.source.match(/^(?:[A-Za-z_]\w*\s*=\s*)?([A-Za-z_]\w*)\.(append|appendleft|extend|pop|popleft|remove|discard|clear)\(/);
  const collectionChanged = !!collectionCall && changes.includes(collectionCall[1]) && Array.isArray(completed?.before[collectionCall[1]]);
  const title = completed?.outcome !== undefined ? `Condition → ${completed.outcome ? 'True' : 'False'}` : completed?.kind === 'Return' ? 'Return recorded' : writes.length ? 'Assignment completed' : collectionChanged && ['append','appendleft','extend'].includes(collectionCall![2]) ? 'Collection updated · added values' : collectionChanged && ['pop','popleft','remove','discard','clear'].includes(collectionCall![2]) ? 'Collection updated · removed values' : changes.length ? 'State updated' : 'Step completed';
  return <section className="batch-operation">
    <SearchBounds />
    {completed && <><div className="batch-action"><strong>{title}</strong><code>{completed.source}</code><small>Line {completed.line} · {completed.outcome !== undefined ? 'outcome established by control flow' : 'compared before and after this statement'}</small></div>
      {!!changes.length && <details><summary>Changed values ({changes.length})</summary>{changes.map(name => <p key={name}><b>{name}</b>: {text(completed.before[name])} → {text(completed.after?.[name])}</p>)}</details>}
      {!!completed.operands.length && <details><summary>Inputs available before this operation</summary>{completed.operands.map((operand,i)=><p key={i}>{operand.expression} = {text(operand.value)}</p>)}<small>These are captured values, not a claim that every short-circuit operand was evaluated.</small></details>}
      {!!completed.cache?.length && <div className="batch-cache">{completed.cache.map(c => <p key={c.name}>{c.name}: {c.hits} cache hits · {c.misses} misses during this statement. Hits do not enter the function body.</p>)}</div>}
    </>}
    {upcoming && <details><summary>Next statement · line {upcoming.line}</summary><code>{upcoming.source}</code>{upcoming.operands.map((r,i) => <p key={i}>{r.expression} = {text(r.value)}</p>)}{!!upcoming.operands.length && <small>Available values before execution; short-circuit expressions may not read every operand.</small>}</details>}
    {!!history.length && <details><summary>Operation history · {history.length} reached</summary><div className="batch-history">{history.slice(-40).map(h => <button key={h.step} onClick={() => { dispatch({ type: 'PAUSE' }); dispatch({ type: 'SET_STEP', payload: h.step }); }}>Line {h.line} · {h.source}{h.outcome !== undefined ? ` → ${h.outcome ? 'True' : 'False'}` : ''}</button>)}</div></details>}
  </section>;
}
