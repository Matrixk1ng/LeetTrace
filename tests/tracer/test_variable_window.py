from pathlib import Path

CODE = Path('tests/dev/variable-window-example.py').read_text()


def windows(result):
    assert result['error'] is None
    return [(s, s['visual']['window']) for s in result['snapshots'] if s['visual'].get('window', {}).get('mode') == 'variable']


def test_condition_is_pending_then_confirmed_by_loop_entry(run):
    result = run(CODE, ['target = 7, nums = [2,3,1,2,4,3]'])
    rows = windows(result)
    assert result['returnValue'] == 2
    assert rows
    for s, w in rows:
        assert w['total'] == sum(s['variables']['nums']['value'][i] for i in w['indices'])
        if w['kind'] == 'condition':
            assert w['condition']['outcome'] == (w['total'] >= 7)
        if w['kind'] in ('add', 'remove'):
            assert 'outcome' not in w['condition']
    assert rows[-1][1]['best']['indices'] == [4, 5]
    assert rows[-1][1]['best']['value'] == 2
    s, removed = next((s, w) for s, w in rows if w['kind'] == 'remove')
    assert s['variables']['left']['value'] == 0
    assert removed['indices'] == [1, 2, 3]


def test_no_solution_single_value_and_equal_length_results(run):
    for target, nums, expected in [(100,[2,3,1],0), (4,[2,3,1,2,4,3],1), (5,[2,3,2,3],2)]:
        result = run(CODE, [f'target = {target}, nums = {nums}'])
        rows = windows(result)
        assert result['returnValue'] == expected
        if expected == 0:
            assert all('best' not in w for _, w in rows)
        else:
            assert rows[-1][1]['best']['value'] == expected
        if target == 5:
            assert rows[-1][1]['best']['indices'] == [0, 1]


def test_nonpositive_values_and_complex_conditions_abstain(run):
    for nums in ('[2,-1,3]', '[0,2,3]', '[]'):
        assert windows(run(CODE, [f'target = 4, nums = {nums}'])) == []
    assert windows(run(CODE.replace('while total >= target:', 'while total >= target and left <= right:'), ['target = 4, nums = [2,3,4]'])) == []


def test_unrelated_length_assignment_is_not_a_best_result(run):
    code = CODE.replace('best = min(best, right - left + 1)', 'best = right - left + 1')
    assert all('best' not in w for _, w in windows(run(code, ['target = 7, nums = [2,3,1,2,4,3]'])))


def test_shadowed_min_is_not_evaluated_by_observer(run):
    code = CODE.replace('best = float(\'inf\')', '''best = float('inf')
        def min(a, b):
            print("user-min")
            return a if a < b else b''')
    result = run(code, ['target = 4, nums = [4]'])
    assert all('best' not in w for _, w in windows(result))
    assert ''.join(s.get('stdout', '') for s in result['snapshots']).count('user-min') == 1
