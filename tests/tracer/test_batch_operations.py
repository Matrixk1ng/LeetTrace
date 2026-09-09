import json
from pathlib import Path
import pytest

CASES = json.loads(Path('tests/dev/batch-examples.json').read_text())


@pytest.mark.parametrize('case', CASES, ids=lambda c: c['id'])
def test_batch_examples_preserve_results_and_record_operations(run, case):
    code = 'def solve():\n' + '\n'.join('    '+line for line in case['body'].splitlines()) + '\nresult = solve()'
    trace = run(code)
    assert trace['error'] is None, trace['error']
    result = next(s for s in reversed(trace['snapshots']) if s['frameName'] == 'solve' and s['event'] == 'return')
    assert result['variables']['return']['value'] == case['expected']
    operations = [s['visual']['operation'] for s in trace['snapshots'] if s['visual'].get('operation')]
    assert any(o.get('completed') for o in operations)
    if case['id'] == 'decorator-cache':
        assert any(c['hits'] > 0 for o in operations for c in o.get('completed', {}).get('cache', []))
    if case['id'] == 'tuple-memo':
        assert any(e['kind'] == 'stored-return' and e['key'] == '(1, 1)' for s in trace['snapshots'] for e in s['visual'].get('learning', []))
    if case['id'] == 'trie':
        assert any(v['value'].get('__type') == 'trie' for s in trace['snapshots'] for v in s['variables'].values() if isinstance(v['value'], dict))
    if case['id'] in ('graph-bfs', 'graph-dfs', 'dijkstra', 'topological'):
        assert any(o['roles'].get('graph') == 'adjacency' for o in operations)


def test_observation_does_not_repeat_custom_subscription(run):
    trace = run('''class Values:
    def __getitem__(self, key):
        print("getitem")
        return 1
def solve():
    values = Values()
    if values[0] == 1:
        return True
result = solve()
''')
    assert trace['error'] is None
    assert ''.join(s.get('stdout', '') for s in trace['snapshots']).count('getitem') == 1


def test_exception_cancels_pending_completion(run):
    trace = run('''def solve():
    nums = []
    try:
        value = nums[0]
    except IndexError:
        value = 4
    return value
result = solve()
''')
    assert trace['error'] is None
    completed = [s['visual'].get('operation', {}).get('completed', {}).get('source') for s in trace['snapshots']]
    assert 'value = nums[0]' not in completed
