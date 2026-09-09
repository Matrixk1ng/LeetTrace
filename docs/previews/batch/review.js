/* global REVIEW */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? 'None').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let topic, example, step = 0;
  const status = (v, i) => [v.current?.includes(i) ? 'current' : '', v.changed?.includes(i) ? 'changed' : '', v.check?.includes(i) ? 'check' : '', v.dim?.includes(i) ? 'muted-cell' : ''].join(' ');
  const inspect = (label, value) => `data-inspect="${esc(label + ': ' + (typeof value === 'object' ? JSON.stringify(value) : String(value)))}"`;
  function visual(v, index) {
    let body = '';
    if (v.type === 'array') body = `<div class="array">${v.values.map((value,i) => `<div class="slot"><small>${i}</small><button class="cell ${status(v,i)}" ${inspect(`${v.name}[${i}]`,value)}>${esc(value)}</button><div class="ptr">${esc(Object.entries(v.pointers ?? {}).filter(([,p])=>p===i).map(([name])=>'↑ '+name).join(' · '))}</div></div>`).join('')}</div>${Object.entries(v.pointers ?? {}).filter(([,p])=>p<0||p>=v.values.length).map(([name,p])=>`<p>${esc(name)} = ${p} · outside array</p>`).join('')}${!v.values.length?'<p class="empty">Empty</p>':''}`;
    if (v.type === 'rows') body = `<div class="rows">${v.values.map((row,i)=>`<button class="${status(v,i)}" ${inspect(v.name, row)}><span>${esc(Array.isArray(row)?row[0]:row)}</span><span class="row-detail">${esc(Array.isArray(row)?row[1]:'')}</span></button>`).join('')||'<p class="empty">Empty</p>'}</div>`;
    if (v.type === 'grid') body = `<div class="grid-wrap"><table class="grid"><thead><tr><th></th>${v.cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${v.values.map((row,r)=>`<tr><th>${esc(v.rows?.[r]??r)}</th>${row.map((value,c)=>`<td><button class="${status(v,`${r},${c}`)}" ${inspect(`${v.name}[${r}][${c}]`,value)}>${esc(value)}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (v.type === 'calls') body = `<div class="calls">${v.values.map((row,i)=>`<div class="call ${row.returned?'returned':''} ${v.current?.includes(i)?'active':''}" style="--indent:${Math.min(row.depth,7)*14}px">${esc(row.text)}</div>`).join('')}</div>`;
    if (v.type === 'graph') {
      const nodes = v.nodes.map((n,i)=> typeof n === 'string'?{id:n,label:n}:n);
      const coords = new Map(nodes.map((n,i)=>[n.id,{...n,x:n.x??(170+110*Math.cos(i*2*Math.PI/nodes.length-Math.PI/2)),y:n.y??(135+95*Math.sin(i*2*Math.PI/nodes.length-Math.PI/2))}]));
      const marker = `tip-${index}`;
      body = `<svg class="graph" viewBox="0 0 340 ${v.height??270}" role="group" aria-label="${esc(v.name)}"><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#9fb8d7"/></marker></defs>`;
      for (const edge of v.edges) {
        const [a,b,w,kind] = edge, from=coords.get(a), to=coords.get(b); if(!from||!to)continue;
        const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
        const lane=v.edges.some(e=>e[0]===b&&e[1]===a)?6:0;
        const d=a===b?`M${from.x-14} ${from.y-18} C${from.x-65} ${from.y-65} ${from.x+65} ${from.y-65} ${from.x+14} ${from.y-18}`:`M${from.x+ux*23-uy*lane} ${from.y+uy*23+ux*lane} L${to.x-ux*26-uy*lane} ${to.y-uy*26+ux*lane}`;
        body+=`<path class="edge ${kind??''}" d="${d}" ${v.directed===false?'':`marker-end="url(#${marker})"`}/>${w!==undefined&&w!==null?`<text class="edge-label" text-anchor="middle" x="${(from.x+to.x)/2-uy*11}" y="${(from.y+to.y)/2+ux*11-3}">${esc(w)}</text>`:''}`;
      }
      body += [...coords.values()].map(n=>`<g class="node ${n.state??''}" role="button" tabindex="0" aria-label="Inspect ${esc(n.id)}" ${inspect(n.id,n.info??n.sub??n.label??n.id)}><circle cx="${n.x}" cy="${n.y}" r="22"/><text x="${n.x}" y="${n.y+5}" text-anchor="middle">${esc(n.label??n.id)}</text><text class="sub" x="${n.x}" y="${n.y+39}" text-anchor="middle">${esc(n.sub??'')}</text></g>`).join('')+'</svg>';
    }
    if (v.type === 'intervals') {
      const scale = 280/(v.max??10);
      body=`<svg class="intervals" viewBox="0 0 340 ${v.values.length*39+32}" role="img" aria-label="${esc(v.name)}">${Array.from({length:(v.max??10)+1},(_,i)=>`<text x="${40+i*scale}" y="15" text-anchor="middle">${i}</text>`).join('')}${v.values.map((range,i)=>`<text x="2" y="${42+i*39}">${i}</text><line x1="${40+range[0]*scale}" y1="${38+i*39}" x2="${40+range[1]*scale}" y2="${38+i*39}" stroke="${v.changed?.includes(i)?'#72dcb0':v.check?.includes(i)?'#f5ca72':'#38bdf8'}" stroke-width="9" stroke-linecap="round"/><text x="${40+range[0]*scale}" y="${58+i*39}">[${range.join(', ')}]</text>`).join('')}</svg>`;
    }
    return `<section class="card"><h3>${esc(v.name)}</h3>${body}${v.note?`<div class="band">${esc(v.note)}</div>`:''}</section>`;
  }
  function render() {
    const state = example.steps[step];
    $('family').textContent=topic.name; $('heading').textContent=example.name;
    $('action').textContent=state.title;$('explanation').textContent=state.detail;
    $('statement').textContent=state.code??'Observe the current state';
    $('position').textContent=`${step+1} / ${example.steps.length}`;
    $('back').disabled=step===0;$('next').disabled=step===example.steps.length-1;
    $('timeline').max=example.steps.length-1;$('timeline').value=step;
    $('visual').innerHTML=(state.views??[]).map(visual).join('');
    $('facts').innerHTML=`<div class="facts">${Object.entries(state.facts??{}).map(([k,v])=>`<div class="fact"><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>`;
    $('history').innerHTML=example.steps.slice(0,step+1).map((s,i)=>`<button data-step="${i}" class="${i===step?'active':''}">${i+1} · ${esc(s.title)}</button>`).join('');
    $('notes').textContent=topic.notes; $('scope').textContent=`${topic.name} — ${topic.scope}`;
    $('inspection').textContent='Select a value or node to inspect it.';
    document.querySelectorAll('[data-inspect]').forEach(el=>{const show=()=>{$('inspection').textContent=el.dataset.inspect};el.onclick=show;el.onkeydown=e=>{if(el.tagName.toLowerCase()==='g'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();show()}}});
    document.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{step=+el.dataset.step;render()});
  }
  function catalog(){const q=$('filter').value.toLowerCase();$('catalog').innerHTML=REVIEW.filter(t=>(t.name+' '+t.scope).toLowerCase().includes(q)).map(t=>`<a class="${t.id===topic?.id?'active':''}" href="#${t.id}/0">${esc(t.name)}<small>${t.examples.length} examples · preview only</small></a>`).join('')}
  function route(){const [id,choice]=location.hash.slice(1).split('/');topic=REVIEW.find(t=>t.id===id)??REVIEW[0];const number=Math.max(0,Math.min(+choice||0,topic.examples.length-1));example=topic.examples[number];step=example.start??0;$('scenario').innerHTML=topic.examples.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('');$('scenario').value=number;$('permalink').href=`#${topic.id}/${number}`;catalog();render()}
  $('scenario').onchange=()=>{location.hash=`${topic.id}/${$('scenario').value}`};$('filter').oninput=catalog;
  $('back').onclick=()=>{if(step>0){step--;render()}};$('next').onclick=()=>{if(step<example.steps.length-1){step++;render()}};$('reset').onclick=()=>{step=0;render()};$('timeline').oninput=()=>{step=+$('timeline').value;render()};
  $('narrow').onclick=()=>{$('panel').style.width='400px'};$('wide').onclick=()=>{$('panel').style.width='550px'};
  window.addEventListener('hashchange',route);route();
})();
