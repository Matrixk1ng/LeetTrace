import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(nums):\n    left, right = 0, len(nums)-1\n    out = [0] * len(nums)\n    while left < right:\n        left += 1\n        right -= 1\n'))
    assert result["type"] == 'two_pointer'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
