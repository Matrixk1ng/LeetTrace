import { useId, useState, type CSSProperties } from 'react';
import type { DataStructureState } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';
import { useTrace } from '../../store/useTrace';
import './batch.css';

function unpack(data: unknown): unknown {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const tagged = data as { __type?: string; items?: unknown; values?: unknown };
    if (['deque','set','heap','stack'].includes(tagged.__type ?? '')) return tagged.items ?? tagged.values ?? data;
  }
  return data;
}
type Mode = 'values' | 'adjacency' | 'parents' | 'intervals';

/** Shared observed-state views for collection and algorithm adapters. */
export default function BatchStructureViz({ dataStructure: ds, previous }: { dataStructure: DataStructureState; previous: DataStructureState | null }) {
  const { currentSnapshot } = useTrace();
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [choice, setChoice] = useState<Mode | null>(null);
  const marker = useId().replace(/:/g, '');
  const value = unpack(ds.data), prev = unpack(previous?.data);
  const operation = currentSnapshot?.visual?.operation;
  const role = operation?.roles[ds.id];
  const mode = choice ?? (role === 'adjacency' || role === 'parents' || role === 'intervals' ? role : 'values');
  const array = typeof value === 'string' ? [...value] : Array.isArray(value) ? value : null;
  const pairs = array?.every(v => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n))) && array.length > 0;
  const entries: [string, unknown][] = array ? array.map((v, i) => [String(i), v]) : value && typeof value === 'object' ? Object.entries(value) : [];
  const canParents = !!array?.length && array.every(v=>Number.isInteger(v) && Number(v)>=0 && Number(v)<array.length);
  const canAdjacency = entries.length > 0 && entries.every(([,v])=>Array.isArray(v));
  const isMatrix = ds.type === 'matrix' && !!array?.length && array.every(v => Array.isArray(v));
  const isLinear = ['array','string','matrix'].includes(ds.type);
  const accesses = operation?.upcoming?.accesses.filter(a => a.name === ds.id) ?? [];
  const roles = operation?.roles ?? {};
  const visitedName = Object.keys(roles).find(k=>roles[k]==='visited-set');
  const visitedValues = unpack(visitedName ? currentSnapshot?.variables[visitedName]?.value : undefined);
  const visited = new Set(Array.isArray(visitedValues) ? visitedValues.map(String) : []);
  const lowName = Object.keys(roles).find(k=>roles[k]==='lower-bound'||roles[k]==='window-start');
  const highName = Object.keys(roles).find(k=>roles[k]==='upper-bound'||roles[k]==='exclusive-upper-bound'||roles[k]==='window-end');
  const midName = Object.keys(roles).find(k=>roles[k]==='midpoint');
  const lower = lowName ? currentSnapshot?.variables[lowName]?.value : undefined;
  const upper = highName ? currentSnapshot?.variables[highName]?.value : undefined;
  const exclusive = highName && roles[highName]==='exclusive-upper-bound';
  const hasRange = !!array && !isMatrix && typeof lower==='number' && typeof upper==='number' && (role==='window-values'||ds.pointers.some(p=>p.name===midName));
  const before = operation ? unpack(operation.completed?.before[ds.id]) : prev;
  const oldAt = (key: string) => before && typeof before === 'object' ? (before as Record<string, unknown>)[key] : undefined;
  const changed = (key: string, v: unknown) => before !== undefined && (ds.type === 'set' && Array.isArray(before) ? !before.some(old=>JSON.stringify(old)===JSON.stringify(v)) : JSON.stringify(oldAt(key)) !== JSON.stringify(v));
  const check = (key: string) => accesses.some(a => ds.type === 'set' && a.membership ? JSON.stringify(a.indices[0])===JSON.stringify(entries.find(([k])=>k===key)?.[1]) : String(a.indices[0]) === key);
  const rowClass = (key: string, v: unknown) => `${hasRange && Number(key)>=Number(lower) && (exclusive?Number(key)<Number(upper):Number(key)<=Number(upper)) ? 'batch-in-range' : ''} ${changed(key, v) ? 'batch-changed' : ''} ${check(key) ? 'batch-current' : ''}`;
  const text = formatTraceValue;
  const inspect = (key: string, _value: unknown) => { void _value; setSelected(key); };
  const start = Math.min(page, Math.max(0, entries.length - 1));
  let visible = entries.slice(start, start + 24);
  if (ds.type === 'stack') visible = [...entries].reverse().slice(start, start + 24);
  const links: { from: string; to: string; weight?: unknown }[] = [];
  const nodes = new Map<string, unknown>();
  if (mode === 'parents' && array?.every(v => Number.isInteger(v) && Number(v) >= 0 && Number(v) < array.length)) {
    array.forEach((p, i) => { nodes.set(String(i), i); if (p !== i) links.push({ from: String(i), to: String(p) }); });
  } else if (mode === 'adjacency') {
    for (const [from, neighbors] of entries) {
      if (!Array.isArray(neighbors)) continue;
      nodes.set(from, from);
      for (const neighbor of neighbors) {
        const target = Array.isArray(neighbor) ? neighbor[0] : neighbor;
        if (typeof target !== 'number' && typeof target !== 'string') continue;
        const to = String(target); nodes.set(to, to);
        links.push({ from, to, weight: Array.isArray(neighbor) ? neighbor[1] : undefined });
      }
    }
  } else if (ds.type === 'heap' && array) {
    array.forEach((v, i) => { nodes.set(String(i), v); if (i) links.push({ from: String(Math.floor((i - 1) / 2)), to: String(i) }); });
  }
  const ids = [...nodes.keys()].slice(0, 24);
  const coords = new Map(ids.map((id, i) => {
    if (ds.type === 'heap') {
      const level = Math.floor(Math.log2(i + 1)), offset = i - (2 ** level - 1);
      return [id, { x: (offset + .5) * 340 / 2 ** level, y: 30 + level * 65 }];
    }
    return [id, { x: 170 + 120 * Math.cos(i * Math.PI * 2 / ids.length - Math.PI / 2), y: 145 + 105 * Math.sin(i * Math.PI * 2 / ids.length - Math.PI / 2) }];
  }));
  const removed = before && typeof before === 'object' && !Array.isArray(before) ? Object.keys(before).filter(k => !entries.some(([key]) => key === k)) : [];
  return <div className="batch-structure">
    {(pairs || canParents || canAdjacency) && <label className="batch-note">View <select aria-label={`${ds.id} view`} value={mode} onChange={e => setChoice(e.target.value as Mode)}><option value="values">Values</option>{pairs && <option value="intervals">Intervals</option>}{canAdjacency && <option value="adjacency">Adjacency links</option>}{canParents && <option value="parents">Parent links</option>}</select></label>}
    {!!nodes.size && <><svg className="batch-svg" viewBox={`0 0 340 ${ds.type === 'heap' ? Math.max(140, 80 + Math.floor(Math.log2(ids.length)) * 65) : 300}`} role="group" aria-label={`${ds.id} ${ds.type === 'heap' ? 'heap' : mode} diagram`}>
      <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#9fb8d7" /></marker></defs>
      {links.flatMap((edge,i) => { const a = coords.get(edge.from), b = coords.get(edge.to); if (!a || !b) return []; const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length; const lane = links.some(e => e.from === edge.to && e.to === edge.from) ? 5 : 0; const d = edge.from === edge.to ? `M${a.x-12} ${a.y-15} C${a.x-55} ${a.y-60} ${a.x+55} ${a.y-60} ${a.x+12} ${a.y-15}` : `M${a.x+ux*20-uy*lane} ${a.y+uy*20+ux*lane} L${b.x-ux*23-uy*lane} ${b.y-uy*23+ux*lane}`; return <g key={i}><path className="edge" d={d} markerEnd={ds.type === 'heap' ? undefined : `url(#${marker})`} />{edge.weight !== undefined && <text className="weight" x={(a.x+b.x)/2-uy*9} y={(a.y+b.y)/2+ux*9} textAnchor="middle">{text(edge.weight)}</text>}</g>; })}
      {ids.map(id => { const p = coords.get(id)!; return <g key={id} role="button" tabIndex={0} aria-label={`Inspect ${ds.id} node ${id}`} onClick={() => inspect(id, nodes.get(id))} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(id, nodes.get(id)); } }}><circle cx={p.x} cy={p.y} r={19} fill={check(id) ? '#174766' : visited.has(id) ? '#254c42' : '#202d47'} stroke={check(id) ? '#f5ca72' : '#435271'} /><text x={p.x} y={p.y+4} textAnchor="middle">{(typeof nodes.get(id)==='string' ? String(nodes.get(id)) : text(nodes.get(id))).slice(0,7)}</text>{mode==='parents' && array?.[Number(id)]===Number(id) && <text x={p.x} y={p.y+34} textAnchor="middle">root</text>}</g>; })}
    </svg>{nodes.size > 24 && <p className="batch-note">First 24 nodes shown. All recorded values remain available below.</p>}</>}
    {!!nodes.size && visitedName && <p className="batch-note">Green nodes belong to {visitedName}.</p>}
    {mode === 'intervals' && pairs && (() => { const intervals = array as number[][]; const minimum = Math.min(...intervals.flat()), maximum = Math.max(...intervals.flat()); const scale = 275 / Math.max(1, maximum - minimum); return <svg className="batch-svg" viewBox={`0 0 340 ${Math.min(12, intervals.length)*38+30}`} role="img" aria-label={`${ds.id} interval timeline`}>{intervals.slice(0,12).map(([a,b],i) => <g key={i}><line x1={35+(a-minimum)*scale} y1={i*38+18} x2={35+(b-minimum)*scale} y2={i*38+18} stroke={changed(String(i),intervals[i]) ? '#72dcb0' : '#38bdf8'} strokeWidth={8} strokeLinecap="round" /><text x={35+(a-minimum)*scale} y={i*38+36}>[{a}, {b}]</text></g>)}</svg>; })()}
    {entries.length > 24 && <nav className="batch-navigation"><button disabled={!start} onClick={() => setPage(Math.max(0,start-24))}>Earlier</button><span>{start+1}–{Math.min(start+24, entries.length)} / {entries.length}</span><button disabled={start+24>=entries.length} onClick={() => setPage(start+24)}>Later</button></nav>}
    {isMatrix ? <div className="grid-wrap"><div className="batch-grid" style={{gridTemplateColumns:`repeat(${Math.max(1,Math.min(12, (array![0] as unknown[]).length))},minmax(38px,1fr))`}}>{visible.flatMap(([r,row]) => (row as unknown[]).slice(0,12).map((v,c) => { const previousRow = oldAt(r); const diff = Array.isArray(previousRow) && JSON.stringify(previousRow[c]) !== JSON.stringify(v); const referenced = accesses.some(a => String(a.indices[0]) === r && a.indices[1] === c); return <button key={`${r},${c}`} className={`batch-cell ${diff ? 'batch-changed' : ''} ${referenced ? 'batch-current' : ''}`} onClick={() => inspect(`${r},${c}`,v)}><small className="batch-index">{r},{c}</small>{text(v)}</button>; }))}</div><p className="batch-note">Up to 12 columns per row shown. Select a value for its coordinates.</p></div> : isLinear ? <div className="batch-grid" style={{gridTemplateColumns:'repeat(6,minmax(0,1fr))'}}>{visible.map(([key,v]) => {
      const pointers = ds.pointers.filter(p => p.index === Number(key));
      const colors = [...new Set(pointers.map(p => p.color))];
      const fill = colors.map((color, i) => `color-mix(in srgb, ${color} 32%, #202d47) ${i * 100 / colors.length}% ${(i + 1) * 100 / colors.length}%`).join(', ');
      const pointerStyle = colors.length ? {
        '--pointer-fill': `linear-gradient(110deg, ${fill})`,
        '--pointer-color': colors[0],
      } as CSSProperties : undefined;
      return <button key={key} className={`batch-cell ${rowClass(key,v)} ${pointers.length ? 'batch-pointed' : ''}`}
        style={pointerStyle}
        aria-label={`${ds.id}[${key}] = ${text(v)}${pointers.length ? `; pointers: ${pointers.map(p => p.name).join(', ')}` : ''}${changed(key,v) ? '; changed' : ''}`}
        onClick={() => inspect(key,v)}>
        <small className="batch-index">{key}</small><span className="batch-value">{text(v)}</span>
        <span className="batch-pointers">{pointers.map(p => <span key={p.name} className="batch-pointer" style={{color:p.color}}>{'\u2191 '}{p.name}</span>)}</span>
        {pointers.length > 0 && changed(key,v) && <span className="batch-change-mark" title="Changed since the preceding operation" aria-hidden="true" />}
      </button>;
    })}</div> : <div className="batch-rows">{visible.map(([key,v],i) => <button key={key} className={`batch-row ${rowClass(key,v)}`} onClick={() => inspect(key,v)}><span>{ds.type === 'hashmap' ? key : text(v)}</span><span>{ds.type === 'hashmap' ? text(v) : ds.type === 'stack' && start+i===0 ? 'top' : ds.type === 'queue' ? `${start+i===0?'front':''}${Number(key)===entries.length-1?' back':''}` : ds.type === 'heap' ? `index ${key}${key==='0'?' · root':''}` : ''}</span></button>)}</div>}
    {!entries.length && <p className="batch-note">Empty · no values stored</p>}
    {hasRange && <p className="batch-note">{role==='window-values'?'Window':'Bounds'} [{String(lower)}, {String(upper)}{exclusive?')':']'} · {exclusive?'upper bound excluded':'endpoints included'} · pointer labels show current variable positions.</p>}
    {!!removed.length && <p className="batch-note">Removed keys: {removed.join(', ')}</p>}
    <div className="batch-inspect">{selected !== null ? `${ds.id}[${selected}] = ${text(isMatrix && selected.includes(',') ? (array?.[Number(selected.split(',')[0])] as unknown[])?.[Number(selected.split(',')[1])] : entries.some(([key])=>key===selected) ? entries.find(([key])=>key===selected)![1] : nodes.has(selected) ? nodes.get(selected) : 'not present at this step')}` : 'Select a value or node to inspect it.'}</div>
    <p className="batch-note">Dashed amber outline: referenced by the next statement. Green fill or dot: changed since the preceding operation. {ds.type === 'set' ? 'Set display order has no algorithmic meaning.' : ds.type === 'heap' ? 'Heap operations show their recorded result; internal sift steps are not invented.' : ''}</p>
  </div>;
}
