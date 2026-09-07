import type { DataStructureState } from '../../../shared/types';
import { IDLE_BG, IDLE_BORDER, formatValue, truncate } from './format';

interface StackVizProps {
  dataStructure: DataStructureState;
  previousDataStructure: DataStructureState | null;
}

const MAX_VISIBLE = 12;

/**
 * A stack, drawn the way people draw one: top at the top.
 *
 * Python appends to the end of the list, so the last element is the top and
 * the render order is reversed. The most recent push (or the slot a pop just
 * left) is called out, which is the whole point of watching a stack step by
 * step.
 */
export default function StackViz({ dataStructure, previousDataStructure }: StackVizProps) {
  const items = (Array.isArray(dataStructure.data) ? dataStructure.data : []) as unknown[];
  const previous = (
    Array.isArray(previousDataStructure?.data) ? previousDataStructure.data : []
  ) as unknown[];

  if (items.length === 0) {
    return (
      <div className="font-mono text-sm text-trace-text-muted">
        empty{previous.length > 0 ? ' — popped the last item' : ''}
      </div>
    );
  }

  const pushed = items.length > previous.length;
  const popped = items.length < previous.length;

  // Deepest items scroll away rather than the interesting end.
  const hidden = Math.max(0, items.length - MAX_VISIBLE);
  const visible = items.slice(hidden);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-trace-text-muted">
        <span>top</span>
        {popped ? <span style={{ color: '#fb923c' }}>▲ popped</span> : null}
        {pushed ? <span style={{ color: '#4ade80' }}>▼ pushed</span> : null}
      </div>

      {visible
        .map((value, offset) => ({ value, index: hidden + offset }))
        .reverse()
        .map(({ value, index }) => {
          const isTop = index === items.length - 1;
          const isNew = pushed && isTop;
          const text = formatValue(value);

          return (
            <div
              key={index}
              className="flex items-center justify-between font-mono"
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 6,
                border: `1.5px solid ${isNew ? '#4ade80' : isTop ? '#38bdf8' : IDLE_BORDER}`,
                background: isNew ? 'rgba(74, 222, 128, 0.12)' : IDLE_BG,
                transition: 'border-color 0.25s ease, background-color 0.25s ease',
              }}
              title={text}
            >
              <span className="text-trace-text-primary" style={{ fontSize: 12 }}>
                {truncate(text, 18)}
              </span>
              <span className="text-trace-text-muted" style={{ fontSize: 9 }}>
                {index}
              </span>
            </div>
          );
        })}

      {hidden > 0 ? (
        <div className="text-center text-xs text-trace-text-muted">… {hidden} more below</div>
      ) : null}
      <div className="text-[10px] uppercase tracking-[0.18em] text-trace-text-muted">bottom</div>
    </div>
  );
}
