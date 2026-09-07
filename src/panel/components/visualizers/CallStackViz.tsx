import type { StackFrame } from '../../../shared/types';
import { IDLE_BG, IDLE_BORDER } from './format';

interface CallStackVizProps {
  frames: StackFrame[];
}

const MAX_VISIBLE = 12;

/**
 * The frames currently on the stack, innermost first.
 *
 * This is what makes a recursive trace readable: without it, a DFS or a
 * backtracking solution looks like the same few lines firing over and over
 * with no indication of how deep you are or what called what.
 */
export default function CallStackViz({ frames }: CallStackVizProps) {
  if (frames.length === 0) return null;

  // Innermost is where execution actually is, so it goes on top; deep
  // recursion hides the *outer* frames, which repeat.
  const ordered = [...frames].reverse();
  const visible = ordered.slice(0, MAX_VISIBLE);
  const hidden = ordered.length - visible.length;

  return (
    <section
      className="rounded-[10px] border border-trace-border bg-trace-bg-card"
      style={{ padding: 14 }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-trace-text-muted">
          call stack
        </span>
        <span className="text-trace-text-muted" style={{ fontSize: 10 }}>
          depth {frames.length}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {visible.map((frame, index) => {
          const isCurrent = index === 0;
          return (
            <div
              key={frame.frameId}
              className="flex items-center justify-between font-mono"
              style={{
                padding: '4px 9px',
                marginLeft: Math.min(index, 6) * 6,
                borderRadius: 6,
                border: `1.5px solid ${isCurrent ? '#38bdf8' : IDLE_BORDER}`,
                background: isCurrent ? 'rgba(56,189,248,0.10)' : IDLE_BG,
                fontSize: 11,
              }}
              title={`${frame.frameName}() — line ${frame.line}`}
            >
              <span className="text-trace-text-primary">{frame.frameName}()</span>
              <span className="text-trace-text-muted" style={{ fontSize: 10 }}>
                line {frame.line}
              </span>
            </div>
          );
        })}

        {hidden > 0 ? (
          <div className="text-xs text-trace-text-muted">… {hidden} more frames below</div>
        ) : null}
      </div>
    </section>
  );
}
