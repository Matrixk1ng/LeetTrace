"""Golden-ish tests for the tracer, one per problem archetype (DESIGN.md §10).

They assert structure and invariants rather than exact snapshot counts, so
they stay useful while the snapshot schema keeps growing.
"""

import fixtures
import pytest


def last_var(result, name):
    """Value of `name` on the last snapshot that has it."""
    for snap in reversed(result['snapshots']):
        if name in snap['variables']:
            return snap['variables'][name]['value']
    raise AssertionError(name + ' never appeared in the trace')


def lines(result):
    return [s['line'] for s in result['snapshots']]


# --------------------------------------------------------------------------
# Baseline: arrays / hashmaps must not regress
# --------------------------------------------------------------------------

def test_two_sum_traces_and_returns(run):
    result = run(fixtures.TWO_SUM, ['nums = [2,7,11,15], target = 9'])

    assert result['error'] is None
    assert result['truncated'] is False
    assert result['returnValue'] == [0, 1]
    assert result['snapshots'], 'expected at least one snapshot'
    assert last_var(result, 'seen') == {'2': 0}
    assert last_var(result, 'return') == [0, 1]


def test_snapshot_carries_schema_v2_fields(run):
    result = run(fixtures.TWO_SUM, ['nums = [2,7,11,15], target = 9'])

    for snap in result['snapshots']:
        assert set(snap) >= {
            'step', 'line', 'event', 'frameId', 'frameName', 'callDepth', 'variables',
        }
        assert snap['event'] in ('line', 'call', 'return')
        assert isinstance(snap['callDepth'], int)
        assert isinstance(snap['frameId'], str) and '#' in snap['frameId']

    assert [s['step'] for s in result['snapshots']] == list(range(len(result['snapshots'])))
    assert any(s['frameName'] == 'twoSum' for s in result['snapshots'])


def test_lines_stay_inside_user_code(run):
    code = fixtures.TWO_SUM
    max_line = code.count('\n') + 1
    result = run(code, ['nums = [2,7,11,15], target = 9'])

    assert max(lines(result)) <= max_line


def test_binary_search(run):
    result = run(fixtures.BINARY_SEARCH, ['nums = [-1,0,3,5,9,12], target = 9'])

    assert result['error'] is None
    assert result['returnValue'] == 4
    assert last_var(result, 'mid') == 4


# --------------------------------------------------------------------------
# B2 — object inputs (linked lists, trees)
# --------------------------------------------------------------------------

def test_reverse_linked_list_builds_nodes(run):
    result = run(fixtures.REVERSE_LINKED_LIST, ['head = [1,2,3,4,5]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == [5, 4, 3, 2, 1]

    head = last_var(result, 'head')
    assert head['__type'] == 'linked_list'


def test_merge_two_lists_builds_both_arguments(run):
    result = run(fixtures.MERGE_TWO_LISTS, ['list1 = [1,2,4], list2 = [1,3,4]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == [1, 1, 2, 3, 4, 4]


def test_merge_k_lists_builds_a_list_of_nodes(run):
    result = run(fixtures.MERGE_K_LISTS, ['lists = [[1,4,5],[1,3,4],[2,6]]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == [1, 1, 2, 3, 4, 4, 5, 6]


def test_pos_links_a_cycle_and_is_not_passed_as_a_kwarg(run):
    result = run(fixtures.HAS_CYCLE, ['head = [3,2,0,-4], pos = 1'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] is True
    assert last_var(result, 'head')['has_cycle'] is True


def test_pos_minus_one_leaves_the_list_acyclic(run):
    result = run(fixtures.HAS_CYCLE, ['head = [1,2], pos = -1'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] is False


def test_level_order_builds_a_tree_with_none_gaps(run):
    result = run(fixtures.LEVEL_ORDER, ['root = [3,9,20,null,null,15,7]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == [[3], [9, 20], [15, 7]]


def test_tree_return_value_is_converted_to_level_order(run):
    result = run(fixtures.INVERT_TREE, ['root = [4,2,7,1,3,6,9]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == [4, 7, 2, 9, 6, 3, 1]


def test_unannotated_code_falls_back_to_raw_arguments(run):
    code = '''class Solution:
    def add(self, a, b):
        return a + b
'''
    result = run(code, ['a = 2, b = 3'])

    assert result['error'] is None
    assert result['returnValue'] == 5


def test_next_example_is_tried_when_the_first_does_not_bind(run):
    result = run(
        fixtures.BINARY_SEARCH,
        ['haystack = "abc", needle = "b"', 'nums = [1,2,3], target = 3'],
    )

    assert result['error'] is None, result['error']
    assert result['returnValue'] == 2


def test_unparseable_example_is_skipped(run):
    result = run(fixtures.TWO_SUM, ['not an example at all', 'nums = [3,3], target = 6'])

    assert result['error'] is None
    assert result['returnValue'] == [0, 1]


def test_no_example_still_executes_the_module(run):
    result = run(fixtures.TWO_SUM, [])

    assert result['error'] is None
    assert result['returnValue'] is None


def test_code_with_its_own_top_level_call_is_not_auto_run(run):
    code = fixtures.TWO_SUM + '\nprint(Solution().twoSum([1,2], 3))\n'
    result = run(code, ['nums = [2,7,11,15], target = 9'])

    assert result['error'] is None
    # The user's own call ran with its own arguments, not the example's.
    assert last_var(result, 'nums') == [1, 2]


# --------------------------------------------------------------------------
# Recursion: frame identity and depth
# --------------------------------------------------------------------------

def test_backtracking_reports_growing_call_depth(run):
    result = run(fixtures.SUBSETS, ['nums = [1,2,3]'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]

    depths = [s['callDepth'] for s in result['snapshots'] if s['frameName'] == 'backtrack']
    assert max(depths) >= 3

    frame_ids = {s['frameId'] for s in result['snapshots'] if s['frameName'] == 'backtrack'}
    assert len(frame_ids) > 1, 'each backtrack invocation needs its own frameId'


def test_recursive_tree_calls_get_distinct_frame_ids(run):
    result = run(fixtures.INVERT_TREE, ['root = [4,2,7,1,3,6,9]'])

    ids = {s['frameId'] for s in result['snapshots'] if s['frameName'] == 'invertTree'}
    assert len(ids) >= 3


# --------------------------------------------------------------------------
# B1 / §5.3 — budgets
# --------------------------------------------------------------------------

def test_infinite_loop_stops_at_the_event_budget(tracer, run):
    tracer.configure(max_snapshots=10 ** 9, max_events=5000)
    result = run(fixtures.INFINITE_LOOP, ['n = 1'])

    assert result['truncated'] is True
    assert result['limit'] == 'events'
    assert result['error'] is None, 'a budget stop is not a user error'


def test_limit_error_is_not_swallowed_by_user_except_blocks(tracer, run):
    tracer.configure(max_snapshots=10 ** 9, max_events=5000)
    result = run(fixtures.INFINITE_LOOP_SWALLOWED, ['n = 1'])

    assert result['truncated'] is True
    assert result['limit'] == 'events'


def test_snapshot_cap_truncates_and_stops(tracer, run):
    tracer.configure(max_snapshots=50, max_events=10 ** 9)
    result = run(fixtures.BIG_INPUT, ['nums = ' + str(list(range(5000)))])

    assert result['truncated'] is True
    assert result['limit'] == 'snapshots'
    assert len(result['snapshots']) == 50


def test_large_input_within_budget_completes(tracer, run):
    tracer.configure(max_snapshots=10 ** 9, max_events=10 ** 9)
    result = run(fixtures.BIG_INPUT, ['nums = ' + str(list(range(5000)))])

    assert result['error'] is None
    assert result['returnValue'] == sum(range(5000))


# --------------------------------------------------------------------------
# B9 — error reporting
# --------------------------------------------------------------------------

def test_runtime_error_points_at_the_failing_user_line(run):
    code = fixtures.RUNTIME_ERROR
    result = run(code, ['nums = [1,2,3]'])

    assert result['error'] is not None
    assert result['error']['message'].startswith('IndexError')
    assert result['error']['line'] == 6, code.splitlines()[5]
    assert result['error']['line'] <= code.count('\n') + 1


def test_error_line_never_exceeds_the_users_last_line(run):
    # A signature mismatch fails at the call site, which lives outside the
    # user's code entirely — the reported line must still be in range (B9).
    code = '''class Solution:
    def solve(self, nums: List[int]) -> int:
        return len(nums)
'''
    result = run(code, ['nums = [1], extra = 2, more = 3'])
    max_line = code.count('\n') + 1

    if result['error'] is not None:
        assert 0 <= result['error']['line'] <= max_line


def test_syntax_error_is_reported_with_its_line(run):
    result = run('class Solution:\n    def f(self)\n        return 1\n', [])

    assert result['error'] is not None
    assert result['error']['message'].startswith('SyntaxError')
    assert result['error']['line'] == 2
    assert result['snapshots'] == []


def test_snapshots_up_to_the_error_are_kept(run):
    result = run(fixtures.RUNTIME_ERROR, ['nums = [1,2,3]'])

    assert result['snapshots'], 'the state leading up to the failure is the teaching moment'
    assert last_var(result, 'total') == 6


# --------------------------------------------------------------------------
# stdout
# --------------------------------------------------------------------------

def test_print_output_is_attached_to_the_step_that_emitted_it(run, capsys):
    result = run(fixtures.PRINTS, ['n = 3'])

    assert result['error'] is None
    emitted = ''.join(s.get('stdout', '') for s in result['snapshots'])
    assert 'start' in emitted
    assert '2' in emitted

    # Captured, not leaked to the host's real stdout.
    assert 'start' not in capsys.readouterr().out


def test_stdout_is_restored_after_a_run(run):
    import sys

    before = sys.stdout
    run(fixtures.PRINTS, ['n = 1'])
    assert sys.stdout is before


# --------------------------------------------------------------------------
# Hygiene
# --------------------------------------------------------------------------

def test_injected_baseline_names_are_not_reported_as_variables(run):
    result = run(fixtures.LEVEL_ORDER, ['root = [1]'])

    for snap in result['snapshots']:
        for name in snap['variables']:
            assert not name.startswith('_')
            assert name not in {'List', 'Optional', 'deque', 'TreeNode', 'Solution'}


def test_tracing_is_disabled_after_a_run(run):
    import sys

    run(fixtures.TWO_SUM, ['nums = [2,7,11,15], target = 9'])
    assert sys.gettrace() is None


def test_consecutive_runs_do_not_share_state(run):
    first = run(fixtures.TWO_SUM, ['nums = [2,7,11,15], target = 9'])
    second = run(fixtures.TWO_SUM, ['nums = [3,2,4], target = 6'])

    assert second['snapshots'][0]['step'] == 0
    assert second['returnValue'] == [1, 2]
    assert first['returnValue'] == [0, 1]


@pytest.mark.parametrize(
    'example,expected',
    [
        ('nums = [1,2], target = 3', {'nums': [1, 2], 'target': 3}),
        ('root = [1,null,2]', {'root': [1, None, 2]}),
        ('flag = true, other = false', {'flag': True, 'other': False}),
        ('s = "abc"', {'s': 'abc'}),
        ('grid = [[1,2],[3,4]]', {'grid': [[1, 2], [3, 4]]}),
        ('n = -5', {'n': -5}),
        ('garbage', None),
        ('', None),
    ],
)
def test_example_parsing(tracer, example, expected):
    assert tracer._parse_example(example) == expected


@pytest.mark.parametrize(
    'annotation,kind',
    [
        ('Optional[ListNode]', 'list_node'),
        ('ListNode', 'list_node'),
        ('List[Optional[ListNode]]', 'list_of_list_node'),
        ('Optional[TreeNode]', 'tree_node'),
        ('List[TreeNode]', 'list_of_tree_node'),
        ('List[int]', None),
        ('int', None),
        (None, None),
    ],
)
def test_annotation_classification(tracer, annotation, kind):
    assert tracer._classify_annotation(annotation) == kind


@pytest.mark.parametrize(
    'values,expected',
    [
        ([], []),
        ([1], [1]),
        ([3, 9, 20, None, None, 15, 7], [3, 9, 20, None, None, 15, 7]),
        ([1, None, 2], [1, None, 2]),
    ],
)
def test_tree_build_round_trips(tracer, values, expected):
    class Node:
        def __init__(self, val=0, left=None, right=None):
            self.val = val
            self.left = left
            self.right = right

    assert tracer._from_tree_node(tracer._to_tree_node(values, Node)) == expected


def test_infinite_loop_stops_under_production_budgets(tracer, run):
    """No configure() call: the shipped MAX_SNAPSHOTS / MAX_EVENTS must be
    enough on their own to unwind a runaway loop (B1)."""
    result = run(fixtures.INFINITE_LOOP, ['n = 1'])

    assert result['truncated'] is True
    assert result['limit'] in ('events', 'snapshots')
    assert result['error'] is None
    assert len(result['snapshots']) <= tracer.MAX_SNAPSHOTS
