import type { Snapshot } from '../../../shared/types';
export function gridSearchStructures(snapshot: Snapshot | null, pattern?: string) {
  if (!snapshot?.visual || pattern !== 'bfs') return null;
  const grids = snapshot.dataStructures.filter(ds => ds.type === 'matrix');
  const queues = snapshot.dataStructures.filter(ds => ds.type === 'queue');
  // Don't guess which grid/queue belongs together in multi-structure algorithms.
  return grids.length === 1 && queues.length === 1 ? {grid:grids[0], queue:queues[0]} : null;
}

