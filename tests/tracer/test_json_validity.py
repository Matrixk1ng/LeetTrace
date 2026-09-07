"""The tracer's output must be valid JSON *by JavaScript's rules*.

Python's json.loads accepts bare `Infinity`, `-Infinity` and `NaN`; JSON.parse
does not. That gap is how `float('-inf')` — completely ordinary in a LeetCode
solution — shipped a tracer whose output the worker could not read, failing
every such trace with "Failed to parse execution output" while the whole pytest
suite stayed green.

conftest's `run` fixture now parses strictly, so every other test in the suite
guards this too. These pin it directly.
"""

import json

import pytest
from conftest import parse_strict

VALID_BST = '''class Solution:
    def isValidBST(self, root: Optional[TreeNode]) -> bool:
        def dfs(node, low, high):
            if not node:
                return True
            if not (low < node.val < high):
                return False
            return dfs(node.left, low, node.val) and dfs(node.right, node.val, high)

        return dfs(root, float('-inf'), float('inf'))
'''

RUNNING_MIN = '''class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        best = 0
        low = float('inf')
        for price in prices:
            low = min(low, price)
            best = max(best, price - low)
        return best
'''

NAN = '''class Solution:
    def odd(self, n: int) -> float:
        bad = float('nan')
        return bad
'''

INF_IN_CONTAINERS = '''class Solution:
    def spread(self, n: int) -> List[float]:
        row = [float('inf'), float('-inf')]
        table = [[float('inf')] * 2 for _ in range(2)]
        lookup = {'lo': float('-inf')}
        return row
'''


def js_parseable(text):
    """What JSON.parse would accept — no Python leniency."""
    try:
        parse_strict(text)
    except AssertionError:
        return False
    return True


@pytest.mark.parametrize(
    'code,example',
    [
        (VALID_BST, 'root = [2,1,3]'),
        (RUNNING_MIN, 'prices = [7,1,5,3,6,4]'),
        (NAN, 'n = 1'),
        (INF_IN_CONTAINERS, 'n = 2'),
    ],
)
def test_output_is_javascript_parseable(tracer, code, example):
    text = tracer.run_traced(code, [example])

    assert 'Infinity' not in text
    assert 'NaN' not in text
    assert js_parseable(text), text[:400]


def test_valid_bst_actually_runs(run):
    result = run(VALID_BST, ['root = [2,1,3]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] is True


def test_infinite_bounds_render_in_pythons_spelling(run):
    result = run(VALID_BST, ['root = [2,1,3]'])

    seen = set()
    for snap in result['snapshots']:
        for name in ('low', 'high'):
            entry = snap['variables'].get(name)
            if entry is not None and isinstance(entry['value'], str):
                seen.add(entry['value'])

    assert 'inf' in seen
    assert '-inf' in seen


def test_running_min_keeps_its_float_type(run):
    result = run(RUNNING_MIN, ['prices = [7,1,5,3,6,4]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == 5

    first = next(s['variables']['low'] for s in result['snapshots'] if 'low' in s['variables'])
    # The value is stringified because JSON has no infinity, but the Python
    # type is reported unchanged.
    assert first['type'] == 'float'


def test_non_finite_floats_inside_containers_are_converted(run):
    result = run(INF_IN_CONTAINERS, ['n = 2'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == ['inf', '-inf']

    table = next(s['variables']['table'] for s in result['snapshots'] if 'table' in s['variables'])
    assert table['value'] == [['inf', 'inf'], ['inf', 'inf']]

    lookup = next(s['variables']['lookup'] for s in result['snapshots'] if 'lookup' in s['variables'])
    assert lookup['value'] == {'lo': '-inf'}


def test_dump_sweeps_anything_that_bypassed_serialize(tracer):
    # _dump is the last line of defence — a future code path that reaches the
    # result without going through _serialize must still not emit invalid JSON.
    text = tracer._dump({'sneaky': float('inf'), 'nested': [float('nan')]})

    assert json.loads(text) == {'sneaky': 'inf', 'nested': ['nan']}
    assert js_parseable(text)


def test_finite_floats_are_left_alone(run):
    code = '''class Solution:
    def half(self, n: int) -> float:
        value = n / 2
        return value
'''
    result = run(code, ['n = 5'])

    assert result['returnValue'] == 2.5
