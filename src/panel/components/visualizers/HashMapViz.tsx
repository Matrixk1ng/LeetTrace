import type { DataStructureState } from '../../../shared/types';

interface HashMapVizProps {
  dataStructure: DataStructureState;
  previousDataStructure: DataStructureState | null;
}

const MAX_VISIBLE_ENTRIES = 10;

function formatValue(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function entriesOf(data: unknown): Array<[string, unknown]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>);
}

export default function HashMapViz({ dataStructure, previousDataStructure }: HashMapVizProps) {
  const entries = entriesOf(dataStructure.data);

  if (entries.length === 0) {
    return <div className="font-mono text-sm text-trace-text-muted">{'{ }'}</div>;
  }

  const previousEntries = entriesOf(previousDataStructure?.data);
  const previousKeys = new Set(previousEntries.map(([k]) => k));

  const visible = entries.slice(0, MAX_VISIBLE_ENTRIES);
  const hidden = Math.max(0, entries.length - visible.length);

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map(([key, value]) => {
        const isNew = !previousKeys.has(key);
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-md px-1 py-0.5"
            style={{
              border: `1.5px solid ${isNew ? '#4ade80' : 'transparent'}`,
              background: isNew ? 'rgba(74, 222, 128, 0.10)' : 'transparent',
              transition: 'border-color 0.25s ease, background-color 0.25s ease',
            }}
          >
            <span
              className="rounded px-2 py-0.5 font-mono text-xs"
              style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
            >
              {String(key)}
            </span>
            <span className="text-trace-text-muted">→</span>
            <span
              className="rounded px-2 py-0.5 font-mono text-xs text-trace-text-primary"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              {formatValue(value)}
            </span>
          </div>
        );
      })}
      {hidden > 0 ? (
        <div className="text-xs text-trace-text-muted">+{hidden} more</div>
      ) : null}
    </div>
  );
}
