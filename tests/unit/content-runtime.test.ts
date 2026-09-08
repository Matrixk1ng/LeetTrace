import { afterEach, expect, it, vi } from 'vitest';
import { sendContentMessage } from '../../src/content/runtime';
import { injectFAB } from '../../src/content/fab';

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('handles synchronous invalidation before Chrome returns a promise', async () => {
  const dispose = vi.fn();
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage: () => { throw new Error('Extension context invalidated.'); } } });
  await expect(sendContentMessage({ type: 'TRACE_STALE' }, dispose)).resolves.toBeUndefined();
  expect(dispose).toHaveBeenCalledOnce();
});

it('handles asynchronous invalidation', async () => {
  const dispose = vi.fn();
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage: vi.fn().mockRejectedValue(new Error('Extension context invalidated.')) } });
  await sendContentMessage({ type: 'TESTCASE_CHANGED' }, dispose);
  expect(dispose).toHaveBeenCalledOnce();
});

it('skips messaging when the runtime is already gone', async () => {
  const sendMessage = vi.fn();
  const dispose = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  await sendContentMessage({ type: 'TRACE_STALE' }, dispose);
  expect(sendMessage).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});

it('does not dispose for a temporary unavailable receiver', async () => {
  const dispose = vi.fn();
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage: vi.fn().mockRejectedValue(new Error('Receiving end does not exist')) } });
  await sendContentMessage({ type: 'TRACE_STALE' }, dispose);
  expect(dispose).not.toHaveBeenCalled();
});

it('shows refresh guidance when the old floating button is clicked', async () => {
  vi.stubGlobal('chrome', { runtime: {} });
  injectFAB();
  document.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toContain('Refresh this LeetCode page'));
});
