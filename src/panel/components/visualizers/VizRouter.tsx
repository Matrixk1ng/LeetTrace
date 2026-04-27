import type { DataStructureState } from '../../../shared/types';
import { useTrace } from '../../store/TraceContext';
import ArrayViz from './ArrayViz';
import HashMapViz from './HashMapViz';

function findPrevious(
  snapshots: ReturnType<typeof useTrace>['state']['snapshots'],
  currentStep: number,
  id: string,
): DataStructureState | null {
  if (currentStep <= 0) return null;
  const prev = snapshots[currentStep - 1];
  if (!prev) return null;
  return prev.dataStructures.find((ds) => ds.id === id) ?? null;
}

export default function VizRouter() {
  const { currentSnapshot, state } = useTrace();

  if (!currentSnapshot) return null;
  const { dataStructures, highlights } = currentSnapshot;
  if (dataStructures.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {dataStructures.map((ds) => {
        const previous = findPrevious(state.snapshots, state.currentStep, ds.id);
        return (
          <section
            key={ds.id}
            className="rounded-[10px] border border-trace-border bg-trace-bg-card"
            style={{ padding: 14 }}
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-trace-text-muted">
              {ds.id} — {ds.type}
            </div>
            {ds.type === 'array' ? (
              <ArrayViz dataStructure={ds} highlights={highlights} />
            ) : ds.type === 'hashmap' ? (
              <HashMapViz dataStructure={ds} previousDataStructure={previous} />
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-trace-text-secondary">
                {JSON.stringify(ds.data, null, 2)}
              </pre>
            )}
          </section>
        );
      })}
    </div>
  );
}
