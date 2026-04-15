// Runs on every service worker start — persists the "open on click" behaviour
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

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

chrome.runtime.onMessage.addListener((message: { type?: string }, sender, sendResponse) => {
  if (message?.type === 'OPEN_PANEL') {
    // sidePanel.open() must be called synchronously inside the listener to
    // preserve the user-gesture context; do not await before calling it.
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      void chrome.sidePanel.open({ tabId }).catch((error) => {
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
      .then((result) => {
        sendResponse(result);
      })
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

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  // Re-apply on install/update in case the setting was lost
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  console.info('[LeetTrace] Background worker loaded');
});