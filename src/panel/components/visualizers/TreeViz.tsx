import { useState, useId } from 'react';
import type { DataStructureState, NodePointer } from '../../../shared/types';
import { formatValue, truncate } from './format';

interface TreeVizProps {
  dataStructure: DataStructureState;
  onSelectStep?: (step: number) => void;
  previousDataStructure?: DataStructureState | null;
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
  id?: string;
  x: number;
  y: number;
  label: string;
  parent: Placed | null;
}

const RADIUS = 19;
const X_GAP = 50;
const Y_GAP = 64;
const PADDING = 34;

/**
 * Lay the tree out top-down.
 *
 * x comes from an in-order walk and y from depth, which is the standard way to
 * keep subtrees from overlapping without a full tree-layout algorithm. The
 * *pre-order* counter is tracked separately because that's the order node ids
 * are serialized in, and therefore what `nodePointers` index into.
 */
function layout(root: SerializedNode | null, maxDepth: number): Placed[] {
  const placed: Placed[] = [];
  let column = 0;
  let order = 0;

  const walk = (node: SerializedNode | null, depth: number, parent: Placed | null): void => {
    if (!node) return;

    const entry: Placed = {
      order: order++,
      id: node.id,
      x: 0,
      y: depth,
      label: formatValue(node.val),
      parent,
    };
    if (depth < maxDepth) placed.push(entry);

    walk(node.left, depth + 1, entry);
    if (depth < maxDepth) entry.x = column++;
    walk(node.right, depth + 1, entry);
  };

  walk(root, 0, null);
  return placed;
}

export default function TreeViz({ dataStructure, previousDataStructure, onSelectStep }: TreeVizProps) {
  const markerId = useId().replace(/:/g, '');
  const traversal = dataStructure.traversal;
  const [expanded, setExpanded] = useState(false);
  const root = (dataStructure.data as { root?: SerializedNode | null })?.root ?? null;
  const allNodes = layout(root, Infinity);
  const nodes = expanded ? allNodes : layout(root, 6);
  const previousRoot = (previousDataStructure?.data as { root?: SerializedNode | null } | undefined)?.root ?? null;
  const previousNodes = layout(previousRoot, Infinity);
  const previousCursorIds = new Set((previousDataStructure?.nodePointers ?? [])
    .map(p => previousNodes.find(n => n.order === p.nodeIndex)?.id).filter(Boolean));
  const hidden = allNodes.length - nodes.length;

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
    <div className="pb-1">
      {traversal && <div className="mb-3 rounded-lg border border-trace-border p-2 text-xs">
        <p className="font-semibold text-trace-text-primary">{traversal.action?.kind === 'empty' ? 'Empty child — check the base case' :
          traversal.action?.kind === 'return' ? (traversal.action.nodeId ? 'Returning from node ' + formatValue(traversal.action.value) : 'Returning from an empty child') :
          traversal.currentNodeId ? 'Exploring node ' + (allNodes.find(n => n.id === traversal.currentNodeId)?.label ?? '') : traversal.path.length ? 'Empty child — check the base case' : 'Recursive call finished'}</p>
        <p className="mt-1 text-trace-text-secondary">Follow one branch; return to the caller when its call finishes.</p>
      </div>}
      <div className="overflow-x-auto">

      <svg className="mx-auto" width={width} height={height} role="img" aria-label={`tree with ${nodes.length} nodes`}>
        <defs><marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        {/* Edges first, so the circles sit on top of them. */}
        {nodes.map((node) =>
          node.parent ? (
            <line
              key={`edge-${node.order}`}
              x1={cx(node.parent)}
              y1={cy(node.parent) + RADIUS}
              x2={cx(node)}
              y2={cy(node) - RADIUS}
              stroke={node.id && traversal?.path.includes(node.id) ? '#38bdf8' : '#2d3a5c'}
              strokeDasharray={traversal?.action?.kind === 'return' && traversal.action.nodeId === node.id ? '4 3' : undefined}
              markerStart={traversal?.action?.kind === 'return' && traversal.action.nodeId === node.id && traversal.action.parentId === node.parent.id ? 'url(#' + markerId + ')' : undefined}
              markerEnd={traversal?.action?.kind === 'enter' && traversal.action.nodeId === node.id && traversal.action.parentId === node.parent.id ? 'url(#' + markerId + ')' : undefined}
              strokeWidth={node.id && traversal?.path.includes(node.id) ? 2.5 : 1.5}
            />
          ) : null,
        )}

        {nodes.map((node) => {
          const cursors = cursorsByOrder.get(node.order) ?? [];
          const state = node.id === traversal?.currentNodeId ? 'Current' :
            node.id && traversal?.path.includes(node.id) ? 'Active path' :
            node.id && traversal?.returnedNodeIds.includes(node.id) ? 'Returned' :
            traversal?.entered.some(e => e.nodeId === node.id) ? 'Entered' : '';
          const accent = ({Current: '#fb923c', 'Active path': '#38bdf8', Returned: '#4ade80', Entered: '#a78bfa'} as Record<string, string>)[state] ?? cursors[0]?.color ?? (node.id && previousCursorIds.has(node.id) ? '#fbbf24' : undefined);

          return (
            <g key={`node-${node.order}`} data-node-id={node.id} data-state={state}>
              <circle
                cx={cx(node)}
                cy={cy(node)}
                r={RADIUS}
                fill={state === 'Current' ? '#9a3412' : accent ? 'rgba(56,189,248,0.12)' : '#16213e'}
                stroke={accent ?? '#2d3a5c'}
                strokeWidth={1.5}
              />
              <text
                x={cx(node)}
                y={cy(node) + 4}
                textAnchor="middle"
                fill="#e6e6e6"
                style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
              >
                {truncate(node.label, 4)}
              </text>
              <title>{node.label + (state ? ' — ' + state : '')}</title>

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
      </div>

      {allNodes.some(n => n.y >= 6) ? <button type="button" className="my-2 text-xs text-trace-accent" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Show first 6 levels' : 'Expand ' + hidden + ' deeper nodes'}
      </button> : null}
      <p className="text-xs text-trace-text-secondary mb-2">Top node = root · branches lead to left and right children.
        {(dataStructure.nodePointers?.length ?? 0) > 0 ? ' Labels show where node variables point.' : ''}
        {!traversal && previousCursorIds.size > 0 ? ' Amber marks the previous cursor.' : ''}</p>
      {traversal && <div className="my-3 space-y-3 text-xs">
        <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Node highlight legend">
          <span style={{color:'#fb923c'}}>● Current</span><span style={{color:'#38bdf8'}}>● Active path</span>
          <span style={{color:'#4ade80'}}>● Returned</span><span style={{color:'#a78bfa'}}>● Entered</span>
        </div>
        <div><p className="font-semibold text-trace-text-secondary">First entered</p>
          <p className="mb-2 text-trace-text-muted">Call-entry order, not output order. Select a node to revisit its first call.</p>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {traversal.entered.map((entry, i) => <button key={entry.nodeId} type="button" disabled={!onSelectStep}
              onClick={() => onSelectStep?.(entry.step)} title={'Entry ' + (i + 1) + ' · step ' + (entry.step + 1)}
              className="rounded border border-trace-border px-2 py-1 font-mono text-trace-accent hover:bg-trace-bg-card">
              <span className="text-trace-text-muted">{i + 1}. </span>{truncate(formatValue(entry.value), 12)}
            </button>)}
          </div>
        </div>
        <details><summary className="cursor-pointer text-trace-text-secondary">Recent calls and returns</summary>
          <ol className="mt-2 space-y-1 text-trace-text-secondary">{traversal.events.slice(-8).map(e =>
            <li key={e.step}>Step {e.step + 1} · {e.kind === 'enter' ? '↓ Enter ' : e.kind === 'empty' ? '↳ Empty child' : '↑ Return from '}{e.kind !== 'empty' ? e.nodeId ? formatValue(e.value) : 'empty child' : ''}</li>
          )}</ol>
        </details>
      </div>}
      <div className="text-trace-text-muted" style={{ fontSize: 10 }}>
        {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} · depth {depth}
      </div>
    </div>
  );
}
