import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def solve(intervals):\n    end = 0\n    count = 0\n    for start, finish in sorted(intervals):\n        if start >= end:\n            count += 1\n            end = finish\n'))
    assert result["type"] == 'greedy'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
