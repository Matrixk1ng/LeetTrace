def test_statement_references_exclude_stale_loop_indices(run):
    result = run('''class Solution:
    def solve(self, n):
        grid = [[1, 2], [3, 4]]
        for i in range(2):
            for j in range(2):
                x = grid[i][j]
        nr, nc = 0, 1
        x = grid[nr][nc]
        return x
''', ['n = 0'])
    snap = next(s for s in result['snapshots'] if s['line'] == 8 and s['event'] == 'line')
    assert 'i' in snap['variables'] and 'j' in snap['variables']
    assert 'i' not in snap['visual']['names'] and 'j' not in snap['visual']['names']
    assert snap['visual']['cells'] == [{'structure':'grid','indices':['nr','nc'],'write':False}]
    loop = next(s for s in result['snapshots'] if s['line'] == 4 and s['event'] == 'line')
    assert loop['visual']['cells'] == []


def test_tuple_identity_is_preserved_without_changing_values(run):
    result = run('directions = [(-1, 0), (0, 1)]\ngrid = [[1, 2], [3, 4]]\nx = 0')
    v = result['snapshots'][-1]['variables']
    assert v['directions']['tupleItems'] is True
    assert v['directions']['value'] == [[-1, 0], [0, 1]]
    assert 'tupleItems' not in v['grid']


def test_visual_analysis_does_not_evaluate_subscript_calls(run):
    result = run('''calls = []
def index():
    calls.append(1)
    return 0
grid = [[7]]
value = grid[index()][0]
done = 1
''')
    assert result['snapshots'][-1]['variables']['calls']['value'] == [1]
    snap = next(s for s in result['snapshots'] if s['line'] == 6 and s['event'] == 'line')
    assert snap['visual']['cells'] == []


def test_fixed_queue_loop_and_pop_binding(run):
    result = run('''from collections import deque
q = deque([(0, 0), (1, 0)])
for _ in range(len(q)):
    r, c = q.popleft()
    q.append((r, c))
done = 1
''')
    header = next(s for s in result['snapshots'] if s['line'] == 3)
    assert header['visual']['levelLoop'] == {'line':3, 'queue':'q'}
    pop = next(s for s in result['snapshots'] if s['line'] == 4)
    assert pop['visual']['queueOperation'] == {'kind':'popleft','queue':'q','targets':['r','c']}
    end = next(s for s in result['snapshots'] if s['line'] == 6)
    assert 'levelLoop' not in end['visual']


def test_shadowed_range_is_not_a_verified_level_boundary(run):
    result = run('''from collections import deque
range = lambda n: [0]
q = deque([1, 2])
for _ in range(len(q)):
    x = q.popleft()
done = 1
''')
    header = next(s for s in result['snapshots'] if s['line'] == 4 and s['frameName'] == '<module>')
    assert header['visual']['levelLoop'] is None
