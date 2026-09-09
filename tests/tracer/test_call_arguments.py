def test_bound_parameters_include_defaults_keywords_and_varargs(run):
    result = run('''def f(a, /, b=2, *args, flag=True, **kwargs):
    local = 99
    return a + b
f(1, 3, 4, flag=False, extra=5)
''')
    call = next(s for s in result['snapshots'] if s['event'] == 'call' and s['frameName'] == 'f')
    assert {n: v['value'] for n, v in call['arguments'].items()} == {
        'a':1, 'b':3, 'flag':False, 'args':[4], 'kwargs':{'extra':5}}
    assert 'local' not in call['arguments']


def test_call_arguments_stay_at_entry_and_exclude_self(run):
    result = run('''class Solution:
    def solve(self, n, values):
        n = 10
        values.append(9)
        return n
''', ['n = 2, values = [1]'])
    call = next(s for s in result['snapshots'] if s['event'] == 'call' and s['frameName'] == 'solve')
    assert set(call['arguments']) == {'n', 'values'}
    assert call['arguments']['n']['value'] == 2
    assert call['arguments']['values']['value'] == [1]


def test_free_variables_are_not_parameters_and_private_names_are_preserved(run):
    result = run('''def outer(n):
    def dfs(_row, col=3):
        return n + _row + col
    return dfs(2)
outer(5)
''')
    call = next(s for s in result['snapshots'] if s['event'] == 'call' and s['frameName'] == 'dfs')
    assert {n:v['value'] for n,v in call['arguments'].items()} == {'_row':2, 'col':3}
