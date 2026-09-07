import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('import heapq as h\ndef solve(items):\n    h.heapify(items)\n    return h.heappop(items)\n'))
    assert result["type"] == 'heap_top_k'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
