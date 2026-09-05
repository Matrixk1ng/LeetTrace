/**
 * Background service worker entry point (Manifest V3).
 *
 * Owns:
 *   - Side panel open/close behavior
 *   - EXTRACT_CODE relay (panel ↔ content script), including re-injecting the
 *     content script when it isn't in the page
 *   - EXECUTE_CODE relay (panel → offscreen Pyodide host)
 *
 * Pyodide does NOT live here. It lives in a worker owned by the offscreen
 * document (src/offscreen/), because:
 *   - MV3 service workers can't import remote modules.
 *   - Idle SWs are killed after ~30s, which would discard the 10MB Pyodide
 *     instance and force a full reload on every trace.
 * The SW lazily ensures the offscreen doc exists, then forwards messages.
 */

import type {
  ExecutionResponse,
  ExtractCodeResponse,
  Message,
} from '../shared/types';

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

const EMPTY_EXTRACTION: ExtractCodeResponse['payload'] = {
  code: '',
  language: 'unsupported',
  examples: [],
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);

  // hasDocument() is the canonical check; fall back to matching contexts.
  const has = await (chrome.offscreen as unknown as { hasDocument?: () => Promise<boolean> })
    .hasDocument?.()
    ?? (await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      documentUrls: [offscreenUrl],
    })).length > 0;

  if (has) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['WORKERS' as chrome.offscreen.Reason],
    justification: 'Hosts Pyodide (Python in WASM) for tracing user solutions.',
  });
}

async function resolveTargetTabId(sender: chrome.runtime.MessageSender): Promise<number | null> {
  if (typeof sender.tab?.id === 'number') {
    return sender.tab.id;
  }

  const [activeTabs, allTabs] = await Promise.all([
    chrome.tabs.query({ active: true, url: ['https://leetcode.com/*'] }),
    chrome.tabs.query({ url: ['https://leetcode.com/*'] }),
  ]);

  const best = activeTabs[0] ?? allTabs[0];
  return typeof best?.id === 'number' ? best.id : null;
}

/**
 * Re-inject the content bundle into a tab (bug B7).
 *
 * Content scripts only auto-inject on document load, so after an extension
 * reload — or when LeetCode client-side-navigates into a problem page — the
 * tab has no receiver and EXTRACT_CODE fails with "Could not establish
 * connection". The files come from the manifest rather than being hardcoded,
 * because the build rewrites them (index.ts → a hashed .js).
 */
async function injectContentScript(tabId: number): Promise<void> {
  const entry = chrome.runtime.getManifest().content_scripts?.[0];
  if (!entry) {
    throw new Error('No content script declared in the manifest');
  }

  if (entry.css?.length) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: entry.css });
  }
  if (entry.js?.length) {
    await chrome.scripting.executeScript({ target: { tabId }, files: entry.js });
  }
}

async function extractCode(sender: chrome.runtime.MessageSender): Promise<ExtractCodeResponse> {
  const tabId = await resolveTargetTabId(sender);
  if (typeof tabId !== 'number') {
    return {
      ok: false,
      payload: EMPTY_EXTRACTION,
      error: 'No active LeetCode tab found for EXTRACT_CODE',
    };
  }

  const ask = () =>
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CODE' } satisfies Message) as
      Promise<ExtractCodeResponse>;

  try {
    return await ask();
  } catch (firstError) {
    console.info('[LeetTrace] content script missing — injecting and retrying', firstError);
    try {
      await injectContentScript(tabId);
      return await ask();
    } catch (error: unknown) {
      return {
        ok: false,
        payload: EMPTY_EXTRACTION,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

chrome.runtime.onMessage.addListener((
  message: Message & { target?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => {
  // Messages already addressed to the offscreen document — let it handle them.
  if (message?.target === 'offscreen') {
    return false;
  }

  if (message?.type === 'OPEN_PANEL') {
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      void chrome.sidePanel.open({ tabId }).catch((error: unknown) => {
        console.error('[LeetTrace] Failed to open side panel', error);
      });
    } else {
      console.warn('[LeetTrace] OPEN_PANEL received without sender tab id');
    }
    return false;
  }

  if (message?.type === 'EXTRACT_CODE') {
    void extractCode(sender).then((result) => {
      if (!result.ok) {
        console.warn('[LeetTrace] EXTRACT_CODE relay failed', result.error);
      }
      sendResponse(result);
    });
    return true;
  }

  if (message?.type === 'EXECUTE_CODE') {
    const code = message.payload?.code;
    const examples = message.payload?.examples ?? [];
    if (!code) {
      sendResponse({
        type: 'EXECUTION_ERROR',
        payload: { error: 'No code provided' },
      } satisfies ExecutionResponse);
      return false;
    }

    void (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'EXECUTE_CODE',
          payload: { code, examples },
        });
        sendResponse(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[LeetTrace] EXECUTE_CODE relay failed:', err);
        sendResponse({
          type: 'EXECUTION_ERROR',
          payload: { error: msg },
        } satisfies ExecutionResponse);
      }
    })();

    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  console.info('[LeetTrace] Background worker installed/updated — pre-warming Pyodide…');

  try {
    // Creating the document is enough: it warms Pyodide itself on load, so
    // there's no WARMUP message to race with its listener registration (B15).
    await ensureOffscreenDocument();
    console.info('[LeetTrace] Offscreen document created; Pyodide warming up');
  } catch (err) {
    console.warn('[LeetTrace] Pyodide pre-warm failed (non-fatal):', err);
  }
});
