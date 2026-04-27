/**
 * Offscreen document — hosts Pyodide and runs user Python with sys.settrace.
 *
 * The service worker can't host Pyodide because:
 *   1. MV3 service workers cannot dynamically import remote modules (CSP).
 *   2. Idle service workers are killed after ~30s, destroying the 10MB Pyodide
 *      instance and forcing a full reload on every trace.
 *
 * The offscreen document is a hidden full DOM page — it's allowed to load
 * extension-local module scripts, has a stable lifetime tied to the SW that
 * created it, and inherits the extension's CSP (which allows 'self' +
 * 'wasm-unsafe-eval' — exactly what Pyodide needs).
 */

import {
  executePython,
  initPyodide,
  type ExecuteResult,
} from './pyodide-runner';

interface OffscreenMessage {
  target?: string;
  type?: string;
  payload?: { code?: string };
}

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'EXECUTE_CODE') {
    const code = message.payload?.code ?? '';

    void executePython(code)
      .then((result: ExecuteResult) => {
        if ('error' in result) {
          sendResponse({
            type: 'EXECUTION_ERROR',
            payload: { error: result.error, line: result.line },
          });
        } else {
          sendResponse({
            type: 'EXECUTION_RESULT',
            payload: { snapshots: result.snapshots, pattern: result.pattern },
          });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[LeetTrace][offscreen] executePython threw:', err);
        sendResponse({ type: 'EXECUTION_ERROR', payload: { error: msg } });
      });

    return true; // keep the channel open for async sendResponse
  }

  if (message.type === 'WARMUP') {
    void initPyodide()
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error: msg });
      });
    return true;
  }

  return false;
});

console.info('[LeetTrace][offscreen] ready');
