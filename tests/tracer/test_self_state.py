def test_solution_fields_remain_visible(run):
    result = run('class Solution:\n    def solve(self, n: int):\n        self.count = 0\n        self.count += n\n        return self.count', ['n = 3'])
    values = [s['variables']['self.count'] for s in result['snapshots'] if 'self.count' in s['variables']]
    assert values[-1]['value'] == 3
    assert any(v['changed'] for v in values)

def test_error_keeps_deepest_frame_values(run):
    result = run('class Solution:\n    def solve(self, n: int):\n        def helper(x):\n            total = x + 1\n            return total // 0\n        return helper(n)', ['n = 3'])
    assert result['error']['line'] == 5
    assert any(s['line'] == 5 and s['variables'].get('total', {}).get('value') == 4 for s in result['snapshots'])
