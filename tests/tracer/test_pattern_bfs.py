import ast

def test_pattern(tracer):
    result = tracer._detect_pattern(ast.parse('from collections import deque as D\ndef solve(root):\n    q = D([root])\n    while q:\n        node = q.popleft()\n        q.append(node)\n'))
    assert result["type"] == 'bfs'
    assert .5 < result["confidence"] <= 1
    assert result["description"]
