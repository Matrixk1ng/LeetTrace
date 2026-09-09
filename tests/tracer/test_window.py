from pathlib import Path

CODE = Path('tests/dev/sliding-window-example.py').read_text()


def observed(result):
    assert result['error'] is None
    return [(s, s['visual']['window']) for s in result['snapshots'] if 'window' in s['visual']]


def test_membership_tracks_subtraction_before_pointer_advance(run):
    result = run(CODE, ['nums = [2,1,5,1,3,2], k = 3'])
    rows = observed(result)
    assert result['returnValue'] == 9
    assert rows
    for s, w in rows:
        assert w['total'] == sum(s['variables']['nums']['value'][i] for i in w['indices'])
    s, removed = next((s, w) for s, w in rows if w['kind'] == 'remove')
    assert removed['indices'] == [1, 2]
    assert s['variables']['left']['value'] == 0
    assert removed['before'] == 8 and removed['total'] == 6
    assert rows[-1][1]['best'] == {'name': 'best', 'value': 9, 'indices': [2, 3, 4]}


def test_negative_values_ties_and_width_extremes(run):
    for nums, k, expected, indices in [([-4,-2,-5,-1,-3,-2],3,-6,[3,4,5]), ([1,2,1,2,1,2],3,5,[1,2,3]), ([2,1,5],1,5,[2]), ([2,1,5],3,8,[0,1,2])]:
        rows = observed(run(CODE, [f'nums = {nums}, k = {k}']))
        assert rows[-1][1]['best']['value'] == expected
        assert rows[-1][1]['best']['indices'] == indices
        assert all(len(w['indices']) == k for _, w in rows if w['kind'] in ('check', 'save'))


def test_slice_initialization_and_add_before_remove(run):
    result = run('''class Solution:
    def solve(self, nums, k):
        total = sum(nums[:k])
        best = float('-inf')
        best = max(best, total)
        for right in range(k, len(nums)):
            total += nums[right]
            total -= nums[right-k]
            best = max(best, total)
        return best
''', ['nums = [2,1,5,1,3,2], k = 3'])
    rows = observed(result)
    assert rows[0][1]['indices'] == [0,1,2]
    assert any(len(w['indices']) == 4 for _, w in rows)
    assert rows[-1][1]['best']['value'] == 9


def test_mutation_invalidates_membership_and_custom_types_abstain(run):
    code = CODE.replace('total += nums[right]', 'total += nums[right]\n            nums[right] = 99')
    rows = observed(run(code, ['nums = [2,1,5], k = 3']))
    assert all(w['kind'] not in ('save', 'check') for _, w in rows)
    result = run('''class Numbers(list):
    pass
def solve():
    nums = Numbers([1,2,3])
    k = 2
    total = 0
    for right in range(3):
        total += nums[right]
        if right >= k:
            total -= nums[right-k]
    return total
solve()
''')
    assert observed(result) == []


def test_unknown_initial_aggregate_is_not_an_empty_window(run):
    assert observed(run(CODE.replace('total = 0', 'total = 7'), ['nums = [2,1,5], k = 3'])) == []
