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

export const MAX_EXECUTION_TIME = 10000;
export const MAX_SNAPSHOTS = 5000;

export const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/';