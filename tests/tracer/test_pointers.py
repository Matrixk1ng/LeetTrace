"""M3 — the static indexing pass behind pointer inference (bug B3).

The old runtime heuristic made every in-range int a pointer on every array.
These tests pin what the AST pass will and won't associate; the TypeScript side
that turns the map into pointers is covered in tests/unit/pointers.test.ts.
"""

import ast

import fixtures
import pytest


def index_map(tracer, code):
    return tracer._analyze_indexing(ast.parse(code))


def row(tracer, code, array):
    return set(index_map(tracer, code).get(array, {}).get('row', []))


def col(tracer, code, array):
    return set(index_map(tracer, code).get(array, {}).get('col', []))


# --------------------------------------------------------------------------
# What must be found
# --------------------------------------------------------------------------

def test_direct_subscript(tracer):
    code = '''class Solution:
    def f(self, nums: List[int]) -> int:
        for i in range(len(nums)):
            print(nums[i])
        return 0
'''
    assert row(tracer, code, 'nums') == {'i'}


def test_two_pointer_pair(tracer):
    code = '''class Solution:
    def isPal(self, s: str) -> bool:
        left = 0
        right = len(s) - 1
        while left < right:
            if s[left] != s[right]:
                return False
            left += 1
            right -= 1
        return True
'''
    assert row(tracer, code, 's') == {'left', 'right'}


def test_binary_search_bounds_reach_the_array_through_mid(tracer):
    """Only `mid` ever subscripts `nums`; `lo`/`hi` are pointers all the same,
    reached through `mid = (lo + hi) // 2`."""
    assert row(tracer, fixtures.BINARY_SEARCH, 'nums') == {'mid', 'lo', 'hi'}


def test_two_dimensional_subscript_splits_the_axes(tracer):
    code = '''class Solution:
    def islands(self, grid: List[List[str]]) -> int:
        count = 0
        for i in range(len(grid)):
            for j in range(len(grid[0])):
                if grid[i][j] == "1":
                    count += 1
        return count
'''
    assert row(tracer, code, 'grid') == {'i'}
    assert col(tracer, code, 'grid') == {'j'}


def test_dp_table_axes(tracer):
    code = '''class Solution:
    def paths(self, m: int, n: int) -> int:
        dp = [[1] * n for _ in range(m)]
        for i in range(1, m):
            for j in range(1, n):
                dp[i][j] = dp[i-1][j] + dp[i][j-1]
        return dp[m-1][n-1]
'''
    assert row(tracer, code, 'dp') == {'i'}
    assert col(tracer, code, 'dp') == {'j'}


def test_while_bound_comparison(tracer):
    code = '''class Solution:
    def f(self, nums: List[int]) -> int:
        i = 0
        while i < len(nums):
            i += 1
        return i
'''
    assert 'i' in row(tracer, code, 'nums')


# --------------------------------------------------------------------------
# What must NOT be found — these are the B3 false positives
# --------------------------------------------------------------------------

def test_a_plain_value_never_becomes_a_pointer(tracer):
    """`target = 9` used to render as an arrow on a 15-element `nums`."""
    assert 'target' not in row(tracer, fixtures.TWO_SUM, 'nums')


def test_counters_and_lengths_are_not_pointers(tracer):
    code = '''class Solution:
    def f(self, nums: List[int]) -> int:
        n = len(nums)
        count = 0
        total = 0
        for i in range(n):
            count += 1
            total += nums[i]
        return total
'''
    assert row(tracer, code, 'nums') == {'i'}


def test_annotations_are_not_treated_as_subscripts(tracer):
    """`List[int]` is an ast.Subscript exactly like `nums[i]`."""
    mapping = index_map(tracer, fixtures.TWO_SUM)
    assert 'List' not in mapping
    assert 'Optional' not in index_map(tracer, fixtures.REVERSE_LINKED_LIST)


def test_a_compound_slice_does_not_invent_an_index(tracer):
    """`nums[stack[-1]]` is evidence about the expression, not about `stack`."""
    assert row(tracer, fixtures.MONOTONIC_STACK, 'nums') == set()


def test_a_non_pointer_name_is_not_carried_across_a_comparison(tracer):
    code = '''class Solution:
    def f(self, nums: List[int], target: int) -> int:
        i = 0
        while i < target:
            print(nums[i])
            i += 1
        return i
'''
    assert row(tracer, code, 'nums') == {'i'}


@pytest.mark.parametrize('code', ['', 'x = 1', 'class Solution:\n    pass\n'])
def test_degenerate_sources_produce_an_empty_map(tracer, code):
    assert index_map(tracer, code) == {}


# --------------------------------------------------------------------------
# Node identity, which the TS side turns into node pointers
# --------------------------------------------------------------------------

def test_linked_list_carries_node_ids(run):
    result = run(fixtures.HAS_CYCLE, ['head = [3,2,0,-4], pos = 1'])

    head = None
    for snap in reversed(result['snapshots']):
        if 'head' in snap['variables']:
            head = snap['variables']['head']['value']
            break

    assert head['__type'] == 'linked_list'
    assert len(head['nodeIds']) == len(head['nodes'])
    assert len(set(head['nodeIds'])) == len(head['nodeIds'])
    assert head['has_cycle'] is True
    assert head['cycleIndex'] == 1


def test_a_variable_pointing_mid_list_shares_ids_with_the_head(run):
    result = run(fixtures.REVERSE_LINKED_LIST, ['head = [1,2,3]'])

    # On the first step of the loop, `curr` is `head` — same node identity.
    for snap in result['snapshots']:
        variables = snap['variables']
        if 'curr' in variables and 'head' in variables:
            curr = variables['curr']['value']
            head = variables['head']['value']
            if isinstance(curr, dict) and isinstance(head, dict):
                assert curr['nodeIds'][0] in head['nodeIds']
                return
    raise AssertionError('curr and head never appeared together')


def test_tree_nodes_carry_ids(run):
    result = run(fixtures.INVERT_TREE, ['root = [4,2,7]'])

    root = None
    for snap in result['snapshots']:
        if 'root' in snap['variables']:
            value = snap['variables']['root']['value']
            if isinstance(value, dict) and value.get('__type') == 'tree':
                root = value['root']
                break

    assert root is not None
    assert isinstance(root['id'], str)
    assert root['left'] is None or isinstance(root['left']['id'], str)


def test_indexing_is_reported_on_the_result(run):
    result = run(fixtures.BINARY_SEARCH, ['nums = [1,2,3], target = 3'])

    assert 'nums' in result['indexing']
    assert set(result['indexing']['nums']['row']) == {'mid', 'lo', 'hi'}
