import { formatTraceValue, visibleVariables } from '../../shared/display';
import { useTrace } from '../store/useTrace';

export default function VariableInspector() {
  const { currentSnapshot } = useTrace();
  if (!currentSnapshot) return null;
  const allVariables = visibleVariables(currentSnapshot).filter(([name]) => name !== 'return');
  const active = new Set(currentSnapshot.visual?.names ?? []);
  const ranked = [...allVariables].sort((a,b) => Number(active.has(b[0])) - Number(active.has(a[0])) || Number(b[1].changed) - Number(a[1].changed));
  const variables = currentSnapshot.visual ? ranked.filter(([name,v]) => active.has(name) || v.changed).slice(0,6) : allVariables;
  const selected = new Set(variables.map(([name]) => name));
  const others = allVariables.filter(([name]) => !selected.has(name));
  const structures = currentSnapshot.dataStructures;
  const structureFor = (name: string) => structures.find(ds => ds.id === name ||
    ds.nodePointers?.some(p => p.name === name));

  return (
    <section className="rounded-2xl border border-trace-border bg-trace-bg-card/70 p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">{currentSnapshot.visual ? 'Relevant now' : 'Local values'}</h2>
        <span className="text-xs text-trace-text-secondary">● Amber = changed in this call</span>
      </div>
      {variables.length === 0 ? <p className="text-sm text-trace-text-secondary">No local values at this step.</p> : (
        <dl className="flex flex-col divide-y divide-trace-border">
          {variables.map(([name, variable]) => {
            const ds = structureFor(name);
            return <div key={name} className="py-2 min-w-0">
              <dt className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-mono font-medium break-all">{name}</span>
                <span className="text-xs text-trace-text-muted">{currentSnapshot.visual ? active.has(name) ? 'Referenced' : 'Changed' : variable.type}</span>
              </dt>
              <dd className={'mt-1 text-sm font-mono whitespace-pre-wrap break-all ' +
                (variable.changed ? 'text-amber-300' : 'text-trace-text-secondary')}>
                {formatTraceValue(variable.value, variable.type)}
              </dd>
              {ds ? <a className="inline-block mt-1 text-xs text-trace-accent underline"
                href={'#structure-' + encodeURIComponent(ds.id)}>View {ds.id} diagram{ds.id !== name ? ' · node reference' : ''}</a> : null}
            </div>;
          })}
        </dl>
      )}
      {currentSnapshot.visual && <details className="mt-3 border-t border-trace-border pt-3"><summary className="cursor-pointer text-xs text-trace-text-secondary">Other locals · {others.length} values</summary>
        <dl className="mt-2 space-y-2">{others.map(([name,v]) => <div key={name}><dt className="font-mono text-xs">{name}</dt><dd className="break-all font-mono text-xs text-trace-text-muted">{formatTraceValue(v.value,v.type)}</dd></div>)}</dl>
      </details>}
      <p className="mt-3 text-xs text-trace-text-muted">Values belong to the current function call. Function objects and the Solution instance are hidden.</p>
    </section>
  );
}