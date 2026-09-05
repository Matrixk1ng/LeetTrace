"""Guards against the one thing the normal suite can't see.

Under CPython, tracer.py is imported from a real file. Under Pyodide it is fed
to runPython(), which compiles it with the filename '<exec>'. If the tracer
used that same sentinel for user code, its own frames would be indistinguishable
from the user's — and every assertion in the rest of the suite would still pass.
So: load the tracer exactly the way Pyodide does, and re-check the frame-sensitive
behaviour.
"""

import json
from pathlib import Path

import fixtures
import pytest

TRACER_SOURCE = (
    Path(__file__).resolve().parents[2] / 'src' / 'offscreen' / 'tracer.py'
).read_text(encoding='utf-8')


@pytest.fixture
def pyodide_style_tracer():
    """The tracer module as Pyodide's runPython() would build it."""
    namespace = {'__name__': 'tracer'}
    exec(compile(TRACER_SOURCE, '<exec>', 'exec'), namespace)
    return namespace


def test_user_filename_cannot_collide_with_pyodide(pyodide_style_tracer):
    assert pyodide_style_tracer['USER_FILENAME'] != '<exec>'


def test_error_line_is_still_user_code_when_loaded_as_exec(pyodide_style_tracer):
    result = json.loads(
        pyodide_style_tracer['run_traced'](fixtures.RUNTIME_ERROR, ['nums = [1,2,3]'])
    )

    assert result['error'] is not None
    assert result['error']['line'] == 6


def test_next_example_retry_still_works_when_loaded_as_exec(pyodide_style_tracer):
    result = json.loads(
        pyodide_style_tracer['run_traced'](
            fixtures.BINARY_SEARCH,
            ['haystack = "abc", needle = "b"', 'nums = [1,2,3], target = 3'],
        )
    )

    assert result['error'] is None, result['error']
    assert result['returnValue'] == 2


def test_tracer_helpers_never_appear_as_snapshots(pyodide_style_tracer):
    result = json.loads(
        pyodide_style_tracer['run_traced'](fixtures.TWO_SUM, ['nums = [2,7,11,15], target = 9'])
    )

    names = {s['frameName'] for s in result['snapshots']}
    assert names <= {'<module>', 'twoSum'}, names
