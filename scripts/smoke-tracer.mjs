/**
 * Runs the tracer under real Pyodide (via the npm package) in Node.
 *
 * The pytest suite covers tracer logic under CPython; this covers the parts
 * only the browser runtime exercises — Pyodide's '<exec>' compile filename,
 * runPython/globals marshalling, and that the budgets actually unwind a
 * runaway loop in WASM. It needs no Chrome, so it can gate a build.
 *
 *   npm run smoke:pyodide
 */

import { readFileSync } from 'node:fs';
import { loadPyodide } from 'pyodide';

const tracerSource = readFileSync('src/offscreen/tracer.py', 'utf8');

const py = await loadPyodide();
py.runPython(tracerSource);
py.globals.set('__ms', 5000);
py.globals.set('__me', 200000);
py.runPython('configure(__ms, __me)');

function run(code, examples) {
  py.globals.set('__leettrace_code', code);
  py.globals.set('__leettrace_examples', examples);
  const json = py.runPython(
    'run_traced(__leettrace_code, list(__leettrace_examples) if __leettrace_examples is not None else [])',
  );
  return JSON.parse(json);
}

const TWO_SUM = `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            need = target - num
            if need in seen:
                return [seen[need], i]
            seen[num] = i
        return []
`;

const REVERSE = `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        curr = head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev
`;

const SPIN = `class Solution:
    def spin(self, n: int) -> int:
        total = 0
        while True:
            total += 1
        return total
`;

const BOOM = `class Solution:
    def boom(self, nums: List[int]) -> int:
        total = 0
        for x in nums:
            total += x
        return nums[99]
`;

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  PASS', label); }
  else { failures++; console.log('  FAIL', label, JSON.stringify(detail)); }
}

console.log('two-sum');
let r = run(TWO_SUM, ['nums = [2,7,11,15], target = 9']);
check('no error', r.error === null, r.error);
check('returnValue [0,1]', JSON.stringify(r.returnValue) === '[0,1]', r.returnValue);
check('frames are user frames', [...new Set(r.snapshots.map(s => s.frameName))].every(n => n === '<module>' || n === 'twoSum'), [...new Set(r.snapshots.map(s => s.frameName))]);
check('schema v2 fields', r.snapshots.every(s => 'event' in s && 'frameId' in s && 'callDepth' in s), Object.keys(r.snapshots[0] ?? {}));

console.log('reverse linked list (B2 input building)');
r = run(REVERSE, ['head = [1,2,3,4,5]']);
check('no error', r.error === null, r.error);
check('returnValue reversed', JSON.stringify(r.returnValue) === '[5,4,3,2,1]', r.returnValue);

console.log('infinite loop (B1 budgets)');
const t0 = Date.now();
r = run(SPIN, ['n = 1']);
const ms = Date.now() - t0;
check('terminated', r.truncated === true, r);
// With production budgets a tight loop trips the snapshot cap first; the
// event cap backstops loops whose events don't produce snapshots. Either way
// execution unwinds instead of hanging, which is what B1 was about.
check('limit is a budget', r.limit === 'events' || r.limit === 'snapshots', r.limit);
check('no error surfaced', r.error === null, r.error);
check('finished quickly (<20s)', ms < 20000, ms + 'ms');

console.log('runtime error (B9 line clamp)');
r = run(BOOM, ['nums = [1,2,3]']);
check('error reported', r.error !== null, r.error);
check('line 6', r.error && r.error.line === 6, r.error);
check('line within user code', r.error && r.error.line <= BOOM.split('\n').length, r.error);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
