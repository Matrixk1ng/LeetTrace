/* Illustrative fixture generators only. Nothing here executes user code. */
const REVIEW = [];
(() => {
  const A=(name,values,extra={})=>({type:'array',name,values,...extra});
  const R=(name,values,extra={})=>({type:'rows',name,values,...extra});
  const G=(name,nodes,edges,extra={})=>({type:'graph',name,nodes,edges,...extra});
  const T=(name,values,extra={})=>({type:'grid',name,values,cols:values[0]?.map((_,i)=>i)??[],...extra});
  const C=(name,values,extra={})=>({type:'calls',name,values,...extra});
  const I=(name,values,extra={})=>({type:'intervals',name,values,...extra});
  const make=name=>({name,steps:[]});
  const add=(e,title,detail,code,views,facts={})=>e.steps.push(structuredClone({title,detail,code,views,facts}));
  const topic=(id,name,scope,examples,notes='Events are illustrative states, not live trace output. Production must bind the displayed operation to observed execution, preserve exact stepping, and use a neutral fallback for unknown syntax.')=>REVIEW.push({id,name,scope,examples,notes});
  const n=(id,x,y,state='',sub='')=>({id,x,y,state,sub});

  // Stacks, queues and maps retain their familiar shapes; changes get their own events.
  {
    const e=make('Push, peek, pop — then empty');let stack=[];
    const view=(changed=[])=>R('Stack · top first',stack.map((v,i)=>[v,i===0?'top':'']),{changed});
    add(e,'Start empty','There is no top value yet.','stack = []',[view()]);
    for(const v of [2,5,1]){stack.unshift(v);add(e,`Push ${v}`,`${v} becomes the top; earlier values remain below it.`,`stack.append(${v})`,[view([0])],{Size:stack.length});}
    add(e,'Peek at 1','Reading the top does not remove it.','value = stack[-1]',[view()],{Read:1,Size:3});
    while(stack.length){const v=stack.shift();add(e,`Pop ${v}`,`${v} is removed; ${stack.length?'the next value becomes top.':'the stack is empty.'}`,'value = stack.pop()',[view()],{Removed:v,Size:stack.length});}
    topic('stack','Stack','Push/pop effects, top position and empty states.',[e]);
    const q=make('Queue — oldest value leaves first');let queue=[];
    const qv=()=>A('Queue · front → back',queue,{pointers:queue.length?{front:0,back:queue.length-1}:{}});
    add(q,'Start empty','There is no front or back.','q = deque()',[qv()]);
    for(const v of ['A','B','C']){queue.push(v);add(q,`Enqueue ${v}`,'New items enter at the back.',`q.append('${v}')`,[qv()]);}
    const removed=queue.shift();add(q,'Dequeue A','The oldest item leaves from the front.','item = q.popleft()',[qv()],{Removed:removed});
    const d=make('Deque — both ends are explicit');
    add(d,'Two values','Front is on the left; back is on the right.','q = deque([2, 4])',[A('Deque',[2,4],{pointers:{front:0,back:1}})]);
    add(d,'Add 1 at the front','appendleft changes the front.','q.appendleft(1)',[A('Deque',[1,2,4],{changed:[0],pointers:{front:0,back:2}})]);
    add(d,'Remove 4 at the back','pop removes from the opposite end.','removed = q.pop()',[A('Deque',[1,2],{pointers:{front:0,back:1}})],{Removed:4});
    topic('queue','Queue / deque','Front/back and operations on both ends.',[q,d]);
  }
  {
    const e=make('Next greater value — [2, 1, 3]'),a=[2,1,3],stack=[],answer=[null,null,null];
    const views=(i)=>[A('Input',a,{pointers:{i}}),R('Unresolved indices · top first',[...stack].reverse().map(j=>[`index ${j}`,`value ${a[j]}`])),A('Next greater values',answer)];
    add(e,'No values processed','The stack holds indices still waiting for a greater value.','stack = []',[...views(-1)]);
    for(let i=0;i<a.length;i++){
      while(stack.length&&a[stack.at(-1)]<a[i]){const j=stack.at(-1);add(e,`${a[i]} is greater than ${a[j]}`,'The comparison passes; the unresolved index is still on the stack.','nums[stack[-1]] < nums[i]',views(i),{Comparison:'True'});stack.pop();add(e,`Pop index ${j}`,'Removing an index and assigning its answer are separate events.','j = stack.pop()',views(i));answer[j]=a[i];add(e,`Answer for index ${j} is ${a[i]}`,'This is the first greater value encountered to its right.','answer[j] = nums[i]',views(i));}
      stack.push(i);add(e,`Push index ${i}`,'It now waits for a greater value.','stack.append(i)',views(i));
    }
    add(e,'Index 2 remains unresolved','No greater value appeared to its right. None means no answer in this example.','return answer',views(3));
    topic('monotonic-stack','Monotonic stack','Comparisons, pops and resolved answers shown separately.',[e]);
    const w=make('Sliding maximum — [1, 3, 2, 5], k = 2'),a2=[1,3,2,5],dq=[],out=[];
    const wv=i=>[A('Input',a2,{pointers:{right:i},current:Array.from({length:Math.min(2,i+1)},(_,j)=>i-j)}),R('Candidate deque · front first',dq.map(j=>[`index ${j}`,`value ${a2[j]}`])),A('Recorded maxima',out)];
    for(let i=0;i<a2.length;i++){
      if(dq.length&&dq[0]<=i-2){const j=dq.shift();add(w,`Expire index ${j}`,'It is outside the current window.','dq.popleft()',wv(i));}
      while(dq.length&&a2[dq.at(-1)]<=a2[i]){const j=dq.pop();add(w,`Remove weaker candidate ${a2[j]}`,`${a2[i]} is at least as large and stays in future windows longer.`,'dq.pop()',wv(i));}
      dq.push(i);add(w,`Add index ${i}`,'The deque stores indices, not duplicate copies of input values.','dq.append(right)',wv(i));
      if(i>=1){out.push(a2[dq[0]]);add(w,`Record maximum ${out.at(-1)}`,'The front candidate supplies this complete window’s maximum.','answer.append(nums[dq[0]])',wv(i));}
    }
    topic('monotonic-deque','Monotonic deque / window maximum','Expired indices versus weaker candidates.',[w]);
  }
  {
    const e=make('Frequency map — repeated characters');let counts={};
    const view=(key)=>R('Character → count',Object.entries(counts),{changed:key?[Object.keys(counts).indexOf(key)]:[]});
    add(e,'Map starts empty','No character has been stored.','counts = {}',[view()]);
    for(const key of ['a','b','a']){add(e,`Read count for ${key}`,`${key in counts?'Existing':'Missing'} key; the read gives ${counts[key]??0}.`,`counts.get('${key}', 0)`,[view()],{Read:counts[key]??0});counts[key]=(counts[key]??0)+1;add(e,`Store ${key}: ${counts[key]}`,'Only this entry changed.',`counts['${key}'] = counts.get('${key}', 0) + 1`,[view(key)]);}
    delete counts.b;add(e,'Delete key b','Deletion removes the entry, not just its display highlight.',"del counts['b']",[view()]);
    topic('hash-map','Hash map','Read, missing key, insert, update and delete.',[e]);
    const set=make('Set — membership and duplicates');let seen=[];
    const sv=()=>R('Seen values · display order only',seen);
    add(set,'Empty set','Display order has no algorithmic meaning.','seen = set()',[sv()]);
    for(const v of [2,4,2]){const exists=seen.includes(v);add(set,`Check ${v}`,exists?'The value is already present.':'The value is absent.',`${v} in seen`,[sv()],{Membership:exists?'True':'False'});if(!exists)seen.push(v);add(set,`Add ${v}`,exists?'Adding an existing value leaves the set unchanged.':'The set gains one member.',`seen.add(${v})`,[sv()],{Size:seen.length});}
    seen=seen.filter(v=>v!==2);add(set,'Remove 2','Only 4 remains.','seen.remove(2)',[sv()]);
    topic('set','Set','Membership, duplicate insertion and removal.',[set]);
  }
  const heapView=(a)=>G('Min-heap · final observed structure',a.map((v,i)=>({id:String(i),label:String(v),x:i===0?170:i===1?85:i===2?255:i===3?40:125,y:i===0?40:i<3?120:200,sub:`index ${i}`})),a.flatMap((_,i)=>i?[[String(Math.floor((i-1)/2)),String(i)]]:[]),{directed:false,height:255});
  {
    const e=make('Heap push / pop — operation boundaries');
    for(const [a,title,code,detail] of [[[2,5,4],'Initial heap','heap = [2, 5, 4]','Parents are no greater than their children.'],[[1,2,4,5],'Push 1 completed','heapq.heappush(heap, 1)','Show the resulting heap; do not invent internal sift snapshots.'],[[2,5,4],'Pop minimum completed','value = heapq.heappop(heap)','The removed minimum is 1. The root is now 2.']])add(e,title,detail,code,[heapView(a),A('Backing array',a)],{Minimum:a[0]});
    const k=make('Top 2 largest — bounded min-heap'),a=[4,1,7,3],h=[];
    for(const value of a){if(h.length<2){h.push(value);h.sort((x,y)=>x-y);add(k,`Keep ${value}`,'Fill the heap until it contains k candidates.','heappush(heap, value)',[heapView(h),A('Heap array',h)],{k:2});}else{const accepted=value>h[0];add(k,`Compare ${value} with cutoff ${h[0]}`,'The smallest retained value is the cutoff.','value > heap[0]',[heapView(h)],{Comparison:accepted?'True':'False'});if(accepted){h[0]=value;h.sort((x,y)=>x-y);add(k,`Replace cutoff with ${value}`,'Retain the two largest values seen so far.','heapreplace(heap, value)',[heapView(h),A('Heap array',h)]);}}}
    topic('heap','Heap / priority queue / Top-K','Heap tree linked to its array; no invented sift steps.',[e,k]);
  }
  {
    const e=make('Subsets — nested calls with explicit undo'),path=[],results=[],calls=[];
    const views=()=>[C('Calls and returns',calls,{current:[calls.length-1]}),A('Current path',path),R('Saved copies',results.map((r,i)=>[`result ${i}`,JSON.stringify(r)]))];
    function dfs(start,depth){calls.push({depth,text:`dfs(start=${start}, path=${JSON.stringify(path)})`});add(e,'Enter a call','The indentation shows which call owns the next choices.','dfs(start)',views());results.push([...path]);calls.push({depth:depth+1,text:`save ${JSON.stringify(path)}`});add(e,'Save a copy','This saved result will not change when the working path changes.','results.append(path.copy())',views());for(let i=start;i<2;i++){path.push(i+1);calls.push({depth:depth+1,text:`choose ${i+1}`});add(e,`Choose ${i+1}`,'Append happens before the child call.','path.append(nums[i])',views());dfs(i+1,depth+1);const removed=path.pop();calls.push({depth:depth+1,text:`undo ${removed}`});add(e,`Undo ${removed}`,'Returning did not remove this choice; this pop does.','path.pop()',views());}calls.push({depth,text:'← return',returned:true});add(e,'Return to the caller','The caller resumes with the current shared path.','return',views());}
    dfs(0,0);topic('backtracking','Backtracking','Revised nested-call design: choose, recurse, return, explicit undo and saved copies.',[e],'This replaces the rejected path-first design with the approved nested recursion style. The tiny Subsets example demonstrates copied results; aliases, pruning and swap-based permutations require their own execution evidence.');
    const p=make('Prefix sums — sum of indices 1 through 3'),a=[2,1,3,4],prefix=[0];
    add(p,'One leading zero','prefix[i] stores the sum before index i.','prefix = [0]',[A('Input',a),A('Prefix',prefix)]);
    for(let i=0;i<a.length;i++){prefix.push(prefix.at(-1)+a[i]);add(p,`Store prefix[${i+1}]`,`${prefix[i]} + ${a[i]} = ${prefix[i+1]}`,'prefix.append(prefix[-1] + nums[i])',[A('Input',a,{check:[i]}),A('Prefix',prefix,{changed:[i+1]})]);}
    add(p,'Select the two boundaries','Inclusive input range [1, 3] uses prefix[4] - prefix[1].','prefix[right + 1] - prefix[left]',[A('Input',a,{current:[1,2,3]}),A('Prefix',prefix,{check:[1,4]})],{Expression:'10 − 2',Result:8});
    topic('prefix','Prefix sums','Leading-zero convention and range boundaries.',[p]);
  }
  const graphNodes=['A','B','C','D'];
  const graphEdges=[['A','B'],['A','C'],['B','D'],['C','D']];
  const graphView=(active,seen=[],edges=graphEdges)=>G('Graph',graphNodes.map((id,i)=>n(id,[170,70,270,170][i],[35,120,120,215][i],id===active?'current':seen.includes(id)?'changed':'')),edges);
  {
    const b=make('Graph BFS — discover once'),q=['A'],seen=['A'],order=[];
    const bv=(active)=>[graphView(active,seen),A('Queue · front → back',q),A('Processed order',order)];
    add(b,'Discover A','Mark on discovery so another incoming edge cannot enqueue it twice.','seen.add(A); q.append(A)',bv(null));
    while(q.length){const v=q.shift();order.push(v);add(b,`Process ${v}`,'The active node has left the queue.','node = q.popleft()',bv(v));for(const [,to] of graphEdges.filter(([from])=>from===v)){const fresh=!seen.includes(to);add(b,`Check neighbor ${to}`,fresh?'This node has not been discovered.':'Already discovered; skip the repeated route.','neighbor not in seen',bv(v),{Check:fresh?'True':'False'});if(fresh){seen.push(to);add(b,`Mark ${to} discovered`,'Marking and queue insertion are distinct.','seen.add(neighbor)',bv(v));q.push(to);add(b,`Enqueue ${to}`,'Append the newly discovered node.','q.append(neighbor)',bv(v));}}}
    const d=make('Graph DFS — recursion and a shared visited set'),visited=[],stack=[],done=[];
    const dv=(active)=>[graphView(active,visited),R('Call stack · top first',[...stack].reverse()),A('First-visit order',done)];
    function dfs(v){if(visited.includes(v)){add(d,`Skip ${v}`,'This node was already visited through another edge.','if node in seen: return',dv(stack.at(-1)));return;}visited.push(v);done.push(v);stack.push(v);add(d,`Enter ${v}`,'Go deeper while preserving the caller on the stack.','dfs(node)',dv(v));for(const [,to] of graphEdges.filter(([from])=>from===v))dfs(to);stack.pop();add(d,`Return from ${v}`,'Resume the previous call; graph edges do not change.','return',dv(stack.at(-1)));}dfs('A');
    topic('graph','Graphs + BFS / DFS','Directed graph edges, discovery state, frontier and recursion.',[b,d]);
  }
  {
    const e=make('Union-find — compress a parent path');let parent=[0,0,1,3];
    const view=(active)=>[G('Parent pointers',parent.map((_,i)=>n(String(i),[50,130,210,290][i],115,i===active?'current':'',parent[i]===i?'root':'')),parent.flatMap((p,i)=>p===i?[]:[[String(i),String(p)]])),A('parent',parent)];
    add(e,'Two disjoint components','2 → 1 → 0 reaches root 0. Node 3 is its own root.','parent = [0, 0, 1, 3]',view(2),{Components:2});
    add(e,'Find follows the parent path','Inspect 2, then 1, then root 0. No parent has changed yet.','find(2)',view(0),{Path:'2 → 1 → 0'});
    parent[2]=0;add(e,'Compress node 2 directly to root 0','This is an actual parent assignment.','parent[2] = 0',view(2),{Components:2});
    parent[3]=0;add(e,'Union the two roots','Attach root 3 to root 0. The components merge.','parent[3] = 0',view(3),{Components:1});
    topic('union-find','Union-find','Parent forest, roots, union and path compression.',[e]);
    const t=make('Topological order — indegrees reach zero'),ind={A:0,B:1,C:1,D:2},ready=['A'],out=[];
    const tv=active=>[graphView(active,out),R('Remaining indegrees',Object.entries(ind)),A('Ready queue',ready),A('Output order',out)];
    add(t,'Start with zero-indegree nodes','Only A has no remaining prerequisites.','ready = [A]',tv(null));
    while(ready.length){const v=ready.shift();out.push(v);add(t,`Output ${v}`,'Process this node’s outgoing dependency edges.','node = ready.popleft(); order.append(node)',tv(v));for(const [,to] of graphEdges.filter(([from])=>from===v)){ind[to]--;add(t,`Decrement ${to} to ${ind[to]}`,'One prerequisite has been removed.','indegree[neighbor] -= 1',tv(v));if(ind[to]===0){ready.push(to);add(t,`${to} becomes ready`,'All its prerequisites have now been removed.','ready.append(neighbor)',tv(v));}}}
    const cycle=make('Topological sort — cycle blocks progress');add(cycle,'No node is ready','A depends on B and B depends on A. Both indegrees are 1.','ready = []',[G('Dependency cycle',[n('A',100,100),n('B',240,100)],[['A','B'],['B','A']]),R('Indegrees',[['A',1],['B',1]])]);add(cycle,'Report an incomplete order','Zero processed nodes out of two means no topological order exists.','len(order) != number_of_nodes',[A('Output',[])],{Processed:'0 / 2',Result:'Cycle detected'});
    topic('topological','Topological sorting','Ready nodes, indegrees, output order and cycle failure.',[t,cycle]);
  }
  {
    const e=make('Dijkstra — improved distance and stale queue entry'),edges=[['A','B',4],['A','C',1],['C','B',2],['B','D',1],['C','D',5]],dist={A:0,B:'∞',C:'∞',D:'∞'},pq=[[0,'A']],settled=[];
    const views=active=>[graphView(active,settled,edges),R('Distances',Object.entries(dist)),R('Priority queue · smallest distance first',pq.map(([d,v])=>[v,d]))];
    add(e,'Start at A','Nonnegative weights allow settling the smallest current distance.','dist[A] = 0; heappush(pq, (0, A))',views(null));
    while(pq.length){pq.sort((a,b)=>a[0]-b[0]);const [d,v]=pq.shift();add(e,`Pop (${d}, ${v})`,'Compare the queued distance with the latest stored distance.','d, node = heappop(pq)',views(v));if(d!==dist[v]){add(e,`Skip stale entry for ${v}`,`Stored distance ${dist[v]} is better than queued distance ${d}.`,'if d != dist[node]: continue',views(v));continue;}settled.push(v);for(const [,to,w] of edges.filter(([from])=>from===v)){const cand=d+w,better=dist[to]==='∞'||cand<dist[to];add(e,`Try ${v} → ${to}`,`${d} + ${w} = ${cand}; ${better?'improves':'does not improve'} ${dist[to]}.`,'candidate < dist[neighbor]',views(v),{Comparison:better?'True':'False'});if(better){dist[to]=cand;add(e,`Store distance ${cand} for ${to}`,'The priority queue has not yet received this update.','dist[neighbor] = candidate',views(v));pq.push([cand,to]);pq.sort((a,b)=>a[0]-b[0]);add(e,`Queue ${to} at distance ${cand}`,'Older entries remain until popped and checked.','heappush(pq, (candidate, neighbor))',views(v));}}}
    topic('dijkstra','Dijkstra','Weighted edges, relaxation and stale priority-queue entries.',[e],'Only nonnegative edge weights are covered. Relaxation comparisons, distance writes and queue insertions need separate observed events; a highlighted edge alone is not a successful relaxation.');
  }
  {
    const e=make('Trie — insert cat / car, then search ca'),nodes=[{id:'root',label:'•',x:170,y:30}],edges=[];
    const views=active=>[G('Character trie',nodes.map(v=>({...v,state:v.id===active?'current':''})),edges,{height:310})];
    add(e,'An empty root','The root stores no character.','root = TrieNode()',views('root'));
    for(const [id,parent,x,y] of [['c','root',170,100],['a','c',170,170],['t','a',100,245]]){nodes.push({id,label:id,x,y});edges.push([parent,id]);add(e,`Create ${id}`,'One missing edge is added.','node.children[ch] = TrieNode()',views(id));}
    nodes.find(v=>v.id==='t').sub='word end';add(e,'Mark cat as a complete word','Existing characters alone are not a word-ending flag.','node.is_word = True',views('t'));
    nodes.push({id:'r',label:'r',x:240,y:245,sub:'word end'});edges.push(['a','r']);add(e,'Insert car using the shared prefix','c and a are reused; r is a new branch and word end.','insert("car")',views('r'));
    add(e,'Search ca reaches a','The path exists, but a is not marked as a word end.','search("ca")',views('a'),{Prefix:'True',WholeWord:'False'});
    topic('trie','Trie','Shared prefixes, character edges and word-ending flags.',[e]);
    const m=make('Merge overlapping intervals'),input=[[1,3],[2,6],[8,9]],merged=[];
    add(m,'Sorted by start','The timeline makes overlap visible.','intervals.sort()', [I('Input intervals',input)]);
    merged.push([1,3]);add(m,'Start the first interval','No earlier output interval exists.','merged.append([1, 3])',[I('Input',input),I('Merged',merged)]);
    add(m,'Check overlap','2 ≤ 3 is True. The output endpoint has not changed yet.','start <= merged[-1][1]',[I('Input',input,{check:[1]}),I('Merged',merged)],{Comparison:'True'});
    merged[0][1]=6;add(m,'Extend the end to 6','The merged interval now covers both overlapping inputs.','merged[-1][1] = max(3, 6)',[I('Merged',merged,{changed:[0]})]);
    merged.push([8,9]);add(m,'Keep a separate interval','8 > 6 leaves a gap.','merged.append([8, 9])',[I('Merged',merged,{changed:[1]})]);
    const select=make('Interval scheduling — keep compatible intervals');add(select,'Consider the earliest finishing interval','Sort by finish time, not start time.','sort(key=end)',[I('Candidates',[[1,3],[2,5],[4,6]],{check:[0]})]);add(select,'Keep [1, 3], skip [2, 5]','The second interval starts before the retained interval ends.','start < last_end',[I('Retained',[[1,3]]),I('Rejected overlap',[[2,5]],{check:[0]})]);add(select,'Keep [4, 6]','4 ≥ 3 leaves the intervals compatible.','selected.append([4, 6])',[I('Retained',[[1,3],[4,6]],{changed:[1]})]);
    topic('intervals','Intervals','Timeline views for merging and greedy interval selection.',[m,select]);
  }
  {
    const insertion=make('Insertion sort — hold, shift, insert'),a=[4,2,3];
    add(insertion,'One-value sorted prefix','The first value alone is sorted.','for i in range(1, len(nums))',[A('Array',a,{current:[0]})]);
    for(let i=1;i<a.length;i++){const key=a[i];let j=i-1;add(insertion,`Hold key ${key}`,'The key is saved while larger values shift right.','key = nums[i]',[A('Array',a,{pointers:{i,j}})],{HeldKey:key});while(j>=0&&a[j]>key){a[j+1]=a[j];add(insertion,`Shift ${a[j]} right`,'Temporary duplicates are expected: the key is held separately.','nums[j+1] = nums[j]',[A('Array',a,{changed:[j+1],pointers:{j}})],{HeldKey:key});j--;}a[j+1]=key;add(insertion,`Insert ${key}`,`Indices 0 through ${i} are now sorted.`,'nums[j+1] = key',[A('Array',a,{changed:[j+1],current:Array.from({length:i+1},(_,j)=>j)})]);}
    const merge=make('Merge sort — merge two sorted runs'),left=[2,4],right=[1,3],out=[];let i=0,j=0;
    const mv=()=>[A('Left sorted run',left,{pointers:{i},dim:Array.from({length:i},(_,k)=>k)}),A('Right sorted run',right,{pointers:{j},dim:Array.from({length:j},(_,k)=>k)}),A('Merged output',out)];
    add(merge,'Merge phase','These two runs are already sorted by their recursive calls.','merge(left, right)',mv());
    while(i<left.length||j<right.length){const useLeft=j===right.length||(i<left.length&&left[i]<=right[j]);add(merge,'Choose the next value',i===left.length||j===right.length?'One run is exhausted; take the remaining run.':`${left[i]} ≤ ${right[j]} is ${useLeft?'True':'False'}.`,'left[i] <= right[j]',mv());const value=useLeft?left[i++]:right[j++];out.push(value);add(merge,`Append ${value}`,'Advance only the pointer for the run that supplied this value.','output.append(chosen)',mv());}
    const quick=make('Quicksort — one Lomuto partition'),q=[4,1,3,2],pivot=2;let boundary=0;
    add(quick,'Choose the last value as pivot','This preview covers one partition; sorting each side follows recursively.','pivot = nums[high]',[A('Array',q,{pointers:{pivot:3,boundary:0}})],{Pivot:pivot});
    for(let scan=0;scan<3;scan++){const smaller=q[scan]<pivot;add(quick,`Compare ${q[scan]} with pivot ${pivot}`,'Values before boundary are smaller than the pivot.','nums[scan] < pivot',[A('Array',q,{pointers:{scan,boundary,pivot:3},check:[scan]})],{Comparison:smaller?'True':'False'});if(smaller){[q[boundary],q[scan]]=[q[scan],q[boundary]];add(quick,'Swap into the smaller region','Swap values first; boundary advances afterward.','nums[boundary], nums[scan] = nums[scan], nums[boundary]',[A('Array',q,{changed:[boundary,scan],pointers:{boundary,scan,pivot:3}})]);boundary++;add(quick,'Advance the boundary','The smaller-than-pivot region grows by one.','boundary += 1',[A('Array',q,{pointers:{boundary,scan,pivot:3}})]);}}
    [q[boundary],q[3]]=[q[3],q[boundary]];add(quick,'Place the pivot','Only the pivot position is final. The right side still needs sorting.','swap(nums[boundary], nums[high])',[A('Array',q,{changed:[boundary,3],pointers:{pivot:boundary}})]);
    topic('sorting','Sorting','Three distinct views: insertion, merge and quicksort partition.',[insertion,merge,quick],'These are representative sorting previews, not a promise that every sorting algorithm is implemented. Keep held values and temporary duplicates visible. Merge uses separate runs; quicksort distinguishes a partition from a fully sorted array.');
  }
  {
    const grid=make('2D DP — paths around an obstacle'),dp=[[1,1,1],[1,0,null],[1,null,null]],blocked='1,1';
    const gv=(read=[],write=[])=>T('Paths to each cell',dp,{check:read,changed:write,note:'Cell [1,1] is blocked. Its 0 is an actual initialized count.'});
    add(grid,'Initialize borders and obstacle','This 3×3 grid has one blocked center cell. Unknown entries are None.','initialize dp',[gv()]);
    for(const [r,c] of [[1,2],[2,1],[2,2]]){const a=dp[r-1][c],b=dp[r][c-1];add(grid,`Read dependencies for [${r},${c}]`,`${a} from above + ${b} from the left. The destination is still unfilled.`,`dp[${r-1}][${c}] + dp[${r}][${c-1}]`,[gv([`${r-1},${c}`,`${r},${c-1}`])],{Expression:`${a} + ${b}`,Blocked:blocked});dp[r][c]=a+b;add(grid,`Store ${a+b} at [${r},${c}]`,'Highlight the completed write separately.','dp[r][c] = above + left',[gv([], [`${r},${c}`])]);}
    const coin=make('DP with min — coin change, amount 4'),coins=[1,3],d=[0,'∞','∞','∞','∞'];
    add(coin,'Zero coins make amount zero','Infinity means unreachable so far, not unknown.','dp = [0, inf, inf, inf, inf]',[A('Minimum coin count',d)]);
    for(let amount=1;amount<=4;amount++)for(const c of coins.filter(c=>c<=amount)){const candidate=d[amount-c]+1;add(coin,`Try coin ${c} for amount ${amount}`,`Read dp[${amount-c}] + 1 = ${candidate}.`,'candidate = dp[amount - coin] + 1',[A('Minimum coin count',d,{check:[amount-c],pointers:{amount}})],{Candidate:candidate});d[amount]=d[amount]==='∞'?candidate:Math.min(d[amount],candidate);add(coin,`Keep minimum ${d[amount]}`,'The destination may remain unchanged when another candidate is worse.','dp[amount] = min(dp[amount], candidate)',[A('Minimum coin count',d,{current:[amount]})]);}
    const memo=make('Tuple-key memo — reuse a solved subproblem'),calls=[{depth:0,text:'paths(row=0, col=0)'},{depth:1,text:'paths(row=1, col=1)'},{depth:2,text:'combine child results: 1 + 1 = 2'}];
    add(memo,'A subproblem finishes','The tuple identifies a state, not a node address.','answer = down + right',[C('Calls',calls,{current:[2]}),R('Memo',[])],{Answer:2});
    add(memo,'Store result for (1, 1)','Only now is the memo entry available.','memo[(1, 1)] = 2',[C('Calls',calls),R('Memo', [['(1, 1)',2]],{changed:[0]})]);
    calls.push({depth:1,text:'← return 2',returned:true},{depth:1,text:'paths(row=1, col=1) — another route'});add(memo,'Call the same state again','The existence of a key is not yet proof that it was read.','paths(1, 1)',[C('Calls',calls,{current:[4]}),R('Memo',[['(1, 1)',2]])]);
    calls.push({depth:2,text:'reuse memo[(1, 1)] → 2',returned:true});add(memo,'Return the stored value','No child calls expand on this invocation.','return memo[(row, col)]',[C('Calls',calls,{current:[5]}),R('Memo',[['(1, 1)',2]],{current:[0]})]);
    const cache=make('Decorator cache — a call served without entering the body');
    add(cache,'First request for fib(2)','The wrapped function executes and returns 1.','fib(2)',[C('Observed calls',[{depth:0,text:'fib(2)'},{depth:1,text:'fib(1) → 1',returned:true},{depth:1,text:'fib(0) → 0',returned:true},{depth:0,text:'← return 1',returned:true}])],{CacheMisses:3});
    add(cache,'Second request for fib(2)','The wrapper serves 1. There is no second function-body frame.','fib(2)',[C('Observed requests',[{depth:0,text:'fib(2) → 1 (computed)',returned:true},{depth:0,text:'fib(2) → 1 (served by cache)',returned:true}]),R('Wrapper evidence',[['Hits before',0],['Hits after',1]])],{Result:1});
    topic('dp-variants','DP / memoization extensions','2D tables, min recurrences, tuple keys and decorator caches.',[grid,coin,memo,cache],'Decorator hits need wrapper-level evidence because a cached request does not create a Python body frame. This preview illustrates the intended result; it does not claim that current tracing can already observe it. Custom decorators and ambiguous cache attribution must fall back.');
  }
  {
    const e=make('Longest substring without repeating characters'),s=[...'abba'],seen={};let best=0,left=0;
    const views=right=>[A('Characters',s,{pointers:{left,right},current:Array.from({length:Math.max(0,right-left+1)},(_,i)=>left+i)}),R('Counts inside window',Object.entries(seen))];
    for(let right=0;right<s.length;right++){seen[s[right]]=(seen[s[right]]??0)+1;add(e,`Include ${s[right]}`,'Adding a character may make the window invalid.','count[s[right]] += 1',views(right),{BestLength:best});while(seen[s[right]]>1){add(e,'A duplicate is present','The condition is checked before any removal.','count[s[right]] > 1',views(right),{Condition:'True'});seen[s[left]]--;add(e,`Remove one ${s[left]}`,'Its count changes before left advances.','count[s[left]] -= 1',views(right));left++;add(e,'Advance left','The window’s membership now matches the updated counts.','left += 1',views(right));}add(e,'Window has no duplicate','The shrinking condition is now False.','count[s[right]] > 1',views(right),{Condition:'False'});best=Math.max(best,right-left+1);add(e,`Record best length ${best}`,'Compare only after restoring validity.','best = max(best, right-left+1)',views(right),{BestLength:best});}
    const cover=make('Required-character window — cover A and B');add(cover,'Window contains A only','One of two required character kinds is satisfied.','count[A] += 1',[A('Text',['A','X','B'],{current:[0],pointers:{left:0,right:0}}),R('Requirement / observed',[['A','1 / 1'],['B','0 / 1']])],{Satisfied:'1 / 2'});add(cover,'Expand through B','X is inside the window but is not a requirement.','count[B] += 1',[A('Text',['A','X','B'],{current:[0,1,2],pointers:{left:0,right:2}}),R('Requirement / observed',[['A','1 / 1'],['B','1 / 1']])],{Satisfied:'2 / 2'});add(cover,'Save the valid window','All required counts are met.','best = [left, right]',[A('Text',['A','X','B'],{current:[0,1,2]})],{Saved:'AXB',Length:3});add(cover,'Remove A to try shrinking','The window becomes invalid; shrinking must stop.','count[A] -= 1; left += 1',[A('Text',['A','X','B'],{current:[1,2],pointers:{left:1,right:2}}),R('Requirement / observed',[['A','0 / 1'],['B','1 / 1']])],{Satisfied:'1 / 2'});
    topic('frequency-window','Frequency / string windows','Counts, validity checks, shrinking and saved answers.',[e,cover]);
  }
  {
    function bound(mode){const e=make(mode==='half'?'Half-open lower bound — insertion position':mode==='first'?'First occurrence among duplicates':'Last occurrence among duplicates'),a=[1,3,3,3,5],target=3;let low=0,high=mode==='half'?a.length:a.length-1,result=-1;
      const views=(mid)=>[A('Sorted values',a,{pointers:mid===undefined?{low,high}:{low,mid,high},current:a.flatMap((_,i)=>i>=low&&(mode==='half'?i<high:i<=high)?[i]:[]),check:mid===undefined?[]:[mid],note:mode==='half'?`[${low}, ${high}) · high excluded`:`[${low}, ${high}] · inclusive`})];
      add(e,'Initialize the search bounds',mode==='half'?'high = length is a boundary, not an array cell.':'Keep searching after equality to find the requested boundary.','initialize low, high',views(),{Target:target});
      while(mode==='half'?low<high:low<=high){const mid=Math.floor((low+high)/2);add(e,`Compute midpoint ${mid}`,'A new midpoint belongs to these bounds.','mid = (low + high) // 2',views(mid));const val=a[mid];add(e,`Compare ${val} with ${target}`,'The previous candidate result does not decide which occurrence to return.','compare nums[mid] with target',views(mid),{Equality:val===target?'True':'False',Saved:result});if(mode==='half'){if(val<target)low=mid+1;else high=mid;}else{if(val===target){result=mid;add(e,`Remember index ${mid}`,'Save this match, then continue toward the requested end.','result = mid',views(mid),{Saved:result});}if(val<target||(val===target&&mode==='last'))low=mid+1;else high=mid-1;}add(e,'Move the bounds','The old midpoint is no longer active.','update low / high',views(),{Saved:result});}
      add(e,'Return the boundary',mode==='half'?'The insertion index is the first value not less than target.':'No candidates remain; return the last saved matching index.',mode==='half'?'return low':'return result',[...views()],{Result:mode==='half'?low:result});return e;}
    const rotated=make('Rotated sorted array — identify the sorted half'),a=[4,5,6,7,0,1,2];let low=0,high=6;
    const rv=(mid)=>A('Rotated values',a,{pointers:mid===undefined?{low,high}:{low,mid,high},current:a.flatMap((_,i)=>i>=low&&i<=high?[i]:[]),check:mid===undefined?[]:[mid]});
    add(rotated,'Midpoint is 7','The left half [4,5,6,7] is sorted. Target is 0.','nums[low] <= nums[mid]',[rv(3)],{SortedHalf:'left',Target:0});
    add(rotated,'Target is outside the sorted left half','4 ≤ 0 < 7 is False.','nums[low] <= target < nums[mid]',[rv(3)],{Comparison:'False'});low=4;add(rotated,'Search the right half','No midpoint is active until recalculated.','low = mid + 1',[rv()]);
    add(rotated,'Midpoint is 1','The sorted left half [0,1] contains the target.','mid = 5; check target range',[rv(5)],{Comparison:'True'});high=4;add(rotated,'Narrow to index 4','Recompute midpoint before reading this candidate.','high = mid - 1',[rv()]);add(rotated,'Read midpoint 4 and confirm equality','nums[4] is 0, matching the target.','nums[mid] == target',[rv(4)],{Result:4});
    const space=make('Answer-space search — minimum feasible speed'),piles=[3,6,7];low=1;high=7;
    const av=mid=>[A('Candidate speeds',[1,2,3,4,5,6,7],{current:Array.from({length:high-low+1},(_,i)=>i+low-1),check:mid?[mid-1]:[],note:`Speed domain [${low}, ${high}] · values, not indices`}),A('Piles',piles)];
    while(low<high){const mid=Math.floor((low+high)/2),hours=piles.map(p=>Math.ceil(p/mid)),ok=hours.reduce((a,b)=>a+b,0)<=6;add(space,`Try speed ${mid}`,'Evaluate the feasibility function before moving either bound.','hours = sum(ceil(pile / speed))',av(mid),{Hours:hours.join(' + '),Budget:6,Feasible:ok?'True':'False'});if(ok)high=mid;else low=mid+1;add(space,'Update the feasible boundary','A feasible midpoint keeps the possibility of a smaller answer.','high = mid if feasible else low = mid + 1',av());}
    add(space,'Minimum feasible speed is 3','The domain has narrowed to one candidate.','return low',av(),{Result:low});
    topic('binary-variants','Binary-search variants','Half-open bounds, first/last matches, rotated arrays and answer-space search.',[bound('half'),bound('first'),bound('last'),rotated,space],'Each convention needs its own source binding. Domain values must not be displayed as array indices. The rotated example assumes distinct values; duplicate-heavy rotated search needs a separate policy.');
  }
  {
    const inline=make('Two-sum — compare the inline expression');add(inline,'Read both operands','No named sum variable is required.','nums[left] + nums[right] == target',[A('Sorted array',[1,2,4,6],{pointers:{left:0,right:3},check:[0,3]})],{Expression:'1 + 6 = 7',Target:8,Equality:'False'});add(inline,'Move left','The new pair is not evaluated on the same event.','left += 1',[A('Sorted array',[1,2,4,6],{pointers:{left:1,right:3}})]);add(inline,'Compare the new pair','2 + 6 equals the target.','nums[left] + nums[right] == target',[A('Sorted array',[1,2,4,6],{pointers:{left:1,right:3},check:[1,3]})],{Expression:'2 + 6 = 8',Equality:'True'});
    function palindrome(word){const e=make(`Palindrome scan — ${word}`),a=[...word];let left=0,right=a.length-1,valid=true;while(left<right){const same=a[left]===a[right];add(e,`Compare ${a[left]} and ${a[right]}`,'Compare characters at opposite ends.','s[left] == s[right]',[A('Characters',a,{pointers:{left,right},check:[left,right]})],{Equality:same?'True':'False'});if(!same){valid=false;break;}left++;right--;add(e,'Move inward','Pointer movement is separate from the next comparison.','left += 1; right -= 1',[A('Characters',a,{pointers:{left,right}})]);}add(e,`Return ${valid?'True':'False'}`,valid?'All required mirrored pairs matched.':'A mismatched pair stops this scan.','return result',[A('Characters',a,{pointers:{left,right}})],{Result:valid?'True':'False'});return e;}
    const partition=make('Partition — evens before odds');add(partition,'Check the two ends','3 belongs on the odd side; 4 belongs on the even side.','inspect parity',[A('Array',[3,2,1,4],{pointers:{left:0,right:3},check:[0,3]})]);add(partition,'Swap misplaced values','Values exchange positions. This does not sort either region.','nums[left], nums[right] = nums[right], nums[left]',[A('Array',[4,2,1,3],{changed:[0,3],pointers:{left:0,right:3}})]);add(partition,'Advance through correctly placed values','The pointers cross between the two regions.','advance left / right',[A('Array',[4,2,1,3],{pointers:{left:2,right:1},note:'Even region [0,2) · odd region [2,4)'})]);
    topic('two-pointer-variants','Two-pointer variants','Inline expressions, palindrome scans and partitioning.',[inline,palindrome('abba'),palindrome('abca'),partition]);
  }
  {
    const e=make('Grid BFS — check, visit, enqueue'),grid=[[0,1],[0,0]],q=[[0,0]];
    const views=(current,check=[])=>[T('Grid · 1 = wall, 0 = unvisited, V = visited',grid,{current:[current],check}),R('Queue',q.map(p=>[`(${p.join(', ')})`,'waiting']))];
    q.shift(); grid[0][0]='V';
    add(e,'Process (0, 0)','The cell is removed from the waiting queue.','row, col = q.popleft()',views('0,0'));
    add(e,'Reject an out-of-bounds neighbor','(-1, 0) is not inside the grid. No cell is highlighted for it.','0 <= nr < rows and 0 <= nc < cols',views('0,0'),{Candidate:'(-1, 0)',Check:'False'});
    add(e,'Reject the wall at (0, 1)','This candidate is inside bounds, but its value blocks traversal.','grid[nr][nc] == 0',views('0,0',['0,1']),{Check:'False'});
    add(e,'Accept candidate (1, 0)','The condition passes. The cell has not been marked or enqueued yet.','grid[nr][nc] == 0',views('0,0',['1,0']),{Check:'True'});
    grid[1][0]='V';add(e,'Mark (1, 0) visited','The grid write completed before queue insertion.','grid[nr][nc] = visited',views('0,0',['1,0']));q.push([1,0]);add(e,'Enqueue (1, 0)','The candidate is now waiting for processing.','q.append((nr, nc))',views('0,0',['1,0']));
    topic('grid-bfs','Grid BFS — condition and playback polish','Separate predicate outcomes, writes and queue events; history jumps and timeline.',[e],'Production must establish predicate outcomes from execution, not re-run user conditions. Out-of-bounds candidates are text-only. The review gallery timeline is illustrative; production event markers must map to existing trace indices.');
  }
  {
    const edge=[['A','B'],['B','C'],['C','B']];
    const view=(slow,fast)=>G('Next links · C loops back to B',[n('A',55,125,slow==='A'?'current':'',slow==='A'?'slow':''),n('B',170,125,slow==='B'?'current':'', [slow==='B'?'slow':'',fast==='B'?'fast':''].filter(Boolean).join(' · ')),n('C',285,125,fast==='C'?'check':'', [slow==='C'?'slow':'',fast==='C'?'fast':''].filter(Boolean).join(' · '))],edge);
    const e=make('Slow / fast — confirm a meeting');add(e,'Both pointers start at A','Starting together does not confirm a cycle.','slow = fast = head',[G('Next links',[n('A',55,125,'current','slow · fast'),n('B',170,125),n('C',285,125)],edge)],{Comparison:'Not checked'});add(e,'Move slow to B','fast has not advanced yet.','slow = slow.next',[G('Next links',[n('A',55,125,'check','fast'),n('B',170,125,'current','slow'),n('C',285,125)],edge)]);add(e,'Move fast through B to C','The intermediate hop is not a separate variable assignment.','fast = fast.next.next',[view('B','C')]);add(e,'Compare B and C','They are different nodes.','slow == fast',[view('B','C')],{Equality:'False'});add(e,'Move slow to C','Both now point to C, but the next fast update has not happened yet.','slow = slow.next',[view('C','C')],{Comparison:'Not checked'});add(e,'Move fast C → B → C','fast is assigned back to C after two hops.','fast = fast.next.next',[view('C','C')]);add(e,'Confirm the meeting','The executed equality check confirms the cycle.','slow == fast',[view('C','C')],{Equality:'True',Result:'Cycle detected'});
    const entrance=make('Cycle entrance — reset one pointer to head');add(entrance,'Meeting at C is already confirmed','The meeting node is not necessarily the entrance.','meeting = C',[view('C','C')]);add(entrance,'Reset one pointer to A','The other remains at the meeting node.','entry = head',[G('Next links',[n('A',55,125,'current','entry'),n('B',170,125),n('C',285,125,'check','meeting')],edge)]);add(entrance,'Compare A and C','They are not equal; advance both one link.','entry == meeting',[G('Next links',[n('A',55,125,'current','entry'),n('B',170,125),n('C',285,125,'check','meeting')],edge)],{Equality:'False'});add(entrance,'Move entry to B','The meeting pointer is still C.','entry = entry.next',[G('Next links',[n('A',55,125),n('B',170,125,'current','entry'),n('C',285,125,'check','meeting')],edge)]);add(entrance,'Move the other pointer to B','Both pointers advanced one link from their phase-two starting points.','meeting = meeting.next',[G('Next links',[n('A',55,125),n('B',170,125,'current','entry · meeting'),n('C',285,125)],edge)]);add(entrance,'Confirm entrance B','Equality now identifies the first node of the cycle.','entry == meeting',[G('Next links',[n('A',55,125),n('B',170,125,'changed','entrance'),n('C',285,125)],edge)],{Equality:'True',Result:'Node B'});
    const empty=make('No cycle — empty input');add(empty,'head is None','There is no node for either pointer.','slow = fast = head',[R('Pointers',[['slow','None'],['fast','None']])]);add(empty,'Loop guard is False','Return False without an equality-based cycle claim.','while fast and fast.next',[R('Pointers',[['slow','None'],['fast','None']])],{Result:'False'});
    const tail=make('No cycle — fast reaches the tail');
    const tv=()=>G('Acyclic next links',[n('A',55,125),n('B',170,125,'current','slow'),n('C',285,125,'check','fast · next: None')],[['A','B'],['B','C']]);
    add(tail,'Advance slow once and fast twice','Starting from A, slow reaches B and fast reaches C.','slow = slow.next; fast = fast.next.next',[tv()]);
    add(tail,'Compare the node identities','B and C are different nodes.','slow == fast',[tv()],{Equality:'False'});
    add(tail,'Stop at the tail','fast.next is None, so the loop guard is False.','while fast and fast.next',[tv()],{Result:'False · no cycle'});
    topic('slow-fast','Slow / fast + cycle entrance','Meeting detection, phase-two entrance search and empty input.',[e,entrance,tail,empty]);
  }
  for (const family of REVIEW) for (const example of family.examples) example.start = Math.min(2, example.steps.length - 1);
})();
