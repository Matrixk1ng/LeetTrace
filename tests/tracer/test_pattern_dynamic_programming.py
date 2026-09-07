import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('from functools import lru_cache as memo\n@memo(None)\ndef fib(n):\n    if n < 2:\n        return n\n    return fib(n-1) + fib(n-2)\n'))
    assert result["type"] == 'dynamic_programming'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
