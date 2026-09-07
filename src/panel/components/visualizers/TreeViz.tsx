import type { DataStructureState, NodePointer } from '../../../shared/types';
import { formatValue, truncate } from './format';

interface TreeVizProps {
  dataStructure: DataStructureState;
}

interface SerializedNode {
  id?: string;
  val: unknown;
  left: SerializedNode | null;
  right: SerializedNode | null;
}

interface Placed {
  /** Pre-order position — the index NodePointer.nodeIndex refers to. */
  order: number;
  x: number;
  y: number;
  label: string;
  parent: Placed | null;
}

const RADIUS = 14;
const X_GAP = 34;
const Y_GAP = 46;
const PADDING = 16;

/**
 * Lay the tree out top-down.
 *
 * x comes from an in-order walk and y from depth, which is the standard way to
 * keep subtrees from overlapping without a full tree-layout algorithm. The
 * *pre-order* counter is tracked separately because that's the order node ids
 * are serialized in, and therefore what `nodePointers` index into.
 */
function layout(root: SerializedNode | null): Placed[] {
  const placed: Placed[] = [];
  let column = 0;
  let order = 0;

  const walk = (node: SerializedNode | null, depth: number, parent: Placed | null): void => {
    if (!node) return;

    const entry: Placed = {
      order: order++,
      x: 0,
      y: depth,
      label: formatValue(node.val),
      parent,
    };
    placed.push(entry);

    walk(node.left, depth + 1, entry);
    entry.x = column++;
    walk(node.right, depth + 1, entry);
  };

  walk(root, 0, null);
  return placed;
}

export default function TreeViz({ dataStructure }: TreeVizProps) {
  const root = (dataStructure.data as { root?: SerializedNode | null })?.root ?? null;
  const nodes = layout(root);

  if (nodes.length === 0) {
    return <div className="font-mono text-sm text-trace-text-muted">None</div>;
  }

  const cursorsByOrder = new Map<number, NodePointer[]>();
  for (const pointer of dataStructure.nodePointers ?? []) {
    const list = cursorsByOrder.get(pointer.nodeIndex) ?? [];
    list.push(pointer);
    cursorsByOrder.set(pointer.nodeIndex, list);
  }

  const columns = Math.max(...nodes.map((n) => n.x)) + 1;
  const depth = Math.max(...nodes.map((n) => n.y)) + 1;
  const width = columns * X_GAP + PADDING * 2;
  const height = depth * Y_GAP + PADDING * 2;

  const cx = (node: Placed) => PADDING + node.x * X_GAP + X_GAP / 2;
  const cy = (node: Placed) => PADDING + node.y * Y_GAP + RADIUS;

  return (
    <div className="overflow-x-auto pb-1">
      <svg width={width} height={height} role="img" aria-label={`tree with ${nodes.length} nodes`}>
        {/* Edges first, so the circles sit on top of them. */}
        {nodes.map((node) =>
          node.parent ? (
            <line
              key={`edge-${node.order}`}
              x1={cx(node.parent)}
              y1={cy(node.parent) + RADIUS}
              x2={cx(node)}
              y2={cy(node) - RADIUS}
              stroke="#2d3a5c"
              strokeWidth={1.5}
            />
          ) : null,
        )}

        {nodes.map((node) => {
          const cursors = cursorsByOrder.get(node.order) ?? [];
          const accent = cursors[0]?.color;

          return (
            <g key={`node-${node.order}`}>
              <circle
                cx={cx(node)}
                cy={cy(node)}
                r={RADIUS}
                fill={accent ? 'rgba(167, 139, 250, 0.18)' : '#16213e'}
                stroke={accent ?? '#2d3a5c'}
                strokeWidth={1.5}
              />
              <text
                x={cx(node)}
                y={cy(node) + 4}
                textAnchor="middle"
                fill="#e6e6e6"
                style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
              >
                {truncate(node.label, 4)}
              </text>
              <title>{node.label}</title>

              {cursors.map((cursor, stackIndex) => (
                <text
                  key={cursor.name}
                  x={cx(node)}
                  y={cy(node) - RADIUS - 4 - stackIndex * 11}
                  textAnchor="middle"
                  fill={cursor.color}
                  style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                >
                  {cursor.name}
                </text>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="text-trace-text-muted" style={{ fontSize: 10 }}>
        {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} · depth {depth}
      </div>
    </div>
  );
}
