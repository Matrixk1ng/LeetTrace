import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(nums):\n    left = total = 0\n    for right in range(len(nums)):\n        total += nums[right]\n        while total > 10:\n            total -= nums[left]\n            left += 1\n'))
    assert result["type"] == 'sliding_window'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
