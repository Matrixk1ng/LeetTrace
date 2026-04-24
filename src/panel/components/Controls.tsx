import type { ChangeEvent } from 'react';
import { MAX_SPEED, MIN_SPEED } from '../../shared/constants';
import { useTrace } from '../store/TraceContext';

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M8 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12L19 7V17L10 12Z" fill="currentColor" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M9 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 7L9 12L17 17V7Z" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M8 6L18 12L8 18V6Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M15 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 7L15 12L7 17V7Z" fill="currentColor" />
    </svg>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, active, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-lg border text-trace-text-primary transition',
        active
          ? 'border-trace-accent bg-trace-accent text-white shadow-[0_0_20px_rgba(56,189,248,0.22)]'
          : 'border-trace-border bg-trace-bg-secondary hover:border-trace-accent hover:text-trace-accent',
        disabled ? 'cursor-not-allowed opacity-40 hover:border-trace-border hover:text-trace-text-primary' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

interface ControlsProps {
  requestTrace: () => Promise<void>;
}

export default function Controls({ requestTrace }: ControlsProps) {
  const { state, dispatch, isAtEnd, isAtStart } = useTrace();

  const isBusy = state.status === 'loading';
  const playbackDisabled = state.status === 'idle' || state.status === 'loading' || state.totalSteps === 0;
  const traceDisabled = state.status === 'loading' || state.status === 'running';

  const handleSpeedChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SPEED', payload: MAX_SPEED + MIN_SPEED - Number(event.target.value) });
  };

  return (
    <section className="border-b border-trace-border bg-trace-bg-card/90 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton
            label="Step back"
            onClick={() => dispatch({ type: 'PREV_STEP' })}
            disabled={playbackDisabled || isAtStart}
          >
            <StepBackIcon />
          </IconButton>
          <IconButton
            label={state.status === 'running' ? 'Pause' : 'Play'}
            onClick={() => dispatch({ type: state.status === 'running' ? 'PAUSE' : 'PLAY' })}
            disabled={playbackDisabled}
            active={state.status === 'running' || state.status === 'paused' || state.status === 'completed'}
          >
            {state.status === 'running' ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <IconButton
            label="Step forward"
            onClick={() => dispatch({ type: 'NEXT_STEP' })}
            disabled={playbackDisabled || isAtEnd}
          >
            <StepForwardIcon />
          </IconButton>
          <IconButton
            label="Reset"
            onClick={() => dispatch({ type: 'RESET' })}
            disabled={playbackDisabled}
          >
            <ResetIcon />
          </IconButton>
        </div>

        <button
          type="button"
          onClick={() => {
            void requestTrace();
          }}
          disabled={traceDisabled}
          className="rounded-lg border border-trace-accent bg-trace-accent px-3 py-2 text-sm font-semibold text-white shadow-[0_0_18px_rgba(56,189,248,0.2)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:border-trace-border disabled:bg-trace-bg-secondary disabled:text-trace-text-secondary disabled:shadow-none"
        >
          Trace
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-sm text-trace-text-secondary">
          Step <span className="font-[JetBrains_Mono,ui-monospace,SFMono-Regular,Menlo,monospace] text-trace-text-primary">{state.totalSteps === 0 ? 0 : state.currentStep + 1}</span>
          <span className="font-[JetBrains_Mono,ui-monospace,SFMono-Regular,Menlo,monospace]"> / {state.totalSteps}</span>
        </div>

        <div className="min-w-0 flex-1 max-w-[190px]">
          <div className="mb-1 flex items-center justify-between text-xs text-trace-text-secondary">
            <label htmlFor="trace-speed">Speed</label>
            <span className="font-[JetBrains_Mono,ui-monospace,SFMono-Regular,Menlo,monospace] text-trace-text-primary">{state.speed}ms</span>
          </div>
          <input
            id="trace-speed"
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={50}
            value={MAX_SPEED + MIN_SPEED - state.speed}
            disabled={isBusy}
            onChange={handleSpeedChange}
            style={{ '--value': `${(MAX_SPEED - state.speed) / (MAX_SPEED - MIN_SPEED)}` } as React.CSSProperties}
            className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </section>
  );
}