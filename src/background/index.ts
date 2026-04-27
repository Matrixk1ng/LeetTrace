/**
 * Background service worker entry point (Manifest V3).
 *
 * Handles:
 *  - OPEN_PANEL  → opens the side panel for the active LeetCode tab
 *  - EXTRACT_CODE → relays to the content script on the LeetCode tab
 *  - EXECUTE_CODE → runs user Python through Pyodide and returns snapshots
 */

import { executePython, initPyodide } from './pyodide-runner';

// ---------------------------------------------------------------------------
// Persist "open on click" side-panel behaviour across SW restarts
// ---------------------------------------------------------------------------
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function resolveTargetTabId(sender: chrome.runtime.MessageSender): Promise<number | null> {
    if (typeof sender.tab?.id === 'number') {
        return sender.tab.id;
    }

    // Prefer the focused LeetCode tab, fall back to any LeetCode tab.
    // Never use currentWindow: true from a service worker — it has no window.
    const [activeTabs, allTabs] = await Promise.all([
        chrome.tabs.query({ active: true, url: ['https://leetcode.com/*'] }),
        chrome.tabs.query({ url: ['https://leetcode.com/*'] }),
    ]);

    const best = activeTabs[0] ?? allTabs[0];
    return typeof best?.id === 'number' ? best.id : null;
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((
    message: { type?: string; payload?: { code?: string } },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
) => {
    // ── OPEN_PANEL ──────────────────────────────────────────────────────────
    if (message?.type === 'OPEN_PANEL') {
        // sidePanel.open() must be called synchronously inside the listener to
        // preserve the user-gesture context; do not await before calling it.
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

    // ── EXTRACT_CODE ─────────────────────────────────────────────────────────
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

        return true; // keep channel open for async sendResponse
    }

    // ── EXECUTE_CODE ─────────────────────────────────────────────────────────
    if (message?.type === 'EXECUTE_CODE') {
        const code = message.payload?.code;
        if (!code) {
            sendResponse({ type: 'EXECUTION_ERROR', payload: { error: 'No code provided' } });
            return false;
        }

        console.info('[LeetTrace] Executing user code…');

        void executePython(code)
            .then((result) => {
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
                console.error('[LeetTrace] executePython threw:', err);
                sendResponse({ type: 'EXECUTION_ERROR', payload: { error: msg } });
            });

        return true; // keep channel open for async sendResponse
    }

    return false;
});

// ---------------------------------------------------------------------------
// Install / update lifecycle
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
    console.info('[LeetTrace] Background worker installed/updated — pre-warming Pyodide…');

    try {
        await initPyodide();
        console.info('[LeetTrace] Pyodide pre-warmed successfully');
    } catch (err) {
        console.error('[LeetTrace] Pyodide pre-warm failed:', err);
    }
});

