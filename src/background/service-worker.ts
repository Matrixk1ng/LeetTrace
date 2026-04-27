/**
 * Background service worker entry point (Manifest V3).
 *
 * Owns:
 *   - Side panel open/close behavior
 *   - EXTRACT_CODE relay (panel ↔ content script)
 *   - EXECUTE_CODE relay (panel → offscreen Pyodide host)
 *
 * Pyodide does NOT live here. It lives in the offscreen document
 * (src/offscreen/main.ts), because:
 *   - MV3 service workers can't import remote modules.
 *   - Idle SWs are killed after ~30s, which would discard the 10MB Pyodide
 *     instance and force a full reload on every trace.
 * The SW lazily ensures the offscreen doc exists, then forwards messages.
 */

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

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

chrome.runtime.onMessage.addListener((
  message: { type?: string; target?: string; payload?: { code?: string } },
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
    void resolveTargetTabId(sender)
      .then((tabId) => {
        if (typeof tabId !== 'number') {
          throw new Error('No active LeetCode tab found for EXTRACT_CODE');
        }
        return chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CODE' });
      })
      .then((result) => sendResponse(result))
      .catch((error: unknown) => {
        const messageText = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[LeetTrace] EXTRACT_CODE relay failed', error);
        sendResponse({
          ok: false,
          payload: { code: '', language: 'unsupported' },
          error: messageText,
        });
      });
    return true;
  }

  if (message?.type === 'EXECUTE_CODE') {
    const code = message.payload?.code;
    if (!code) {
      sendResponse({ type: 'EXECUTION_ERROR', payload: { error: 'No code provided' } });
      return false;
    }

    void (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'EXECUTE_CODE',
          payload: { code },
        });
        sendResponse(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[LeetTrace] EXECUTE_CODE relay failed:', err);
        sendResponse({ type: 'EXECUTION_ERROR', payload: { error: msg } });
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
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'WARMUP' });
    console.info('[LeetTrace] Pyodide pre-warm requested');
  } catch (err) {
    console.warn('[LeetTrace] Pyodide pre-warm failed (non-fatal):', err);
  }
});
