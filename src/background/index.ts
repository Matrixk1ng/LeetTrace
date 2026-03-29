// Runs on every service worker start — persists the "open on click" behaviour
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(() => {
  // Re-apply on install/update in case the setting was lost
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  console.log('[LeetTrace] Background worker loaded');
});