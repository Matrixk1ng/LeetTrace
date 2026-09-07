import type { Snapshot, VariableState } from './types';

/** Shared by the panel and editor badges, so neither exposes serializer internals. */
export function isRuntimeVariable(name: string, variable: VariableState): boolean {
  return name === 'self' || ['function', 'method', 'builtin_function_or_method', 'module', 'type'].includes(variable.type);
}

export function formatTraceValue(value: unknown, type?: string, depth = 0): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') {
    if (type === 'float' && ['inf', '-inf', 'nan'].includes(value)) return value;
    if (/^<.*(object at|function |method |module )/.test(value)) return type ?? 'Python object';
    return JSON.stringify(value.length > 100 ? value.slice(0, 100) + '…' : value);
  }
  if (Array.isArray(value)) {
    if (depth > 1) return '[' + value.length + ' items]';
    return '[' + value.slice(0, 6).map(v => formatTraceValue(v, undefined, depth + 1)).join(', ') +
      (value.length > 6 ? ', … +' + (value.length - 6) : '') + ']';
  }
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    if (data.__type === 'tree') {
      const root = data.root as { val?: unknown } | null;
      return root ? 'Tree · root ' + formatTraceValue(root.val) : 'Empty tree';
    }
    if (data.__type === 'linked_list') {
      const nodes = Array.isArray(data.nodes) ? data.nodes : [];
      return 'Linked list · ' + nodes.length + ' nodes' + (data.has_cycle ? ' · cycle' : '');
    }
    if (data.__type === 'deque' || data.__type === 'set') {
      const items = Array.isArray(data.items) ? data.items : [];
      return (data.__type === 'deque' ? 'Queue' : 'Set') + ' · ' + items.length + ' items';
    }
    const entries = Object.entries(data);
    if (depth > 1) return '{' + entries.length + ' entries}';
    return '{' + entries.slice(0, 4).map(([k, v]) => k + ': ' + formatTraceValue(v, undefined, depth + 1)).join(', ') +
      (entries.length > 4 ? ', … +' + (entries.length - 4) : '') + '}';
  }
  return String(value);
}

export function visibleVariables(snapshot: Snapshot): [string, VariableState][] {
  return Object.entries(snapshot.variables).filter(([name, v]) => !isRuntimeVariable(name, v))
    .sort(([a, av], [b, bv]) => Number(b === 'return') - Number(a === 'return') ||
      Number(bv.changed) - Number(av.changed) || a.localeCompare(b));
}
