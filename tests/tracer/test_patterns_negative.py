import ast
import pytest

@pytest.mark.parametrize('code', [
    'def solve(n):\n    return [0] * n',
    'def solve():\n    return "while left < right: deque popleft @cache heapq.heappush"',
    '# while left < right: heapq.heappush(items, 1)\ndef solve():\n    return 1',
    'def foo():\n    return 1\ndef bar():\n    return foo()',
    'def solve(nums):\n    return sorted(nums)',
    'def solve(q):\n    q.append(1)\n    return q',
])
def test_no_badge_without_structural_evidence(tracer, code):
    assert tracer._detect_pattern(ast.parse(code)) is None

def test_dp_2d(tracer):
    code = 'def solve(dp):\n    for i in range(1, 5):\n        for j in range(1, 5):\n            dp[i][j] = dp[i-1][j] + dp[i][j-1]'
    assert tracer._detect_pattern(ast.parse(code))['type'] == 'dynamic_programming'

def test_result_envelope(run):
    result = run('class Solution:\n    def f(self, n: int):\n        if n < 1: return 0\n        return self.f(n-1)', ['n = 3'])
    assert result['pattern']['type'] == 'dfs'
