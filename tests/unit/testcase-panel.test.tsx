import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../../src/panel/App';
import FeedbackFooter from '../../src/panel/components/FeedbackFooter';
import { TraceProvider } from '../../src/panel/store/TraceContext';
import type { ExecutionResponse, Message } from '../../src/shared/types';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('opens user-reviewed bug and feature forms without attaching code or inputs', () => {
  vi.stubGlobal('chrome', {runtime: {getManifest: () => ({version:'0.1.0'})}});
  render(<FeedbackFooter />);
  fireEvent.click(screen.getByRole('button',{name:'Feature request / Report a bug'}));
  const bug = new URL(screen.getByRole('link',{name:/Report a bug/}).getAttribute('href')!);
  expect(bug.origin + bug.pathname).toBe('https://github.com/Matrixk1ng/LeetTrace/issues/new');
  expect(bug.searchParams.get('title')).toBe('[Bug] ');
  expect(bug.searchParams.get('body')).toContain('LeetTrace version: 0.1.0');
  expect(screen.getByText(/Reports are public/)).toBeTruthy();
  expect(new URL(screen.getByRole('link',{name:/Request a feature/}).getAttribute('href')!).searchParams.get('title')).toBe('[Feature request] ');
});

it('retraces the latest custom testcase after an in-flight run without showing the superseded result', async () => {
  const listeners = new Set<(m: Message, sender: chrome.runtime.MessageSender) => void>();
  let selected = {label:'Case 1',input:'head = [1], pos = -1'};
  const finishes: ((response: ExecutionResponse) => void)[] = [];
  const sendMessage = vi.fn((message: Message) => {
    if (message.type === 'EXTRACT_CODE') return Promise.resolve({ok:true,payload:{
      code:'class Solution: pass',language:'python3',examples:[selected.input],testCase:{...selected},
    }});
    return new Promise<ExecutionResponse>(resolve => { finishes.push(resolve); });
  });
  vi.stubGlobal('chrome', {runtime:{sendMessage,onMessage:{
    addListener:(fn: (m: Message, sender: chrome.runtime.MessageSender) => void)=>listeners.add(fn),
    removeListener:(fn: (m: Message, sender: chrome.runtime.MessageSender) => void)=>listeners.delete(fn),
  }},tabs:{query:vi.fn().mockResolvedValue([{id:7}]),sendMessage:vi.fn().mockResolvedValue(undefined)}});
  render(<TraceProvider><App /></TraceProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Trace'}));
  await waitFor(()=>expect(finishes.length).toBe(1));
  selected = {label:'Case 3',input:'head = [3,2,0,-4], pos = 1'};
  act(()=>{for(const listener of listeners) listener({type:'TESTCASE_CHANGED'}, {tab:{id:7} as chrome.tabs.Tab});});
  await act(async()=>{finishes[0]({type:'EXECUTION_RESULT',payload:{snapshots:[],returnValue:'old case'}});});
  await waitFor(()=>expect(finishes.length).toBe(2));
  expect(sendMessage).toHaveBeenLastCalledWith({type:'EXECUTE_CODE',payload:{
    code:'class Solution: pass',examples:['head = [3,2,0,-4], pos = 1'],
  }});
  expect(screen.getByText('Tracing Case 3')).toBeTruthy();
  expect(screen.queryByText('old case')).toBeNull();
  await act(async()=>{finishes[1]({type:'EXECUTION_RESULT',payload:{snapshots:[],returnValue:true}});});
});
