import type { DataStructureState } from '../../../shared/types';
import { IDLE_BG, IDLE_BORDER, formatValue, itemsOf, truncate } from './format';

interface QueueVizProps {
  dataStructure: DataStructureState;
  previousDataStructure: DataStructureState | null;
}

const MAX_VISIBLE = 10;

/**
 * A deque, drawn front-to-back.
 *
 * Both ends move, so both are labelled and the end that just changed is
 * called out — `popleft` at the front and `append` at the back are the two
 * operations a BFS trace is actually made of.
 */
export default function QueueViz({ dataStructure, previousDataStructure }: QueueVizProps) {
  const items = itemsOf(dataStructure.data);
  const previous = itemsOf(previousDataStructure?.data);

  if (items.length === 0) {
    return <div className="font-mono text-sm text-trace-text-muted">empty</div>;
  }

  // Which end moved: the front is gone if the old front isn't the new front.
  const dequeued =
    previous.length > 0 &&
    items.length < previous.length &&
    formatValue(previous[0]) !== formatValue(items[0]);
  const enqueued = items.length > previous.length;

  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-trace-text-muted">
        <span style={dequeued ? { color: '#fb923c' } : undefined}>
          front{dequeued ? ' ← popped' : ''}
        </span>
        <span style={enqueued ? { color: '#4ade80' } : undefined}>
          {enqueued ? 'appended → ' : ''}back
        </span>
      </div>

      <div className="flex items-center overflow-x-auto pb-1" style={{ gap: 3 }}>
        {visible.map((value, index) => {
          const isFront = index === 0;
          const isBack = index === items.length - 1;
          const isNew = enqueued && isBack;
          const text = formatValue(value);

          return (
            <div
              key={index}
              className="flex shrink-0 items-center justify-center font-mono text-trace-text-primary"
              style={{
                minWidth: 38,
                height: 34,
                padding: '0 6px',
                borderRadius: 6,
                border: `1.5px solid ${
                  isNew ? '#4ade80' : isFront ? '#38bdf8' : IDLE_BORDER
                }`,
                background: isNew ? 'rgba(74, 222, 128, 0.12)' : IDLE_BG,
                fontSize: 12,
                transition: 'border-color 0.25s ease, background-color 0.25s ease',
              }}
              title={text}
            >
              {truncate(text, 6)}
            </div>
          );
        })}

        {hidden > 0 ? (
          <div className="shrink-0 pl-1 text-xs text-trace-text-muted">+{hidden} more</div>
        ) : null}
      </div>
    </div>
  );
}
