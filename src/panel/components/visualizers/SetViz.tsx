import type { DataStructureState } from '../../../shared/types';
import { formatValue, itemsOf, truncate } from './format';

interface SetVizProps {
  dataStructure: DataStructureState;
  previousDataStructure: DataStructureState | null;
}

const MAX_VISIBLE = 40;

/**
 * A set, as a chip cloud with an add/remove diff.
 *
 * A set has no order to walk, so the only thing worth animating is membership
 * changing — which is exactly what `visited`/`seen` sets are for. Removed
 * members are kept on screen for one step, struck through, so a `discard`
 * doesn't just silently vanish.
 */
export default function SetViz({ dataStructure, previousDataStructure }: SetVizProps) {
  const items = itemsOf(dataStructure.data).map(formatValue);
  const previous = itemsOf(previousDataStructure?.data).map(formatValue);

  const current = new Set(items);
  const before = new Set(previous);
  const removed = previous.filter((item) => !current.has(item));

  const frozen = (dataStructure.data as { frozen?: boolean })?.frozen === true;

  if (items.length === 0 && removed.length === 0) {
    return (
      <div className="font-mono text-sm text-trace-text-muted">
        {frozen ? 'frozenset()' : 'set()'}
      </div>
    );
  }

  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center" style={{ gap: 4 }}>
        {visible.map((text) => {
          const isNew = !before.has(text);
          return (
            <span
              key={text}
              className="rounded-full font-mono text-trace-text-primary"
              style={{
                padding: '3px 9px',
                fontSize: 11,
                border: `1.5px solid ${isNew ? '#4ade80' : '#2d3a5c'}`,
                background: isNew ? 'rgba(74, 222, 128, 0.12)' : 'rgba(255,255,255,0.04)',
                transition: 'border-color 0.25s ease, background-color 0.25s ease',
              }}
              title={text}
            >
              {truncate(text, 12)}
            </span>
          );
        })}

        {removed.map((text) => (
          <span
            key={`removed-${text}`}
            className="rounded-full font-mono line-through"
            style={{
              padding: '3px 9px',
              fontSize: 11,
              border: '1.5px dashed rgba(248,113,113,0.55)',
              background: 'rgba(248,113,113,0.08)',
              color: 'rgba(248,113,113,0.85)',
            }}
            title={`${text} — removed`}
          >
            {truncate(text, 12)}
          </span>
        ))}

        {hidden > 0 ? <span className="text-xs text-trace-text-muted">+{hidden} more</span> : null}
      </div>

      <div className="text-[10px] uppercase tracking-[0.18em] text-trace-text-muted">
        {frozen ? 'frozen · ' : ''}
        {items.length} {items.length === 1 ? 'member' : 'members'}
      </div>
    </div>
  );
}
