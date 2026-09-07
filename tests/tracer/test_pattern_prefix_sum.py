import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(nums, left, right):\n    prefix = [0] * (len(nums)+1)\n    for i in range(len(nums)):\n        prefix[i+1] = prefix[i] + nums[i]\n    return prefix[right] - prefix[left]\n'))
    assert result["type"] == 'prefix_sum'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
