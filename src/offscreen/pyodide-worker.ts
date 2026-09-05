/**
 * Pyodide host — runs inside a dedicated module worker owned by the offscreen
 * document.
 *
 * Why a worker (bug B1): `pyodide.runPython()` is synchronous. On the offscreen
 * document's main thread it blocks the event loop, so the timeout timer racing
 * it could never fire and `while True: pass` hung the singleton offscreen
 * document forever — poisoning every later trace. On its own thread the code
 * can be interrupted (SharedArrayBuffer, when available) or, failing that,
 * killed outright with `worker.terminate()` while the document stays healthy.
 *
 * The worker talks only in `WorkerRequest`/`WorkerResponse`; it never touches
 * chrome.* (those APIs aren't reliably present in a dedicated worker), so the
 * Pyodide URL is handed in and progress is relayed by the document.
 */

import tracerSource from './tracer.py?raw';
import { MAX_EVENTS, MAX_SNAPSHOTS } from '../shared/constants';
import type { ExecutionError, TraceResult, WorkerRequest, WorkerResponse } from '../shared/types';
import { processSnapshot, type RawTraceResult } from './snapshot-builder';
import { detectPattern } from './pattern-detect';

interface PyodideInstance {
  runPython: (code: string) => unknown;
  globals: {
    set: (name: string, value: unknown) => void;
    get: (name: string) => unknown;
  };
  setInterruptBuffer?: (buffer: Uint8Array) => void;
}

let pyodide: PyodideInstance | null = null;
let initPromise: Promise<void> | null = null;

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

async function init(indexURL: string, interruptBuffer?: Uint8Array): Promise<void> {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    post({ type: 'PROGRESS', progress: 0 });

    const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
      loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance>;
    };
    const instance = await mod.loadPyodide({ indexURL });

    post({ type: 'PROGRESS', progress: 80 });

    instance.runPython(tracerSource);
    instance.globals.set('__leettrace_max_snapshots', MAX_SNAPSHOTS);
    instance.globals.set('__leettrace_max_events', MAX_EVENTS);
    instance.runPython(
      'configure(__leettrace_max_snapshots, __leettrace_max_events)',
    );

    if (interruptBuffer && typeof instance.setInterruptBuffer === 'function') {
      instance.setInterruptBuffer(interruptBuffer);
    }

    pyodide = instance;
    post({ type: 'PROGRESS', progress: 100 });
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

function execute(code: string, examples: string[]): TraceResult | ExecutionError {
  pyodide!.globals.set('__leettrace_code', code);
  pyodide!.globals.set('__leettrace_examples', examples);

  const rawJson = pyodide!.runPython(
    'run_traced(__leettrace_code, list(__leettrace_examples) if __leettrace_examples is not None else [])',
  ) as string;

  let raw: RawTraceResult;
  try {
    raw = JSON.parse(rawJson) as RawTraceResult;
  } catch {
    return { error: 'Failed to parse execution output' };
  }

  if (raw.error) {
    return { error: raw.error.message, line: raw.error.line };
  }

  return {
    snapshots: raw.snapshots.map(processSnapshot),
    pattern: detectPattern(code),
    truncated: raw.truncated,
    ...(raw.limit ? { limit: raw.limit } : {}),
    returnValue: raw.returnValue,
  };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'INIT') {
    void init(message.indexURL, message.interruptBuffer)
      .then(() => post({ type: 'READY', requestId: message.requestId }))
      .catch((err: unknown) =>
        post({
          type: 'ERROR',
          requestId: message.requestId,
          payload: { error: err instanceof Error ? err.message : String(err) },
        }),
      );
    return;
  }

  if (message.type === 'EXECUTE') {
    void (async () => {
      try {
        if (!pyodide) {
          // The host always INITs and awaits READY before sending EXECUTE.
          throw new Error('Python runtime is not ready yet');
        }
        const result = execute(message.code, message.examples);
        if ('error' in result) {
          post({ type: 'ERROR', requestId: message.requestId, payload: result });
        } else {
          post({ type: 'RESULT', requestId: message.requestId, payload: result });
        }
      } catch (err) {
        post({
          type: 'ERROR',
          requestId: message.requestId,
          payload: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    })();
  }
};
