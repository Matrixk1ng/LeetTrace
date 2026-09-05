export const POINTER_COLORS = [
  '#38bdf8', // blue
  '#f87171', // red
  '#4ade80', // green
  '#f59e0b', // amber
  '#a78bfa', // violet
] as const;

export const HIGHLIGHT_COLORS = {
  compare: '#fcd34d',  // yellow
  swap: '#fb923c',     // orange
  visit: '#60a5fa',    // blue
  current: '#a78bfa',  // purple
  result: '#4ade80',   // green
} as const;

export const DEFAULT_SPEED = 500;
export const MIN_SPEED = 50;
export const MAX_SPEED = 2000;

/** Wall-clock budget for one trace. Enforced by the offscreen host. */
export const MAX_EXECUTION_TIME = 10000;

/**
 * Grace period after the interrupt is requested before the worker is killed
 * outright. Pyodide needs a moment to unwind a KeyboardInterrupt; past this
 * it isn't going to.
 */
export const WORKER_TERMINATE_GRACE = 2000;

/** Snapshots shipped to the panel; beyond this the trace is marked truncated. */
export const MAX_SNAPSHOTS = 5000;

/**
 * Trace events the tracer will process before raising LeetTraceLimitError.
 * This is the guard that actually stops an infinite loop (B1): it fires from
 * inside Python, so it works even where SharedArrayBuffer interrupts don't.
 */
export const MAX_EVENTS = 200000;

export const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/';
