from pathlib import Path

CODE = Path('tests/dev/two-pointer-example.py').read_text()


def observations(result):
    assert result['error'] is None
    return [s['visual']['pair'] for s in result['snapshots'] if 'pair' in s['visual']]


def test_sums_branches_and_movements_are_separate(run):
    result = run(CODE, ['nums = [1,3,4,6,8,10], target = 12'])
    pairs = observations(result)
    assert result['returnValue'] == [2, 4]
    assert pairs[0]['kind'] == 'read' and 'pair' not in pairs[0]
    assert pairs[1]['kind'] == 'sum' and pairs[1]['pair']['sum'] == 11
    assert [(p['comparison']['operator'], p['comparison']['outcome']) for p in pairs if p['kind'] == 'compare'] == [('==', False), ('<', True), ('==', False), ('<', False), ('==', False), ('<', True), ('==', True)]
    moves = [p for p in pairs if p['kind'] == 'move']
    assert [p['indices'] for p in moves] == [[1, 5], [1, 4], [2, 4]]
    assert moves[0]['pair']['indices'] == [0, 5]


def test_duplicate_values_and_meeting_indices(run):
    result = run(CODE, ['nums = [1,3,3,6], target = 6'])
    assert result['returnValue'] == [1, 2]
    assert observations(result)[-1]['indices'] == [1, 2]
    result = run(CODE, ['nums = [1,3,4,6], target = 30'])
    pairs = observations(result)
    assert result['returnValue'] == []
    assert pairs[-1]['indices'] == [3, 3]
    assert all(p['indices'][0] != p['indices'][1] for p in pairs if p['kind'] == 'read')


def test_empty_and_singleton_do_not_invent_pairs(run):
    for nums in ('[]', '[1]'):
        result = run(CODE, [f'nums = {nums}, target = 2'])
        assert observations(result) == []


def test_custom_values_and_indices_are_not_executed_by_observer(run):
    result = run('''class Number(int):
    def __add__(self, other):
        print("add")
        return 3
def solve():
    nums = [Number(1), Number(2)]
    left, right = 0, 1
    total = nums[left] + nums[right]
    return total
solve()
''')
    assert observations(result) == []
    assert ''.join(s.get('stdout', '') for s in result['snapshots']).count('add') == 1


def test_exception_cancels_branch_observation(run):
    result = run('''def solve():
    nums = [1, 2]
    left, right = 0, 1
    total = nums[left] + nums[right]
    try:
        if total == 3:
            raise ValueError()
    except ValueError:
        pass
    return []
solve()
''')
    # Entering the raise line proves the branch, but no further pair state survives.
    pairs = observations(result)
    assert pairs[-1]['kind'] == 'compare'
    assert pairs[-1]['comparison']['outcome'] is True
