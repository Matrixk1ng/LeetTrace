def test_custom_cycle_case(run):
    code = 'class Solution:\n    def solve(self, head: Optional[ListNode]):\n        seen = set()\n        while head:\n            if id(head) in seen: return True\n            seen.add(id(head))\n            head = head.next\n        return False'
    assert run(code, ['head = [3,2,0,-4], pos = 1'])['returnValue'] is True
    assert run(code, ['head = [3,2,0,-4], pos = -1'])['returnValue'] is False

def test_invalid_custom_value_does_not_silently_execute_defaults(run):
    result = run('class Solution:\n    def solve(self, n = 42):\n        return n', ['n = [broken'])
    assert result['error'] is not None
    assert result['snapshots'] == []

def test_preserves_custom_string_spaces(run):
    assert run('class Solution:\n    def solve(self, s):\n        return s', ['s = "a  b, c = d"'])['returnValue'] == 'a  b, c = d'
