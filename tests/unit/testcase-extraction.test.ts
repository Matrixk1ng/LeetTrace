import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { extractCode } from '../../src/content/editor-hook';

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'monaco');
  document.body.innerHTML = '';
});

function mockBridge() {
  vi.stubGlobal('chrome', {runtime:{getURL:()=> 'https://example.invalid/monaco-bridge.js'}});
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
    const result = append(node);
    if (node instanceof HTMLScriptElement) queueMicrotask(() => {
      window.dispatchEvent(new MessageEvent('message', {source:window,
        data:{type:'LEETTRACE_MONACO_EXTRACT_RESULT',requestId:node.getAttribute('data-request-id'),code:'class Solution: pass'}}));
    });
    return result;
  });
}

it('passes exactly the selected case through extraction, never the first description example', async () => {
  mockBridge();
  document.body.innerHTML = '<button>Python3</button><pre>Input: nums = [999] Output: 999</pre><section><button>Case 1</button><button aria-selected="true">Case 2</button><div><span>nums =</span><textarea>[2,3]</textarea></div></section>';
  const result = await extractCode();
  expect(result.examples).toEqual(['nums = [2,3]']);
  expect(result.testCase?.label).toBe('Case 2');
});
it('refuses to guess the first example when the testcase pane is hidden', async () => {
  mockBridge();
  document.body.innerHTML = '<button>Python3</button><pre>Input: nums = [999] Output: 999</pre>';
  await expect(extractCode()).rejects.toThrow(/Testcase tab/);
});
it('keeps the Python solution selected when a testcase Monaco editor has focus', () => {
  document.body.innerHTML = '<div id="solution"></div><div id="testcase"><textarea></textarea></div>';
  const source = readFileSync(new URL('../../public/monaco-bridge.js', import.meta.url), 'utf8');
  const script = document.createElement('script');
  script.setAttribute('data-request-id','test');
  vi.spyOn(document,'currentScript','get').mockReturnValue(script);
  const nodes = [document.getElementById('solution')!, document.getElementById('testcase')!];
  for (const node of nodes) vi.spyOn(node,'getBoundingClientRect').mockReturnValue({width:100,height:100} as DOMRect);
  document.querySelector('textarea')!.focus();
  Object.assign(window,{monaco:{editor:{getEditors:()=>nodes.map((node,i)=>({
    getDomNode:()=>node, getValue:()=>i===0?'class Solution: pass':'[1,2]',
    getModel:()=>({getLanguageId:()=>i===0?'python':'plaintext'}),
  }))}}});
  const post = vi.spyOn(window,'postMessage').mockImplementation(()=>{});
  runInNewContext(source,{window,document,HTMLElement,Date});
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type:'LEETTRACE_MONACO_EXTRACT_RESULT',code:'class Solution: pass'}),window.location.origin);
});
