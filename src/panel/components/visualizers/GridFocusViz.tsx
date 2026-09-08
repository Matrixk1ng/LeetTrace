import { useState } from 'react';
import type { DataStructureState, Snapshot } from '../../../shared/types';
import { formatValue, itemsOf } from './format';

function referencedCells(snapshot: Snapshot, ds: DataStructureState) {
  const rows = ds.data as unknown[][];
  return (snapshot.visual?.cells ?? []).filter(c => c.structure === ds.id).flatMap(c => {
    const values = c.indices.map(i => typeof i === 'number' ? i : snapshot.variables[i]?.value);
    const [r, col] = values;
    return typeof r === 'number' && Number.isInteger(r) && typeof col === 'number' && Number.isInteger(col) &&
      r >= 0 && r < rows.length && col >= 0 && col < rows[r].length ? [{row:r, col, write:c.write}] : [];
  });
}

/** Readable small grids; large grids scroll rather than shrinking text. */
export default function GridFocusViz({dataStructure: ds, snapshot}: {dataStructure: DataStructureState; snapshot: Snapshot}) {
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const rows = ds.data as unknown[][];
  const width = Math.max(0, ...rows.map(r => r.length));
  const refs = referencedCells(snapshot, ds);
  const current = snapshot.gridSearch?.grid === ds.id ? snapshot.gridSearch.current : undefined;
  const frontier = snapshot.gridSearch?.frontier;
  const queued = current && frontier ? itemsOf(snapshot.dataStructures.find(d=>d.id===snapshot.gridSearch?.queue)?.data).slice(frontier.remaining) : [];
  const selectedValue = selected && rows[selected[0]]?.[selected[1]];
  return <div>
    <div className="mb-2 flex justify-between text-xs text-trace-text-secondary"><span>{rows.length} × {width}</span><span>Select a cell to inspect</span></div>
    <div className="overflow-x-auto pb-2">
      <div className="mx-auto grid gap-1.5" style={{gridTemplateColumns:`20px repeat(${width}, minmax(48px, 1fr))`, minWidth:20 + width * 54, maxWidth:20 + width * 74}}>
        <span />{Array.from({length:width}, (_,c) => <span key={c} className="text-center text-[10px] text-trace-text-muted">{c}</span>)}
        {rows.flatMap((row,r) => [<span key={'r'+r} className="self-center text-center text-[10px] text-trace-text-muted">{r}</span>,
          ...Array.from({length:width}, (_,c) => {
            if(c >= row.length) return <span key={r+':'+c} />;
            const ref = refs.find(p => p.row === r && p.col === c);
            const isCurrent = current?.[0] === r && current[1] === c;
            const isQueued = queued.some(v=>Array.isArray(v) && v.length===2 && v[0]===r && v[1]===c);
            const role = isCurrent ? 'Current' : ref ? ref.write ? 'Write target' : current && refs.length === 1 ? 'Candidate' : 'Referenced' : isQueued ? 'Queued' : '';
            return <button type="button" key={r+':'+c} onClick={() => setSelected([r,c])}
              aria-label={`${ds.id}[${r}][${c}] = ${formatValue(row[c])}${ref ? ', referenced by this line' : ''}${isCurrent ? ', current dequeued state' : ''}`}
              aria-pressed={selected?.[0] === r && selected[1] === c}
              className="flex h-12 min-w-0 flex-col items-center justify-center rounded-lg border font-mono focus-visible:outline-2 focus-visible:outline-trace-accent"
              style={{borderColor:isCurrent ? '#38bdf8' : ref ? '#fbbf24' : isQueued ? '#b39afa' : '#34445f', borderStyle:ref && !isCurrent ? 'dashed' : 'solid', background:isCurrent ? '#38bdf817' : ref ? '#fbbf2410' : isQueued ? '#b39afa15' : '#202d47'}}>
              <span className="max-w-full truncate px-1 text-sm">{formatValue(row[c])}</span>
              <span className="text-[9px] text-trace-text-secondary">{role || `(${r}, ${c})`}</span>
            </button>;
          })])}
      </div>
    </div>
    {refs.length > 0 && <p className="mt-1 text-[11px] text-amber-200">◌ Referenced by line {snapshot.line} · before execution</p>}
    {current && <p className="mt-1 text-[11px] text-trace-accent">● Last dequeued: ({current.join(', ')})</p>}
    {selected && <p role="status" className="mt-2 break-all font-mono text-xs text-trace-accent">{ds.id}[{selected[0]}][{selected[1]}] = {selectedValue === undefined ? 'cell no longer present' : formatValue(selectedValue)}</p>}
  </div>;
}
