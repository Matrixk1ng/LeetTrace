import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { readSelectedTestCase, watchTestCases } from '../../src/content/testcase';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

function fixture() {
  document.body.innerHTML = `
    <pre>Input: head = [9], pos = -1 Output: false</pre>
    <section id="testcases">
      <div><button aria-selected="true">Case 1</button><button aria-selected="false">Case 2</button><button aria-label="Add testcase">+</button></div>
      <div><div>head =</div><textarea>[3,2,0,-4]</textarea></div>
      <div><div>pos =</div><textarea>1</textarea></div>
    </section>`;
}
it('reads the visible named arguments, including cycle pos, instead of the description', () => {
  fixture();
  expect(readSelectedTestCase()).toEqual({status: 'ready', testCase: {label: 'Case 1', input: 'head = [3,2,0,-4],\npos = 1'}});
});
it('detects generic LeetCode div tabs, plus-added cases, contenteditable and multiline values', () => {
  document.body.innerHTML = `<section>
    <div><div class="cursor-pointer">Case 1</div><div class="bg-fill-3 dark:bg-dark-fill-3">Case 3</div><button>+</button></div>
    <div><span>nums =</span><div contenteditable="true"><div class="cm-line">[1,</div><div class="cm-line">2,3]</div></div></div>
    <div><span>target =</span><input value="4"></div></section>`;
  expect(readSelectedTestCase()).toEqual({status: 'ready', testCase: {label: 'Case 3', input: 'nums = [1,\n2,3],\ntarget = 4'}});
});
it('ignores hidden panels and preserves spaces and punctuation inside strings', () => {
  document.body.innerHTML = `<section><div role="tab" aria-selected="true">Case 2</div>
    <div hidden><span>s =</span><textarea>"wrong"</textarea></div>
    <div><label for="s">s =</label><textarea id="s">"a  b, c = d"</textarea></div></section>`;
  expect(readSelectedTestCase()).toEqual({status:'ready', testCase:{label:'Case 2',input:'s = "a  b, c = d"'}});
});
it('reads display-only testcase boxes', () => {
  document.body.innerHTML = '<section><button aria-selected="true">Case 1</button><div><div>head =</div><div>[1,2]</div></div></section>';
  expect(readSelectedTestCase()).toEqual({status:'ready',testCase:{label:'Case 1',input:'head = [1,2]'}});
});
it('fails explicitly for blank or unreadable selected inputs', () => {
  fixture();
  document.querySelector('textarea')!.value = '';
  expect(readSelectedTestCase().status).toBe('unreadable');
  document.querySelector('#testcases')!.innerHTML = '<button>Case 3</button>';
  expect(readSelectedTestCase().status).toBe('unreadable');
});
it('watches selection, edited value properties, and dynamically added custom cases', () => {
  vi.useFakeTimers(); fixture();
  const changed = vi.fn();
  const watcher = watchTestCases(changed);
  const buttons = document.querySelectorAll('button');
  buttons[0].setAttribute('aria-selected','false');
  buttons[1].setAttribute('aria-selected','true');
  (document.querySelector('textarea')!).value = '[1,2]';
  fireEvent.click(buttons[1]);
  vi.advanceTimersByTime(300);
  expect(changed).toHaveBeenCalledTimes(1);
  document.querySelector('textarea')!.value = '[1,2,3]';
  vi.advanceTimersByTime(750);
  expect(changed).toHaveBeenCalledTimes(2);
  buttons[1].setAttribute('aria-selected','false');
  buttons[1].insertAdjacentHTML('afterend','<button aria-selected="true">Case 3</button>');
  document.querySelectorAll('textarea')[1].value = '-1';
  fireEvent.click(document.querySelector('[aria-selected="true"]')!);
  vi.advanceTimersByTime(300);
  expect(changed).toHaveBeenCalledTimes(3);
  watcher.reset();
  vi.advanceTimersByTime(750);
  expect(changed).toHaveBeenCalledTimes(3);
  watcher.dispose();
  document.querySelector('textarea')!.value = '[]';
  vi.advanceTimersByTime(1000);
  expect(changed).toHaveBeenCalledTimes(3);
});
