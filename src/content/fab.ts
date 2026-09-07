import type { Message } from '../shared/types';
const FAB_ID = 'leettrace-floating-action-button';
const FAB_CLASS = 'leettrace-fab';
const FAB_ICON_CLASS = 'leettrace-fab-icon';

export function injectFAB(): void {
  if (window.top !== window) {
    return;
  }

  if (document.getElementById(FAB_ID)) {
    return;
  }

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.className = FAB_CLASS;
  fab.type = 'button';
  fab.title = 'Open LeetTrace';
  fab.setAttribute('aria-label', 'Open LeetTrace');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', FAB_ICON_CLASS);
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '18');
  icon.setAttribute('height', '18');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 5.5L18 12L8 18.5V5.5Z');
  path.setAttribute('fill', '#ffffff');

  icon.appendChild(path);
  fab.appendChild(icon);

  const showFallback = () => {
    fab.title = 'Click the LeetTrace extension icon in the Chrome toolbar to open the panel.';
    fab.setAttribute('aria-label', fab.title);
    let note = document.getElementById('leettrace-panel-help');
    if (!note) {
      note = document.createElement('div');
      note.id = 'leettrace-panel-help';
      note.setAttribute('role', 'status');
      note.style.cssText = 'position:fixed;bottom:80px;right:20px;max-width:240px;padding:12px;background:#16213e;color:white;border:1px solid #38bdf8;border-radius:8px;z-index:2147483647;font:13px system-ui';
      document.body.appendChild(note);
    }
    note.textContent = fab.title;
  };
  fab.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'OPEN_PANEL' } satisfies Message)
      .then(response => {
        if (!response?.ok) showFallback();
        else document.getElementById('leettrace-panel-help')?.remove();
      }).catch(showFallback);
  });

  document.body.appendChild(fab);
}
