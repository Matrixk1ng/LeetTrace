/**
 * Owns the Pyodide worker's lifetime from the offscreen document.
 *
 * Responsibilities (DESIGN.md §5):
 *   1. Spawn and warm the worker, relaying load progress to the panel.
 *   2. Serialize executions — one at a time, since Pyodide is one interpreter.
 *   3. Enforce MAX_EXECUTION_TIME with a two-stage stop: request a
 *      KeyboardInterrupt through the interrupt buffer when SharedArrayBuffer
 *      is available, then terminate and respawn the worker if Python hasn't
 *      unwound within the grace period. Either way the document survives and
 *      the next trace works (bug B1), and every timer is cleared (bug B10).
 */

import {
  MAX_EXECUTION_TIME,
  WORKER_TERMINATE_GRACE,
} from '../shared/constants';
import type {
  ExecutionError,
  Message,
  TraceResult,
  WorkerRequest,
  WorkerResponse,
} from '../shared/types';

export type ExecuteResult = TraceResult | ExecutionError;

interface Pending {
  resolve: (result: ExecuteResult) => void;
  interruptTimer: number | null;
  killTimer: number | null;
  settled: boolean;
}

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let interruptBuffer: Uint8Array | null = null;
let requestSeq = 0;
const pending = new Map<number, Pending>();
/** Executions are queued so a second Trace click can't race the first. */
let queue: Promise<unknown> = Promise.resolve();

function broadcastToPanel(message: Message): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Panel may not be open — ignore.
  });
}

/**
 * Interrupts need a SharedArrayBuffer, which needs cross-origin isolation.
 * Offscreen documents aren't isolated by default, so this usually returns null
 * and the terminate-and-respawn fallback is what actually stops a runaway run.
 */
function createInterruptBuffer(): Uint8Array | null {
  try {
    if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
      return null;
    }
    return new Uint8Array(new SharedArrayBuffer(1));
  } catch {
    return null;
  }
}

function settle(requestId: number, result: ExecuteResult): void {
  const entry = pending.get(requestId);
  if (!entry || entry.settled) return;

  entry.settled = true;
  if (entry.interruptTimer !== null) self.clearTimeout(entry.interruptTimer);
  if (entry.killTimer !== null) self.clearTimeout(entry.killTimer);
  pending.delete(requestId);
  entry.resolve(result);
}

function failAllPending(error: string): void {
  for (const requestId of [...pending.keys()]) {
    settle(requestId, { error });
  }
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
  const message = event.data;

  switch (message.type) {
    case 'PROGRESS':
      broadcastToPanel({ type: 'PYODIDE_LOADING', payload: { progress: message.progress } });
      if (message.progress >= 100) {
        broadcastToPanel({ type: 'PYODIDE_READY' });
      }
      return;
    case 'READY':
      // INIT resolves through the same pending map as executions; the empty
      // trace is just the "no error" signal for initPyodide().
      settle(message.requestId, { snapshots: [] });
      return;
    case 'RESULT':
      settle(message.requestId, message.payload);
      return;
    case 'ERROR':
      settle(message.requestId, message.payload);
      return;
  }
}

function spawnWorker(): Worker {
  const instance = new Worker(new URL('./pyodide-worker.ts', import.meta.url), {
    type: 'module',
  });
  instance.onmessage = handleWorkerMessage;
  instance.onerror = (event) => {
    failAllPending(event.message || 'Python worker crashed');
    // A worker that failed to load won't recover — drop it so the next
    // request builds a fresh one.
    teardown();
  };
  return instance;
}

function teardown(): void {
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
  worker = null;
  readyPromise = null;
  interruptBuffer = null;
}

function send(message: WorkerRequest): void {
  worker?.postMessage(message);
}

function nextRequest(): { requestId: number; promise: Promise<ExecuteResult> } {
  const requestId = ++requestSeq;
  const promise = new Promise<ExecuteResult>((resolve) => {
    pending.set(requestId, {
      resolve,
      interruptTimer: null,
      killTimer: null,
      settled: false,
    });
  });
  return { requestId, promise };
}

/** Boot the worker and load Pyodide. Safe to call repeatedly. */
export function initPyodide(): Promise<void> {
  if (readyPromise) return readyPromise;

  const boot = (async () => {
    worker = spawnWorker();
    interruptBuffer = createInterruptBuffer();

    const { requestId, promise } = nextRequest();
    send({
      type: 'INIT',
      requestId,
      indexURL: chrome.runtime.getURL('pyodide/'),
      ...(interruptBuffer ? { interruptBuffer } : {}),
    });

    const result = await promise;
    if ('error' in result) {
      throw new Error(result.error);
    }
  })();

  // A failed boot must not be cached — drop the worker so the next request
  // starts a clean one.
  readyPromise = boot.catch((err: unknown) => {
    teardown();
    throw err;
  });

  return readyPromise;
}

async function runExecution(code: string, examples: string[]): Promise<ExecuteResult> {
  try {
    await initPyodide();
  } catch (err) {
    teardown();
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const { requestId, promise } = nextRequest();
  const entry = pending.get(requestId)!;

  const timedOutMessage = `Execution timed out after ${MAX_EXECUTION_TIME / 1000}s — check for an infinite loop.`;

  entry.interruptTimer = self.setTimeout(() => {
    if (interruptBuffer) {
      // 2 == SIGINT: Pyodide raises KeyboardInterrupt inside the running code.
      interruptBuffer[0] = 2;
    }
    entry.killTimer = self.setTimeout(() => {
      // Either there was no interrupt buffer, or Python didn't unwind.
      // Kill the worker outright; the next trace pays a fresh Pyodide load.
      teardown();
      settle(requestId, { error: timedOutMessage });
    }, interruptBuffer ? WORKER_TERMINATE_GRACE : 0);
  }, MAX_EXECUTION_TIME);

  send({ type: 'EXECUTE', requestId, code, examples });

  const result = await promise;

  // Clear the interrupt flag so the next run isn't cancelled on arrival.
  if (interruptBuffer) interruptBuffer[0] = 0;

  return result;
}

export function executePython(code: string, examples: string[] = []): Promise<ExecuteResult> {
  const run = queue.then(() => runExecution(code, examples));
  // Keep the chain alive regardless of individual outcomes.
  queue = run.catch(() => undefined);
  return run;
}
