import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('def search(path):\n    for i in range(4):\n        path.append(i)\n        search(path)\n        path.pop()\n'))
    assert result["type"] == 'backtracking'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
