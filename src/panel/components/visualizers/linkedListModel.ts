import type { Snapshot } from '../../../shared/types';

type Node = { id: string; value: unknown; next: string | null };
type Frame = { nodes: Map<string, Node>; aliases: Map<string, string | null> };
function read(snapshot: Snapshot): Frame {
  const nodes = new Map<string, Node>(), aliases = new Map<string, string | null>();
  for (const [name, variable] of Object.entries(snapshot.variables)) {
    const v = variable.value as { __type?: string; nodeIds?: string[]; nodes?: unknown[]; has_cycle?: boolean; cycleIndex?: number } | null;
    if (v === null) { aliases.set(name, null); continue; }
    if (v?.__type !== 'linked_list' || !Array.isArray(v.nodeIds) || !Array.isArray(v.nodes) || v.nodeIds.length !== v.nodes.length) continue;
    aliases.set(name, v.nodeIds[0] ?? null);
    v.nodeIds.forEach((id, i) => nodes.set(id, { id, value: v.nodes![i], next: v.nodeIds![i + 1] ?? (v.has_cycle ? v.nodeIds![v.cycleIndex ?? -1] : null) ?? null }));
  }
  return { nodes, aliases };
}

/** Reconstruct only observed links. Unreachable nodes never retain a stale arrow. */
export function linkedListModel(snapshots: Snapshot[], index: number) {
  const current = snapshots[index];
  const order: string[] = [], history: { step: number; changes: string[] }[] = [];
  const labels = new Map<string, string>();
  const label = (id: string | null) => id === null ? 'None' : labels.get(id) ?? '?';
  let previous: Frame | undefined, frame: Frame = { nodes: new Map(), aliases: new Map() };
  let changes: string[] = [], changedLinks = new Set<string>();
  for (let i = 0; i <= index; i++) {
    if (snapshots[i]?.frameId !== current?.frameId) continue;
    frame = read(snapshots[i]);
    for (const id of frame.nodes.keys()) if (!labels.has(id)) {
      labels.set(id, order.length < 26 ? String.fromCharCode(65 + order.length) : `N${order.length + 1}`);
      order.push(id);
    }
    changes = []; changedLinks = new Set();
    if (previous) {
      for (const [id, node] of frame.nodes) {
        const before = previous.nodes.get(id);
        if (before && before.next !== node.next) { changes.push(`${label(id)}.next: ${label(before.next)} → ${label(node.next)}`); changedLinks.add(id); }
      }
      for (const [name, id] of frame.aliases) {
        if (!previous.aliases.has(name)) changes.push(`${name} = ${label(id)}`);
        else if (previous.aliases.get(name) !== id) changes.push(`${name}: ${label(previous.aliases.get(name)!)} → ${label(id)}`);
      }
    }
    if (changes.length && order.length) history.push({ step: i, changes });
    previous = frame;
  }
  return { ...frame, order, label, changes, changedLinks, history };
}
