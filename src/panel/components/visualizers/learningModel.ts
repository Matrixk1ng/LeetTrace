import type { LearningEvent, Snapshot, StackFrame } from '../../../shared/types';
import { formatTraceValue } from '../../../shared/display';

export interface CallRow {
  key: string; step: number; frameId: string; ancestors: string[]; depth: number;
  kind: 'call' | 'return' | 'save' | 'reuse' | 'stored'; text: string;
  returned?: string;
}
export interface LearningModel {
  recursive: boolean; rows: CallRow[]; frames: StackFrame[];
  table?: { name: string; values: unknown[]; event?: LearningEvent; history: LearningEvent[] };
  saved: { name: string; key: string | number; value: unknown; keyType?: 'tuple' }[];
}
export function callLabel(frame: StackFrame): string {
  const args = Object.entries(frame.arguments ?? {}).slice(0, 3).map(([name, v]) => name + ' = ' + formatTraceValue(v.value, v.type));
  return frame.frameName + '(' + args.join(', ') + (Object.keys(frame.arguments ?? {}).length > 3 ? ', …' : '') + ')';
}

/** Replay only the visible prefix. Equal arguments never merge distinct calls. */
export function learningModel(snapshots: Snapshot[], index: number): LearningModel {
  const current = snapshots[index];
  const model: LearningModel = { recursive: false, rows: [], frames: current?.callStack ?? [], saved: [] };
  const writes = new Map<string, { name: string; key: string | number; value: unknown; frameId: string; keyType?: 'tuple' }>();
  const expanded = new Set<string>();
  const calls = new Map<string, CallRow>();
  let table: { frameId: string; name: string; identity: string } | undefined;
  const tableWrites: { frameId: string; event: LearningEvent }[] = [];
  for (let i = 0; i <= index; i++) {
    const s = snapshots[i];
    if (!s) continue;
    const names = s.callStack.map(f => f.frameName);
    if (new Set(names).size < names.length) model.recursive = true;
    const frame = s.callStack.find(f => f.frameId === s.frameId);
    if (s.event === 'call') s.callStack.filter(f => f.frameId !== s.frameId).forEach(f => expanded.add(f.frameId));
    const base = { step: i, frameId: s.frameId, ancestors: s.callStack.filter(f => f.frameId !== s.frameId).map(f => f.frameId), depth: Math.max(0, s.callStack.length - 1) };
    if (frame && s.event === 'call') {
      const row: CallRow = { ...base, key: i + ':call', kind: 'call', text: callLabel(frame) };
      calls.set(s.frameId, row);
      model.rows.push(row);
    }
    const operation = s.visual?.operation?.completed;
    if (frame && operation && /\.(append|pop|remove|clear|extend)\(/.test(operation.source)) {
      const changed = operation.names.filter(name => JSON.stringify(operation.before[name]) !== JSON.stringify(operation.after?.[name]));
      if (changed.length) model.rows.push({ ...base, key: i + ':mutation', kind: 'save', text: operation.source + ' · ' + changed.map(name => name + ' = ' + formatTraceValue(operation.after?.[name])).join(' · ') });
    }
    for (const [n, e] of (s.visual?.learning ?? []).entries()) {
      const key = JSON.stringify([e.identity, e.keyType, e.key]);
      const text = e.structure + '[' + (e.keyType === 'tuple' ? e.key : formatTraceValue(e.key)) + '] = ' + formatTraceValue(e.value);
      if (e.kind === 'memo-write') {
        writes.set(key, { name: e.structure, key: e.key, value: e.value, frameId: s.frameId, keyType: e.keyType });
        model.rows.push({ ...base, key: i + ':' + n, kind: 'save', text: 'Save ' + text });
      } else if (e.kind === 'stored-return') {
        const saved = writes.get(key);
        const reused = saved !== undefined && saved.frameId !== s.frameId && !expanded.has(s.frameId) && Object.is(saved.value, e.value);
        if (saved?.frameId !== s.frameId) model.rows.push({ ...base, key: i + ':' + n, kind: reused ? 'reuse' : 'stored', text: (reused ? '↯ Already saved · ' : 'Read stored value · ') + text });
      } else {
        table = { frameId: s.frameId, name: e.structure, identity: e.identity };
        if (e.kind === 'table-write') tableWrites.push({ frameId: s.frameId, event: e });
      }
    }
    if (frame && s.event === 'return') model.rows.push({ ...base, key: i + ':return', kind: 'return', text: s.variables.return ? '← return ' + formatTraceValue(s.variables.return.value, s.variables.return.type) : '← call exited · no return value recorded' });
    if (s.event === 'return' && s.variables.return && calls.has(s.frameId)) calls.get(s.frameId)!.returned = formatTraceValue(s.variables.return.value, s.variables.return.type);
  }
  model.saved = [...writes.values()];
  if (current && table?.frameId === current.frameId && !model.recursive) {
    const value = current.variables[table.name]?.value;
    if (Array.isArray(value) && !value.some(v => typeof v === 'object' && v !== null)) {
      model.table = { name: table.name, values: value, event: current.visual?.learning?.findLast(e => e.structure === table.name && (e.kind === 'table-read' || e.kind === 'table-write')), history: tableWrites.filter(w => w.frameId === table.frameId && w.event.identity === table.identity).map(w => w.event).slice(-12) };
    }
  }
  return model;
}
