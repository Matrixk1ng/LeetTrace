import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(nums):\n    lo, hi = 0, len(nums)-1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] < 4:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n'))
    assert result["type"] == 'binary_search'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
