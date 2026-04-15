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

  fab.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'OPEN_PANEL' }).catch((error) => {
      console.warn('[LeetTrace][content] Failed to send OPEN_PANEL message', error);
    });
  });

  document.body.appendChild(fab);
}
