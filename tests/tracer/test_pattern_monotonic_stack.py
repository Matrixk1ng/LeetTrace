import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(nums):\n    stack = []\n    for x in nums:\n        while stack and stack[-1] > x:\n            stack.pop()\n        stack.append(x)\n'))
    assert result["type"] == 'monotonic_stack'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
