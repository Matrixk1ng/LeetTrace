import type { DataStructureState } from '../../../shared/types';
import { formatValue } from './format';

export default function TupleSequenceViz({dataStructure}: {dataStructure: DataStructureState}) {
  const items = dataStructure.data as unknown[][];
  const chips = (values: unknown[][]) => values.map((v,i) => <span key={i} className="rounded-md border border-trace-border bg-trace-bg-secondary px-2 py-1 font-mono text-xs break-all">({v.map(formatValue).join(', ')})</span>);
  return <div>
    <div className="flex flex-wrap gap-1.5">{chips(items.slice(0,12))}</div>
    {items.length > 12 && <details className="mt-2 text-xs"><summary>Show {items.length - 12} more tuples</summary><div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">{chips(items.slice(12))}</div></details>}
    <p className="mt-2 text-[11px] text-trace-text-muted">{items.length} tuple records · order preserved</p>
  </div>;
}
