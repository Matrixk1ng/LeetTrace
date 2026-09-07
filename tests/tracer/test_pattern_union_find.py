import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def find(x):\n    if parent[x] != x:\n        parent[x] = find(parent[x])\n    return parent[x]\n'))
    assert result["type"] == 'union_find'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
