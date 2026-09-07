import type { SelectedTestCase } from '../shared/types';

const CASE = /^Case\s+\d+$/i;
const PARAM = /^([A-Za-z_]\w*)\s*=\s*$/;
const EDITABLE = 'textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), [contenteditable="true"], [role="textbox"]';

function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function text(element: Element): string {
  return (element.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}

function leaves(root: ParentNode, expression: RegExp): Element[] {
  return Array.from(root.querySelectorAll('label, span, div, button, [role="tab"]'))
    .filter(el => expression.test(text(el)) && !Array.from(el.children).some(child => expression.test(text(child))) && visible(el));
}

function activeScore(tab: Element): number {
  let score = 0;
  for (let node: Element | null = tab, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
    if (!CASE.test(text(node))) break;
    if (node.getAttribute('aria-selected') === 'true' || node.getAttribute('data-state') === 'active' ||
        node.getAttribute('data-active') === 'true') score += 100;
    const classes = node.getAttribute('class') ?? '';
    // LeetCode uses generic divs for testcase tabs, not always ARIA tabs.
    if (/(^|\s)(?:dark:)?bg-(?:dark-)?fill-\d/.test(classes)) score += 10;
    const background = getComputedStyle(node).backgroundColor;
    if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') score += 1;
  }
  return score;
}

function readValue(control: Element): string {
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return control.value.trim();
  // CodeMirror represents line breaks with child .cm-line elements.
  const lines = Array.from(control.querySelectorAll('.cm-line, .view-line'));
  return (lines.length ? lines.map(line => line.textContent ?? '').join('\n') : control.textContent ?? '')
    .replace(/\u00a0/g, ' ').trim();
}

function parameterValue(label: Element, root: Element): string | null {
  const linked = label instanceof HTMLLabelElement ? label.control : null;
  if (linked && root.contains(linked) && visible(linked)) return readValue(linked);
  for (let group = label.parentElement; group && root.contains(group); group = group.parentElement) {
    if (leaves(group, PARAM).length > 1) break;
    const controls = Array.from(group.querySelectorAll(EDITABLE)).filter(visible)
      .filter(control => !Array.from(group!.querySelectorAll(EDITABLE)).some(other => other !== control && other.contains(control)));
    if (controls.length === 1) return readValue(controls[0]);
    // Some LeetCode versions render a display box until it is clicked to edit.
    let branch = label;
    while (branch.parentElement && branch.parentElement !== group) branch = branch.parentElement;
    const next = branch.nextElementSibling;
    if (next && visible(next) && !PARAM.test(text(next)) && !CASE.test(text(next)) &&
        !next.querySelector('button, [role="tab"]')) {
      const value = readValue(next);
      if (value) return value;
    }
    if (group === root) break;
  }
  return null;
}

export type TestCaseRead =
  | { status: 'absent' }
  | { status: 'unreadable'; label: string; error: string; inputVisible: boolean }
  | { status: 'ready'; testCase: SelectedTestCase };

/** Only visible testcase fields are authoritative; description examples are never
 * mixed into a selected/custom case. No page code or input expressions execute. */
export function readSelectedTestCase(): TestCaseRead {
  const tabs = leaves(document, CASE);
  if (!tabs.length) return { status: 'absent' };
  const ranked = tabs.map(tab => ({tab, score: activeScore(tab)})).sort((a, b) => b.score - a.score);
  const selected = ranked[0];
  const label = selected.score > 0 ? text(selected.tab) : 'Selected testcase';
  let root: Element | null = selected.tab.parentElement;
  while (root && root !== document.body && leaves(root, PARAM).length === 0) root = root.parentElement;
  const fail = (reason: string, inputVisible = true): TestCaseRead => ({inputVisible, status: 'unreadable', label,
    error: reason + ' Open LeetCode’s Testcase tab and select a case with complete inputs, then click Trace.'});
  if (!root || root === document.body) return fail('The selected testcase inputs are not visible.', false);
  const fields: { name: string; value: string }[] = [];
  for (const field of leaves(root, PARAM)) {
    const name = PARAM.exec(text(field))![1];
    const value = parameterValue(field, root);
    if (value === null || value === '') return fail('Could not read the value for ' + name + '.');
    if (fields.some(f => f.name === name)) return fail('More than one visible value was found for ' + name + '.');
    fields.push({name, value});
  }
  if (!fields.length) return fail('No testcase values were found.');
  return {status: 'ready', testCase: {
    label, input: fields.map(({name, value}) => name + ' = ' + value).join(',\n'),
  }};
}

export function testCaseFingerprint(read: TestCaseRead): string | null {
  if (read.status === 'absent') return null;
  if (read.status === 'unreadable') return read.inputVisible ? JSON.stringify([read.label, read.error]) : null;
  return JSON.stringify(read.testCase);
}

/** Poll also catches framework updates to textarea.value (not DOM attributes).
 * Capture input/change for custom edits and debounce React's tab replacement. */
export function watchTestCases(onChange: () => void): { reset: () => void; dispose: () => void } {
  let previous = testCaseFingerprint(readSelectedTestCase());
  let timer: number | undefined;
  const check = () => {
    const next = testCaseFingerprint(readSelectedTestCase());
    if (next === null) return;
    if (next !== previous) onChange();
    previous = next;
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 250);
  };
  document.addEventListener('click', schedule, true);
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
  const interval = window.setInterval(check, 750);
  return {
    reset: () => { previous = testCaseFingerprint(readSelectedTestCase()); },
    dispose: () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('click', schedule, true);
      document.removeEventListener('input', schedule, true);
      document.removeEventListener('change', schedule, true);
    },
  };
}
