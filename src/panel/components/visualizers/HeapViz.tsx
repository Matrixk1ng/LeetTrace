import type { DataStructureState } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';
import ArrayViz from './ArrayViz';

/** Heap order is positional, never sorted for display. Root is index 0. */
export default function HeapViz({ dataStructure }: { dataStructure: DataStructureState }) {
  const data = Array.isArray(dataStructure.data) ? dataStructure.data : [];
  const visible = data.slice(0, 31);
  const levels = visible.length ? Math.floor(Math.log2(visible.length)) + 1 : 0;
  const width = Math.max(220, 2 ** (levels - 1) * 42);
  const point = (i: number) => {
    const level = Math.floor(Math.log2(i + 1));
    const first = 2 ** level - 1;
    return { x: ((i - first + .5) / 2 ** level) * width, y: 28 + level * 60 };
  };
  return <div>
    <p className="mb-2 text-xs text-trace-text-secondary">Priority at root · index 0. Each child stays in its heap position.</p>
    {!data.length ? <p className="text-sm text-trace-text-muted">Empty heap</p> : <div className="overflow-x-auto">
      <svg width={width} height={levels * 60} role="img" aria-label={'Heap with ' + data.length + ' items'}>
        {visible.map((_, i) => {
          if (i === 0) return null;
          const a = point(Math.floor((i - 1) / 2)), b = point(i);
          return <line key={'edge-' + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" />;
        })}
        {visible.map((v, i) => {
          const p = point(i);
          return <g key={i}>
            <circle cx={p.x} cy={p.y} r={17} fill={i === 0 ? '#075985' : '#16213e'} stroke="#38bdf8" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#e6e6e6" fontSize={11}>{formatTraceValue(v).slice(0, 5)}</text>
            <title>{'Index ' + i + ': ' + formatTraceValue(v)}</title>
          </g>;
        })}
      </svg>
    </div>}
    {data.length > visible.length ? <p className="text-xs text-trace-text-secondary">{data.length - visible.length} more items in the storage view below.</p> : null}
    <details className="mt-2 text-xs text-trace-text-secondary"><summary className="cursor-pointer">Array storage · child indices 2i + 1 and 2i + 2</summary>
      <div className="mt-3"><ArrayViz dataStructure={dataStructure} highlights={[]} /></div>
    </details>
  </div>;
}
