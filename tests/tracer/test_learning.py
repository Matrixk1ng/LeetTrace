from pathlib import Path


def effects(result):
    assert result['error'] is None
    return [(s, e) for s in result['snapshots'] for e in s['visual'].get('learning', [])]


def test_memo_assignment_waits_for_child_returns(run):
    result = run(Path('tests/dev/dp-top-down-example.py').read_text(), ['n = 5'])
    observed = effects(result)
    writes = [(e['key'], e['value']) for _, e in observed if e['kind'] == 'memo-write']
    assert writes == [(2, 2), (3, 3), (4, 5), (5, 8)]
    assert result['returnValue'] == 8
    for snapshot, e in observed:
        if e['kind'] == 'stored-return':
            assert snapshot['event'] == 'return'
            assert snapshot['variables']['return']['value'] == e['value']


def test_table_reads_precede_confirmed_writes(run):
    result = run(Path('tests/dev/dp-bottom-up-example.py').read_text(), ['n = 5'])
    observed = effects(result)
    assert [e['kind'] for _, e in observed] == ['table-read', 'table-write'] * 4
    for snapshot, e in observed:
        assert e['reads'] == [e['key'] - 1, e['key'] - 2]
        assert snapshot['variables']['dp']['value'][e['key']] == (0 if e['kind'] == 'table-read' else e['value'])
    assert result['returnValue'] == 8


def test_failed_assignment_does_not_claim_save(run):
    result = run('''def solve():
    memo = {2: 99}
    try:
        memo[2] = 1 / 0
    except ZeroDivisionError:
        pass
    return memo[2]
solve()
''')
    assert not any(e['kind'] == 'memo-write' for _, e in effects(result))


def test_metadata_does_not_call_custom_index_or_container_methods(run):
    result = run('''class Custom(list):
    def __getitem__(self, key):
        print("read")
        return super().__getitem__(key)
def solve():
    dp = Custom([1, 1, 0])
    dp[2] = dp[0] + dp[1]
    return dp
solve()
''')
    assert effects(result) == []
    assert ''.join(s.get('stdout', '') for s in result['snapshots']).count('read') == 2


def test_zero_false_and_empty_memo_values_are_preserved(run):
    result = run('''def solve():
    memo = {}
    memo[0] = False
    return memo[0]
solve()
''')
    observed = effects(result)
    assert [e['kind'] for _, e in observed] == ['memo-write', 'stored-return']
    assert all(e['value'] is False for _, e in observed)


def test_ambiguous_same_line_and_side_effecting_indices_abstain(run):
    result = run('''def solve():
    dp = [1, 1, 0]
    i = 2; dp[i] = dp[0] + dp[1]
    def index():
        print("index")
        return 2
    dp[index()] = dp[0] + dp[1]
    return dp
solve()
''')
    assert effects(result) == []
    assert ''.join(s.get('stdout', '') for s in result['snapshots']).count('index') == 1
