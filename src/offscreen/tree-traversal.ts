import type { DataStructureState, Snapshot, StackFrame, TreeTraversal, TreeTraversalEvent } from '../shared/types';

interface Node { id: string; val: unknown; left: Node | null; right: Node | null }
interface TreeRef { name: string; root: Node; frameId: string; frameName: string }
type Binding = NonNullable<StackFrame['treeNode']>;
function nodes(root: Node | null, out: Node[] = []): Node[] {
  if (root) { out.push(root); nodes(root.left, out); nodes(root.right, out); }
  return out;
}
function trees(snapshot: Snapshot): TreeRef[] {
  return Object.entries(snapshot.variables).flatMap(([name, variable]) => {
    const value = variable.value as { __type?: string; root?: Node } | null;
    return value?.__type === 'tree' && value.root?.id
      ? [{name, root: value.root, frameId: snapshot.frameId, frameName: snapshot.frameName}] : [];
  });
}
/** Replace current subtrees immutably, so an inner mutation updates the enclosing
 * diagram without changing any earlier snapshot. Current serialization wins. */
function patch(root: Node, replacements: Map<string, Node>): Node {
  const replacement = replacements.get(root.id);
  if (replacement) return replacement;
  const left = root.left ? patch(root.left, replacements) : null;
  const right = root.right ? patch(root.right, replacements) : null;
  return left === root.left && right === root.right ? root : {...root, left, right};
}

/** Replay execution once, not playback navigation. Never infer visits from SVG
 * layout or predict unexecuted branches. Ambiguous multi-node calls abstain. */
export function enrichTreeSnapshots(snapshots: Snapshot[], colorOf: (name: string) => string): Snapshot[] {
  const recursive = new Set<string>();
  const parameterNames = new Map<string, Set<string>>();
  const ambiguous = new Set<string>();
  for (const s of snapshots) {
    const names = s.callStack.map(f => f.frameName);
    for (const name of names) if (names.filter(n => n === name).length > 1) recursive.add(name);
    if (s.event !== 'call') continue;
    const refs = trees(s).filter(t => t.name !== 'return' && !t.name.startsWith('self.'));
    if (new Set(refs.map(t => t.root.id)).size > 1) ambiguous.add(s.frameName);
    else if (refs.length) {
      const known = parameterNames.get(s.frameName) ?? new Set<string>();
      refs.forEach(t => known.add(t.name));
      parameterNames.set(s.frameName, known);
    }
  }
  const parameters = new Map<string, string>();
  for (const [fn, names] of parameterNames) {
    if (recursive.has(fn) && !ambiguous.has(fn) && names.size === 1) parameters.set(fn, [...names][0]);
  }

  const frameTrees = new Map<string, TreeRef[]>();
  const bindings = new Map<string, Binding>();
  const history = new Map<string, {entered: TreeTraversal['entered']; returned: string[]; events: TreeTraversalEvent[]}>();
  for (const snapshot of snapshots) {
    const live = new Set(snapshot.callStack.map(f => f.frameId));
    for (const id of frameTrees.keys()) if (!live.has(id)) frameTrees.delete(id);
    for (const id of bindings.keys()) if (!live.has(id)) bindings.delete(id);
    const current = trees(snapshot);
    const replacements = new Map(current.map(t => [t.root.id, t.root]));
    frameTrees.set(snapshot.frameId, current.filter(t => t.name !== 'return'));
    for (const [id, refs] of frameTrees) {
      frameTrees.set(id, refs.map(t => ({...t, root: patch(t.root, replacements)})));
    }
    const parameter = parameters.get(snapshot.frameName);
    if (parameter && snapshot.event === 'call') {
      const v = snapshot.variables[parameter];
      const tree = current.find(t => t.name === parameter);
      if (tree || v?.value === null) bindings.set(snapshot.frameId, {
        name: parameter, nodeId: tree?.root.id ?? null, value: tree?.root.val ?? null,
      });
    }
    snapshot.callStack = snapshot.callStack.map(f => bindings.has(f.frameId) ? {...f, treeNode: bindings.get(f.frameId)} : f);

    const candidates = snapshot.callStack.flatMap(f => frameTrees.get(f.frameId) ?? []);
    candidates.push(...current.filter(t => t.name === 'return'));
    // Include module-level trees even though module frames aren't in callStack.
    if (!snapshot.callStack.length) candidates.push(...current);
    const bySize = candidates.map(t => ({...t, nodes: nodes(t.root)})).sort((a,b) => b.nodes.length - a.nodes.length);
    const primary: typeof bySize = [];
    for (const t of bySize) if (!primary.some(p => p.nodes.some(n => n.id === t.root.id))) primary.push(t);
    const usedNames = new Set(snapshot.dataStructures.filter(ds => ds.type !== 'tree').map(ds => ds.id));
    const diagrams: DataStructureState[] = primary.map(owner => {
      const id = usedNames.has(owner.name) ? owner.frameId + ':' + owner.name : owner.name;
      usedNames.add(id);
      const index = new Map(owner.nodes.map((n,i) => [n.id,i]));
      const ds: DataStructureState = {
        id, displayName: owner.name, type: 'tree', data: {__type:'tree', root:owner.root}, pointers: [],
        treeContext: owner.frameId !== snapshot.frameId ? owner.frameName : undefined,
        nodePointers: current.filter(t => index.has(t.root.id)).map(t => ({
          name: t.name, nodeIndex: index.get(t.root.id)!, color: colorOf(t.name),
        })),
      };
      const key = owner.frameId + ':' + owner.root.id;
      const h = history.get(key) ?? {entered: [], returned: [], events: []};
      const relevantFrames = snapshot.callStack.filter(f => f.treeNode &&
        (f.treeNode.nodeId === null || index.has(f.treeNode.nodeId)));
      const currentBinding = bindings.get(snapshot.frameId);
      const relevantBinding = currentBinding && (currentBinding.nodeId === null ||
        index.has(currentBinding.nodeId)) ? currentBinding : undefined;
      // A null child belongs only to the tree its enclosing node call belongs to.
      const ancestor = snapshot.callStack.slice(0,-1).reverse()
        .find(f => f.treeNode?.nodeId)?.treeNode;
      const belongs = relevantBinding && (relevantBinding.nodeId !== null || (ancestor?.nodeId && index.has(ancestor.nodeId)));
      let action: TreeTraversalEvent | undefined;
      if (belongs && (snapshot.event === 'call' || snapshot.event === 'return')) {
        action = {
          kind: snapshot.event === 'return' ? 'return' : relevantBinding.nodeId === null ? 'empty' : 'enter',
          nodeId: relevantBinding.nodeId, value: relevantBinding.value, parentId: ancestor?.nodeId ?? null,
          step: snapshot.step, frameName: snapshot.frameName,
        };
        if (action.kind === 'enter' && !h.entered.some(e => e.nodeId === action!.nodeId)) {
          h.entered = [...h.entered, {nodeId: action.nodeId!, value: action.value, step: action.step}];
        }
        if (action.kind === 'return' && action.nodeId && !h.returned.includes(action.nodeId)) {
          h.returned = [...h.returned, action.nodeId];
        }
        h.events = [...h.events.slice(-39), action];
      }
      if (h.entered.length || belongs) {
        const active = relevantFrames.at(-1)?.treeNode;
        ds.traversal = {
          currentNodeId: belongs ? relevantBinding.nodeId : active?.nodeId ?? null,
          path: [...new Set(relevantFrames.flatMap(f => f.treeNode?.nodeId ? [f.treeNode.nodeId] : []))],
          entered: h.entered, returnedNodeIds: h.returned, events: h.events, action,
        };
        history.set(key, h);
      }
      return ds;
    });
    snapshot.dataStructures = [...diagrams, ...snapshot.dataStructures.filter(ds => ds.type !== 'tree')];
  }
  return snapshots;
}
