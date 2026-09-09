import { useId, useMemo, useState } from 'react';
import { useTrace } from '../../store/useTrace';
import { linkedListModel } from './linkedListModel';
import { formatTraceValue } from '../../../shared/display';
import './two-pointer.css';
import './linked-list.css';

export default function LinkedListTraceViz() {
  const { state, currentSnapshot, dispatch } = useTrace();
  const model = useMemo(() => linkedListModel(state.snapshots, state.currentStep), [state.snapshots, state.currentStep]);
  const [selected, setSelected] = useState<string | null>(null);
  const marker = useId().replace(/:/g, '');
  if (!model.order.length) return null;
  const ids = model.order.slice(0, 40), width = Math.max(330, ids.length * 110);
  const x = (i: number) => i * 110 + 55;
  const aliases = (id: string) => [...model.aliases].filter(([, target]) => id === target).map(([name]) => name);
  const height = 195 + Math.max(1, ...ids.map(id => aliases(id).length)) * 15;
  const jump = (step: number) => { dispatch({ type: 'PAUSE' }); dispatch({ type: 'SET_STEP', payload: step }); };
  const inspect = selected ? model.nodes.get(selected) : undefined;
  const path = (id: string | null) => {
    const seen = new Set<string>(), result: string[] = [];
    while (id !== null && result.length < 12) {
      if (seen.has(id)) { result.push(`↩ ${model.label(id)} (cycle)`); return result.join(' → '); }
      seen.add(id); result.push(model.label(id));
      const node = model.nodes.get(id);
      if (!node) { result.push('not visible'); return result.join(' → '); }
      id = node.next;
    }
    return result.concat(id === null ? 'None' : '…').join(' → ');
  };
  return <section className="two-pointer linked-trace">
    <h2>Change the links. Follow the pointers.</h2>
    <div className="tp-action" aria-live="polite"><strong>{model.changedLinks.size ? 'Next link changed' : model.changes.length ? 'Variables updated' : currentSnapshot?.event === 'return' ? 'Call returned' : 'Current links and pointers'}</strong><p>{model.changes.join(' · ') || 'Nodes keep their identity and position throughout this call.'}</p></div>
    <div className="tp-hero"><b>Nodes & pointers</b><div className="ll-scroll"><svg width={width} height={height} role="group" aria-label="Linked-list nodes and next arrows">
      <defs>{['normal', 'changed'].map(kind => <marker key={kind} id={`${marker}-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10Z" fill={kind === 'changed' ? '#92e5bc' : '#8daac8'} /></marker>)}</defs>
      {ids.map((id, i) => {
        const node = model.nodes.get(id); if (!node) return null;
        const target = node.next === null ? -1 : ids.indexOf(node.next);
        let d: string;
        if (node.next === null || target < 0) d = `M${x(i) + 30} 125 H${x(i) + 40} V45 H${x(i)} V28`;
        else if (target === i + 1 || target === i - 1) { const direction = target > i ? 1 : -1; d = `M${x(i) + direction * 32} ${125 - direction * 6} H${x(target) - direction * 34}`; }
        else d = `M${x(i)} 102 C${x(i) + 35} 30 ${x(target) - 35} 30 ${x(target)} 102`;
        return <g key={id}>{(node.next === null || target < 0) && <text x={x(i)} y={20} textAnchor="middle" className="ll-small">{node.next === null ? 'None' : `→ ${model.label(node.next)} (offscreen)`}</text>}<path data-from={model.label(id)} data-to={model.label(node.next)} className={'ll-link' + (model.changedLinks.has(id) ? ' changed' : '')} d={d} markerEnd={`url(#${marker}-${model.changedLinks.has(id) ? 'changed' : 'normal'})`}><title>{`${model.label(id)}.next → ${model.label(node.next)}`}</title></path></g>;
      })}
      {ids.map((id, i) => { const node = model.nodes.get(id); const names = aliases(id); return <g key={id}>
        <text x={x(i)} y={87} textAnchor="middle" className="ll-small">Node {model.label(id)}</text>
        <g role="button" tabIndex={0} aria-label={`Inspect node ${model.label(id)}`} onClick={() => setSelected(id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(id); } }}>
          <rect x={x(i) - 30} y={103} width={60} height={46} rx={6} fill={names.length ? '#174766' : '#202d47'} stroke={names.length ? '#38bdf8' : '#435271'} strokeWidth={selected === id ? 3 : 1.5} />
          <text x={x(i)} y={131} textAnchor="middle" className="ll-value">{node ? formatTraceValue(node.value).slice(0, 7) : '?'}</text><title>{node ? formatTraceValue(node.value) : 'Not reachable from current variables'}</title>
        </g>
        {names.map((name, j) => <text key={name} x={x(i)} y={169 + j * 15} textAnchor="middle" className="ll-alias">↑ {name}</text>)}
      </g>; })}
    </svg></div>
    {model.order.length > 40 && <p className="tp-note">First 40 of {model.order.length} observed nodes shown. Offscreen links name their destination.</p>}
    <p className="tp-note">Arrows show next links. Green means the link changed. Node labels identify nodes even when values repeat. Scroll sideways for longer lists.</p>
    <p className="tp-note">{[...model.aliases].filter(([, id]) => id === null).map(([name]) => `${name} = None`).join(' · ')}</p>
    <p className="ll-inspection">{selected ? inspect ? `Node ${model.label(selected)} · value ${formatTraceValue(inspect.value)} · next = ${model.label(inspect.next)}` : 'This node is not reachable from current variables; its current link is unknown.' : 'Select a node to inspect its value and next link.'}</p></div>
    <details className="ll-paths" open><summary>Follow links from each variable</summary>{[...model.aliases].filter(([, id]) => id !== null).map(([name, id]) => <p key={name}><b>{name}:</b> {path(id)}</p>)}</details>
    <div className="tp-heading"><b>Changes so far</b><span>Select to revisit</span></div>
    <div className="tp-history">{model.history.slice(-30).map(event => <button key={event.step} onClick={() => jump(event.step)}>{event.changes.join(' · ')}</button>)}{!model.history.length && <p className="tp-note">No link or pointer changes recorded yet.</p>}</div>
    <p className="tp-note">Changes compare consecutive recorded states in this call. The highlighted code line is the next line to execute.</p>
  </section>;
}
