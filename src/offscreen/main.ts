/**
 * Offscreen document — hosts the Pyodide worker and bridges it to the rest of
 * the extension.
 *
 * The service worker can't host Pyodide because:
 *   1. MV3 service workers cannot dynamically import remote modules (CSP).
 *   2. Idle service workers are killed after ~30s, destroying the 10MB Pyodide
 *      instance and forcing a full reload on every trace.
 *
 * The offscreen document is a hidden full DOM page — it's allowed to load
 * extension-local module scripts, has a stable lifetime tied to the SW that
 * created it, and inherits the extension's CSP (which allows 'self' +
 * 'wasm-unsafe-eval' — exactly what Pyodide needs). Pyodide itself lives one
 * level deeper, in a worker this document owns (see pyodide-host.ts).
 *
 * This file is only a relay: it never runs Python on its own thread.
 */

import type { ExecutionResponse, OffscreenMessage } from '../shared/types';
import { executePython, initPyodide } from './pyodide-host';

chrome.runtime.onMessage.addListener((
  message: OffscreenMessage,
  _sender,
  sendResponse: (response: ExecutionResponse) => void,
) => {
  if (message?.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'EXECUTE_CODE') {
    const code = message.payload?.code ?? '';
    const examples = message.payload?.examples ?? [];
    console.info('[LeetTrace][offscreen] EXECUTE_CODE', {
      codeChars: code.length,
      examples: examples.length,
      firstExample: examples[0] ?? null,
    });

    void executePython(code, examples)
      .then((result) => {
        if ('error' in result) {
          console.warn('[LeetTrace][offscreen] execution error:', result.error);
          sendResponse({ type: 'EXECUTION_ERROR', payload: result });
        } else {
          console.info('[LeetTrace][offscreen] execution complete', {
            snapshots: result.snapshots.length,
            pattern: result.pattern?.type ?? null,
            truncated: result.truncated ?? false,
          });
          sendResponse({ type: 'EXECUTION_RESULT', payload: result });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[LeetTrace][offscreen] executePython threw:', err);
        sendResponse({ type: 'EXECUTION_ERROR', payload: { error: msg } });
      });

    return true; // keep the channel open for async sendResponse
  }

  return false;
});

// Warm up as soon as the document exists (bug B15). The old flow had the
// service worker send a WARMUP message right after createDocument() resolved,
// which raced this file's listener registration and was silently dropped —
// so the "pre-warm" often never happened. Initiating here can't race.
void initPyodide().catch((err: unknown) => {
  console.warn('[LeetTrace][offscreen] Pyodide warm-up failed (non-fatal):', err);
});

console.info('[LeetTrace][offscreen] ready');
