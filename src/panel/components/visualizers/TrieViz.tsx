import { useId, useState } from 'react';
import type { DataStructureState } from '../../../shared/types';
import './batch.css';

interface TrieData { root: string; nodes: { id: string; character: string; terminal: boolean | null }[]; edges: { from: string; to: string; character: string }[]; truncated: boolean }
export default function TrieViz({ dataStructure }: { dataStructure: DataStructureState }) {
  const data = dataStructure.data as TrieData;
  const marker = useId().replace(/:/g, '');
  const [selected, setSelected] = useState('');
  const depth = new Map([[data.root, 0]]);
  for (let i=0;i<data.nodes.length;i++) for (const edge of data.edges) if (depth.has(edge.from) && !depth.has(edge.to)) depth.set(edge.to,depth.get(edge.from)!+1);
  const nodes = data.nodes.slice(0,40), levels = new Map<number,string[]>();
  for (const node of nodes) { const d = depth.get(node.id) ?? 0; levels.set(d,[...(levels.get(d)??[]),node.id]); }
  const position = (id:string) => {const d=depth.get(id)??0, row=levels.get(d)??[id];return {x:(row.indexOf(id)+.5)*340/row.length,y:30+d*70};};
  const selectedNode = data.nodes.find(n=>n.id===selected);
  const inspection = selectedNode ? `${selectedNode.character||'root'} - ${selectedNode.terminal===null?'word-end flag not identified':selectedNode.terminal?'complete word ends here':'prefix only'}` : selected ? 'Node not present at this step' : 'Select a character node to inspect its word-ending flag.';
  return <div className="batch-structure"><svg className="batch-svg" style={{maxHeight:'none'}} viewBox={`0 0 340 ${Math.max(...levels.keys(),0)*70+95}`} role="group" aria-label="Trie character paths"><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#9fb8d7"/></marker></defs>{data.edges.filter(e=>nodes.some(n=>n.id===e.from)&&nodes.some(n=>n.id===e.to)).map((edge,i)=>{const a=position(edge.from),b=position(edge.to);return <line key={i} x1={a.x} y1={a.y+19} x2={b.x} y2={b.y-23} stroke="#7d96b8" markerEnd={`url(#${marker})`}/>;})}{nodes.map(node=>{const p=position(node.id);const inspect=()=>setSelected(node.id);return <g key={node.id} role="button" tabIndex={0} aria-label={`Inspect trie character ${node.character||'root'}`} onClick={inspect} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect();}}}><circle cx={p.x} cy={p.y} r={19} fill={node.terminal?'#254c42':'#202d47'} stroke={node.terminal?'#72dcb0':'#435271'}/><text x={p.x} y={p.y+4} textAnchor="middle">{node.character||'•'}</text>{!!dataStructure.nodePointers?.some(p=>data.nodes[p.nodeIndex]?.id===node.id)&&<text x={p.x} y={p.y+49} textAnchor="middle">{dataStructure.nodePointers.filter(p=>data.nodes[p.nodeIndex]?.id===node.id).map(p=>p.name).join(', ')}</text>}{node.terminal&&<text x={p.x} y={p.y+34} textAnchor="middle">word end</text>}</g>;})}</svg><p className="batch-inspect">{inspection}</p>{(data.truncated||data.nodes.length>40)&&<p className="batch-note">First 40 captured nodes shown.</p>}</div>;
}
