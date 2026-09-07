import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../../src/panel/App';
import { TraceProvider } from '../../src/panel/store/TraceContext';
import type { ExecutionResponse, Message, Snapshot } from '../../src/shared/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const failureStep: Snapshot = {
  step: 0, line: 5, event: 'return', frameId: 'helper', frameName: 'helper', callDepth: 2,
  callStack: [], highlights: [], dataStructures: [],
  variables: {total: {value: 4, type: 'int', changed: true}},
};

it('keeps partial error state inspectable and remembers edits during execution', async () => {
  let finish!: (value: ExecutionResponse) => void;
  const execution = new Promise<ExecutionResponse>(resolve => { finish = resolve; });
  const listeners = new Set<(m: Message, sender: chrome.runtime.MessageSender) => void>();
  const sendMessage = vi.fn((message: Message) => message.type === 'EXTRACT_CODE'
    ? Promise.resolve({ok: true, payload: {code: 'class Solution: pass', language: 'python3', examples: []}})
    : execution);
  vi.stubGlobal('chrome', {
    runtime: {sendMessage, onMessage: {
      addListener: (fn: (m: Message, sender: chrome.runtime.MessageSender) => void) => listeners.add(fn),
      removeListener: (fn: (m: Message, sender: chrome.runtime.MessageSender) => void) => listeners.delete(fn),
    }},
    tabs: {query: vi.fn().mockResolvedValue([{id: 7}]), sendMessage: vi.fn().mockResolvedValue(undefined)},
  });
  render(<TraceProvider><App /></TraceProvider>);
  fireEvent.click(screen.getByRole('button', {name: 'Trace'}));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({type: 'EXECUTE_CODE'})));
  act(() => { for (const listener of listeners) listener({type: 'TRACE_STALE'}, {tab: {id: 7} as chrome.tabs.Tab}); });
  await act(async () => {
    finish({type: 'EXECUTION_ERROR', payload: {error: 'ZeroDivisionError', line: 5,
      trace: {snapshots: [failureStep, {...failureStep, step: 1, line: 8, frameName: 'solve', variables: {}}]}}});
  });
  expect(screen.getByText('Execution failed')).toBeTruthy();
  expect(screen.getByText('total')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.getByText(/Code changed/)).toBeTruthy();
  expect(screen.getByText('helper()')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Play'}));
  expect(screen.getByText('Execution failed')).toBeTruthy();
});
