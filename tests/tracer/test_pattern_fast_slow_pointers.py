import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(head):\n    slow = fast = head\n    while fast and fast.next:\n        slow = slow.next\n        fast = fast.next.next\n'))
    assert result["type"] == 'fast_slow_pointers'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
