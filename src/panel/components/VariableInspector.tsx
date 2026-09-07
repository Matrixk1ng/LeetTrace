import { formatTraceValue, visibleVariables } from '../../shared/display';
import { useTrace } from '../store/useTrace';

export default function VariableInspector() {
  const { currentSnapshot } = useTrace();
  if (!currentSnapshot) return null;
  const variables = visibleVariables(currentSnapshot).filter(([name]) => name !== 'return');
  const structures = currentSnapshot.dataStructures;
  const structureFor = (name: string) => structures.find(ds => ds.id === name ||
    ds.nodePointers?.some(p => p.name === name));

  return (
    <section className="rounded-2xl border border-trace-border bg-trace-bg-card/70 p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Local values</h2>
        <span className="text-xs text-trace-text-secondary">● Amber = changed in this call</span>
      </div>
      {variables.length === 0 ? <p className="text-sm text-trace-text-secondary">No local values at this step.</p> : (
        <dl className="flex flex-col divide-y divide-trace-border">
          {variables.map(([name, variable]) => {
            const ds = structureFor(name);
            return <div key={name} className="py-2 min-w-0">
              <dt className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-mono font-medium break-all">{name}</span>
                <span className="text-xs text-trace-text-muted">{variable.type}</span>
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
      <p className="mt-3 text-xs text-trace-text-muted">Values belong to the current function call. Function objects and the Solution instance are hidden.</p>
    </section>
  );
}