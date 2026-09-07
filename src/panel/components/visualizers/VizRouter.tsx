import type { DataStructureState, Highlight } from '../../../shared/types';
import { useTrace } from '../../store/useTrace';
import ArrayViz from './ArrayViz';
import HashMapViz from './HashMapViz';
import MatrixViz from './MatrixViz';
import QueueViz from './QueueViz';
import SetViz from './SetViz';
import StackViz from './StackViz';

/**
 * Human labels for the card headers — `linked_list` shouldn't be what the user
 * reads.
 */
const KIND_LABELS: Record<DataStructureState['type'], string> = {
  array: 'array',
  string: 'string',
  matrix: 'matrix',
  hashmap: 'hash map',
  set: 'set',
  linked_list: 'linked list',
  tree: 'tree',
  stack: 'stack',
  queue: 'queue',
  heap: 'heap',
  graph: 'graph',
};

export default function VizRouter() {
  const { currentSnapshot, previousSnapshot } = useTrace();

  if (!currentSnapshot) return null;
  const { dataStructures, highlights } = currentSnapshot;
  if (dataStructures.length === 0) return null;

  // Diffing against the step we came *from* is what makes stepping backwards
  // report what actually changed (bug B17).
  const previousById = new Map(
    (previousSnapshot?.dataStructures ?? []).map((ds) => [ds.id, ds] as const),
  );

  return (
    <div className="flex flex-col gap-3">
      {dataStructures.map((ds) => {
        const previous = previousById.get(ds.id) ?? null;

        return (
          <section
            key={ds.id}
            className="rounded-[10px] border border-trace-border bg-trace-bg-card"
            style={{ padding: 14 }}
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-trace-text-muted">
              {ds.id} — {KIND_LABELS[ds.type] ?? ds.type}
            </div>
            <Viz dataStructure={ds} previous={previous} highlights={highlights} />
          </section>
        );
      })}
    </div>
  );
}

function Viz({
  dataStructure,
  previous,
  highlights,
}: {
  dataStructure: DataStructureState;
  previous: DataStructureState | null;
  highlights: Highlight[];
}) {
  switch (dataStructure.type) {
    // `string` renders as its characters — the builder only routes one here
    // when the code actually indexes it, so a bare `word` stays a variable.
    // `heap` is a list and reads fine as one until HeapViz lands in M8.
    case 'array':
    case 'string':
    case 'heap':
      return <ArrayViz dataStructure={dataStructure} highlights={highlights} />;

    case 'matrix':
      return <MatrixViz dataStructure={dataStructure} highlights={highlights} />;

    case 'hashmap':
      return <HashMapViz dataStructure={dataStructure} previousDataStructure={previous} />;

    case 'stack':
      return <StackViz dataStructure={dataStructure} previousDataStructure={previous} />;

    case 'queue':
      return <QueueViz dataStructure={dataStructure} previousDataStructure={previous} />;

    case 'set':
      return <SetViz dataStructure={dataStructure} previousDataStructure={previous} />;

    default:
      // linked_list and tree land here until M5; graph is the M8 stretch goal.
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-trace-text-secondary">
          {JSON.stringify(dataStructure.data, null, 2)}
        </pre>
      );
  }
}
