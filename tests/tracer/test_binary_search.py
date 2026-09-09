from pathlib import Path

CODE = Path('tests/dev/binary-search-example.py').read_text()


def observations(result):
    assert result['error'] is None
    return [(s, s['visual']['binary']) for s in result['snapshots'] if s['visual'].get('binary')]


def test_midpoint_comparison_and_bounds_are_separate(run):
    result = run(CODE, ['nums = [1,3,5,7,9,11,13], target = 11'])
    rows = observations(result)
    assert result['returnValue'] == 5
    assert [w['mid'] for _, w in rows if w['kind'] == 'midpoint'] == [3, 5]
    comparison = next(w for _, w in rows if w['kind'] == 'compare')
    assert comparison['comparison']['operator'] == '=='
    assert comparison['comparison']['outcome'] is False
    move = next(w for _, w in rows if w['kind'] == 'move')
    assert [move['low'], move['high']] == [4, 6]
    assert move['mid'] == 3 and move['midCurrent'] is False
    assert move['lastComparison']['bounds'] == [0, 6]


def test_absent_empty_singleton_and_duplicates(run):
    for nums, target, expected in [([1,3,5,7,9,11,13],8,-1), ([],5,-1), ([3],3,0), ([3],4,-1), ([1,3,3,3,5],3,2)]:
        result = run(CODE, [f'nums = {nums}, target = {target}'])
        rows = observations(result)
        assert rows and result['returnValue'] == expected
        if expected == -1:
            assert rows[-1][1]['low'] > rows[-1][1]['high']
            assert rows[-1][1]['midCurrent'] is False
        if not nums:
            assert all('mid' not in w for _, w in rows)


def test_offset_midpoint_spelling(run):
    rows = observations(run(CODE.replace('(low + high) // 2', 'low + (high - low) // 2'), ['nums = [1,3,5], target = 5']))
    assert [w['mid'] for _, w in rows if w['kind'] == 'midpoint'] == [1, 2]


def test_unknown_conventions_unsorted_and_custom_comparisons_abstain(run):
    assert observations(run(CODE.replace('low <= high', 'low < high'), ['nums = [1,3,5], target = 3'])) == []
    assert observations(run(CODE, ['nums = [3,1,5], target = 1'])) == []
    code = CODE.replace('if nums[mid] == target:', 'if str(nums[mid]) == str(target):')
    rows = observations(run(code, ['nums = [1,3,5], target = 3']))
    assert all(w['kind'] != 'compare' for _, w in rows)


def test_midpoint_reassignment_does_not_invoke_custom_equality(run):
    code = '''class Index:
    def __eq__(self, other):
        print("equal")
        return False
    def __index__(self):
        return 0
def solve():
    nums = [1]
    low, high = 0, 0
    while low <= high:
        mid = (low + high) // 2
        mid = Index()
        if nums[mid] == 1:
            return 0
solve()
'''
    result = run(code)
    observations(result)
    assert 'equal' not in ''.join(s.get('stdout', '') for s in result['snapshots'])
