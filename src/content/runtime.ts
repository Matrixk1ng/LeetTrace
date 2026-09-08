import type { Message } from '../shared/types';

export function hasExtensionContext(): boolean {
  try { return Boolean(chrome.runtime?.id); } catch { return false; }
}

/** Chrome can throw before sendMessage returns a promise after a reload. */
export async function sendContentMessage(message: Message, onInvalidated: () => void = () => {}): Promise<{ ok?: boolean } | undefined> {
  if (!hasExtensionContext()) { onInvalidated(); return; }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (!hasExtensionContext() || /extension context invalidated/i.test(String(error))) onInvalidated();
    return undefined;
  }
}
