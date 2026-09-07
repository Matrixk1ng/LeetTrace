import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def dfs(node):\n    if node:\n        dfs(node.left)\n        dfs(node.right)\n'))
    assert result["type"] == 'dfs'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
