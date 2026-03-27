// Runs on every service worker start
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetTrace] Background worker loaded');
});