import type { DataStructureState, NodePointer } from '../../../shared/types';
import { IDLE_BG, IDLE_BORDER, formatValue, truncate } from './format';

interface LinkedListVizProps {
  dataStructure: DataStructureState;
}

interface LinkedListData {
  nodes: unknown[];
  nodeIds?: string[];
  has_cycle?: boolean;
  cycleIndex?: number;
}

const NODE_WIDTH = 46;
const NODE_HEIGHT = 34;
const ARROW = 18;
const SLOT = NODE_WIDTH + ARROW;
const MAX_NODES = 40;

/**
 * A linked list as a chain of nodes with the cursors sitting on them.
 *
 * The cursors are the point: `slow`, `fast` and `curr` each serialize as a
 * whole list of their own, and M3 folds them into `nodePointers` on the list
 * they walk — so this renders one chain with labelled positions rather than
 * three overlapping copies of the same nodes.
 */
export default function LinkedListViz({ dataStructure }: LinkedListVizProps) {
  const data = (dataStructure.data ?? {}) as LinkedListData;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];

  if (nodes.length === 0) {
    return <div className="font-mono text-sm text-trace-text-muted">None</div>;
  }

  const hasCycle = data.has_cycle === true;
  const cycleIndex = typeof data.cycleIndex === 'number' ? data.cycleIndex : -1;

  const visible = nodes.slice(0, MAX_NODES);
  const hidden = nodes.length - visible.length;

  const cursorsByNode = new Map<number, NodePointer[]>();
  for (const pointer of dataStructure.nodePointers ?? []) {
    const list = cursorsByNode.get(pointer.nodeIndex) ?? [];
    list.push(pointer);
    cursorsByNode.set(pointer.nodeIndex, list);
  }

  const maxCursors = Math.max(0, ...Array.from(cursorsByNode.values(), (list) => list.length));
  const width = visible.length * SLOT;

  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ width: Math.max(width, 1) }}>
        {/* Cursors, stacked when several land on the same node */}
        {maxCursors > 0 ? (
          <div className="relative" style={{ height: maxCursors * 13 + 4 }}>
            {Array.from(cursorsByNode.entries()).map(([index, cursors]) => {
              if (index < 0 || index >= visible.length) return null;
              return (
                <div
                  key={index}
                  className="absolute flex flex-col items-center"
                  style={{ left: index * SLOT, width: NODE_WIDTH }}
                >
                  {cursors.map((cursor) => (
                    <span
                      key={cursor.name}
                      className="font-mono leading-tight"
                      style={{ color: cursor.color, fontSize: 10 }}
                    >
                      {cursor.name}
                    </span>
                  ))}
                  <span className="leading-none" style={{ color: cursors[0].color, fontSize: 9 }}>
                    ▼
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* The chain */}
        <div className="flex items-center">
          {visible.map((value, index) => {
            const cursors = cursorsByNode.get(index) ?? [];
            const isCycleTarget = hasCycle && index === cycleIndex;
            const text = formatValue(value);

            return (
              <div key={index} className="flex items-center">
                <div
                  className="flex items-center justify-center font-mono text-trace-text-primary"
                  style={{
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                    borderRadius: 6,
                    border: `1.5px solid ${
                      cursors[0]?.color ?? (isCycleTarget ? '#f59e0b' : IDLE_BORDER)
                    }`,
                    background: IDLE_BG,
                    fontSize: 12,
                    transition: 'border-color 0.25s ease',
                  }}
                  title={text}
                >
                  {truncate(text, 5)}
                </div>

                {index < visible.length - 1 ? (
                  <span
                    className="text-center text-trace-text-muted"
                    style={{ width: ARROW, fontSize: 11 }}
                  >
                    →
                  </span>
                ) : null}
              </div>
            );
          })}

          {/* Tail marker: a cycle loops back, otherwise the list ends. */}
          {hidden === 0 ? (
            <span
              className="pl-1 font-mono"
              style={{ fontSize: 11, color: hasCycle ? '#f59e0b' : '#64748b' }}
            >
              {hasCycle ? '↩' : '→ None'}
            </span>
          ) : (
            <span className="pl-2 text-xs text-trace-text-muted">+{hidden} more</span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2" style={{ fontSize: 10 }}>
          <span className="text-trace-text-muted">
            {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
          </span>
          {hasCycle ? (
            <span style={{ color: '#f59e0b' }}>
              cycle — tail links back to index {cycleIndex}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
