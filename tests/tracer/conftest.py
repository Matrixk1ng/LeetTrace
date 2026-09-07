"""Pytest fixtures for the LeetTrace tracer.

`src/offscreen/tracer.py` is deliberately Pyodide-free so it can be imported
and exercised under plain CPython — no browser, no WASM, no build step.
"""

import json
import sys
from pathlib import Path

import pytest

TRACER_DIR = Path(__file__).resolve().parents[2] / 'src' / 'offscreen'
sys.path.insert(0, str(TRACER_DIR))

import tracer as tracer_module  # noqa: E402


@pytest.fixture
def tracer():
    """The tracer module with budgets restored after each test."""
    original = (tracer_module.MAX_SNAPSHOTS, tracer_module.MAX_EVENTS)
    yield tracer_module
    tracer_module.MAX_SNAPSHOTS, tracer_module.MAX_EVENTS = original


def _reject_constant(name):
    """Python's json.loads accepts bare Infinity/-Infinity/NaN; JSON.parse does
    not. Parsing leniently here would validate output the worker can't read —
    which is exactly how the float('inf') crash reached the browser."""
    raise AssertionError(
        'run_traced emitted ' + name + ', which is not valid JSON — '
        'JSON.parse in the worker would throw'
    )


def parse_strict(text):
    """json.loads with JavaScript's tolerance, not Python's."""
    return json.loads(text, parse_constant=_reject_constant)


@pytest.fixture
def run(tracer):
    """run(code, examples) -> parsed result dict, parsed strictly."""

    def _run(code, examples=None):
        return parse_strict(tracer.run_traced(code, examples or []))

    return _run
