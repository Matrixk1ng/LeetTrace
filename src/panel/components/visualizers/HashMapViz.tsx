import type { DataStructureState } from '../../../shared/types';
import { formatValue, truncate } from './format';

interface HashMapVizProps {
  dataStructure: DataStructureState;
  previousDataStructure: DataStructureState | null;
}

const MAX_VISIBLE_ENTRIES = 12;

type EntryState = 'same' | 'added' | 'changed';

const ENTRY_STYLES: Record<EntryState, { border: string; background: string }> = {
  same: { border: 'transparent', background: 'transparent' },
  added: { border: '#4ade80', background: 'rgba(74, 222, 128, 0.10)' },
  changed: { border: '#f59e0b', background: 'rgba(245, 158, 11, 0.10)' },
};

function entriesOf(data: unknown): Array<[string, unknown]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>);
}

export default function HashMapViz({ dataStructure, previousDataStructure }: HashMapVizProps) {
  const entries = entriesOf(dataStructure.data);

  if (entries.length === 0) {
    return <div className="font-mono text-sm text-trace-text-muted">{'{ }'}</div>;
  }

  // Bug B17: only *new keys* used to light up, so the counting problems this
  // view exists for — where the keys are fixed and the values move — showed
  // nothing at all after the first pass.
  const previous = new Map(entriesOf(previousDataStructure?.data));

  const visible = entries.slice(0, MAX_VISIBLE_ENTRIES);
  const hidden = Math.max(0, entries.length - visible.length);

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map(([key, value]) => {
        let state: EntryState = 'same';
        if (!previous.has(key)) {
          state = 'added';
        } else if (formatValue(previous.get(key)) !== formatValue(value)) {
          state = 'changed';
        }

        const { border, background } = ENTRY_STYLES[state];
        const text = formatValue(value);

        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-md px-1 py-0.5"
            style={{
              border: `1.5px solid ${border}`,
              background,
              transition: 'border-color 0.25s ease, background-color 0.25s ease',
            }}
          >
            <span
              className="rounded px-2 py-0.5 font-mono text-xs"
              style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
              title={key}
            >
              {truncate(key, 14)}
            </span>
            <span className="text-trace-text-muted">→</span>
            <span
              className="rounded px-2 py-0.5 font-mono text-xs text-trace-text-primary"
              style={{ background: 'rgba(255,255,255,0.04)' }}
              title={text}
            >
              {truncate(text, 18)}
            </span>
          </div>
        );
      })}
      {hidden > 0 ? <div className="text-xs text-trace-text-muted">+{hidden} more</div> : null}
    </div>
  );
}
