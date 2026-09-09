import { useTrace } from '../store/useTrace';

export default function SearchBounds() {
  const { currentSnapshot, state } = useTrace();
  if (currentSnapshot?.visual?.binary) return null;
  const roles = currentSnapshot?.visual?.operation?.roles ?? {};
  const lower = Object.keys(roles).find(k => roles[k] === 'lower-bound');
  const upper = Object.keys(roles).find(k => roles[k] === 'upper-bound' || roles[k] === 'exclusive-upper-bound');
  const mid = Object.keys(roles).find(k => roles[k] === 'midpoint');
  if (!lower || !upper || !mid || !currentSnapshot) return null;
  const lo = currentSnapshot.variables[lower]?.value, hi = currentSnapshot.variables[upper]?.value;
  const midpoint = currentSnapshot.variables[mid]?.value;
  if (typeof lo !== 'number' || typeof hi !== 'number') return null;
  const lastCalculation = state.snapshots.slice(0,state.currentStep+1).findLast(s => s.frameId === currentSnapshot.frameId && s.visual?.operation?.completed?.source.startsWith(mid+' ='))?.visual?.operation?.completed;
  const computed = lastCalculation?.after?.[lower] === lo && lastCalculation?.after?.[upper] === hi;
  const guard = state.snapshots.slice(0,state.currentStep+1).findLast(s=>s.frameId===currentSnapshot.frameId && s.visual?.operation?.upcoming?.kind==='While' && s.visual.operation.upcoming.names.includes(lower) && s.visual.operation.upcoming.names.includes(upper))?.visual?.operation?.upcoming?.source;
  return <section className="batch-operation batch-cache"><strong>Search bounds</strong><p>{lower} = {lo} · {upper} = {hi}</p><p>{computed?'Computed':'Stored'} {mid} = {typeof midpoint === 'number' ? midpoint : 'not assigned'}</p>{guard && <code>{guard}</code>}<p className="batch-note">Bounds are variable values. The loop guard states which endpoint comparison applies; an old midpoint is not a new calculation.</p></section>;
}
