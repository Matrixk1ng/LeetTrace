"""M2 — serialization families and per-frame `changed` (bugs B4, B8)."""

import fixtures


def snaps_with(result, name):
    return [s for s in result['snapshots'] if name in s['variables']]


def last_var(result, name):
    for snap in reversed(result['snapshots']):
        if name in snap['variables']:
            return snap['variables'][name]
    raise AssertionError(name + ' never appeared in the trace')


# --------------------------------------------------------------------------
# B4 — deque, set, heap, stack, dict-likes
# --------------------------------------------------------------------------

def test_deque_is_tagged_not_repr(run):
    result = run(fixtures.BFS_DEQUE, ['n = 4'])

    assert result['error'] is None, result['error']
    queue = last_var(result, 'queue')
    assert queue['type'] == 'deque'
    assert queue['value']['__type'] == 'deque'
    assert isinstance(queue['value']['items'], list)

    # The old serializer dropped through to repr() for deque.
    for snap in snaps_with(result, 'queue'):
        assert not isinstance(snap['variables']['queue']['value'], str)


def test_set_is_tagged_with_items(run):
    result = run(fixtures.BFS_DEQUE, ['n = 3'])

    seen = last_var(result, 'seen')
    assert seen['type'] == 'set'
    assert seen['value']['__type'] == 'set'
    assert seen['value']['items'] == [0, 1, 2]
    assert seen['value']['frozen'] is False


def test_heap_is_flagged_from_heapq_usage(run):
    result = run(fixtures.HEAP_TOP_K, ['nums = [3,1,5,2], k = 2'])

    assert result['error'] is None, result['error']
    assert last_var(result, 'heap')['kind'] == 'heap'
    assert result['returnValue'] == [3, 5]


def test_stack_is_flagged_from_append_pop_usage(run):
    result = run(fixtures.MONOTONIC_STACK, ['nums = [2,1,3]'])

    assert result['error'] is None, result['error']
    assert last_var(result, 'stack')['kind'] == 'stack'
    # `out` is only ever indexed, never appended/popped — not a stack.
    assert 'kind' not in last_var(result, 'out')


def test_a_heap_is_not_also_reported_as_a_stack(tracer):
    code = '''class Solution:
    def f(self, nums: List[int]) -> int:
        h = []
        for x in nums:
            h.append(x)
            heapq.heappush(h, x)
            h.pop()
        return len(h)
'''
    import ast
    usage = tracer._analyze_usage(ast.parse(code))
    assert 'h' in usage['heap']
    assert 'h' not in usage['stack']


def test_dict_subclasses_keep_their_python_type_name(run):
    result = run(fixtures.COUNTER_ANAGRAM, ['s = "anagram", t = "nagaram"'])

    assert result['error'] is None, result['error']
    assert last_var(result, 'counts')['type'] == 'Counter'
    assert last_var(result, 'groups')['type'] == 'defaultdict'
    assert isinstance(last_var(result, 'counts')['value'], dict)
    assert result['returnValue'] is True


def test_a_plain_list_gets_no_kind(run):
    result = run(fixtures.MATRIX_SUM, ['grid = [[1,2],[3,4]]'])

    assert result['error'] is None, result['error']
    assert 'kind' not in last_var(result, 'grid')
    assert last_var(result, 'grid')['value'] == [[1, 2], [3, 4]]
    assert result['returnValue'] == 10


# --------------------------------------------------------------------------
# B8 — `changed` is per frame, not global
# --------------------------------------------------------------------------

def test_changed_is_scoped_to_its_own_frame(run):
    """`local` holds a different value in each recursive frame. With one global
    _prev_locals, returning into a parent frame made its unchanged `local` look
    changed, because the comparison was against the child's value."""
    result = run(fixtures.RECURSION_SHADOWING, ['n = 3'])

    assert result['error'] is None, result['error']
    assert result['returnValue'] == 60

    by_frame = {}
    for snap in result['snapshots']:
        entry = snap['variables'].get('local')
        if entry is None:
            continue
        by_frame.setdefault(snap['frameId'], []).append(entry)

    assert len(by_frame) >= 3, 'expected one frame per recursion level'

    for frame_id, entries in by_frame.items():
        # `local` is assigned once per frame and never reassigned, so exactly
        # the step that introduced it may report changed.
        changed_after_first = [e['changed'] for e in entries[1:]]
        assert not any(changed_after_first), (frame_id, entries)


def test_frame_local_state_is_dropped_on_return(tracer, run):
    run(fixtures.RECURSION_SHADOWING, ['n = 3'])

    # Every frame returned, so nothing should be left behind to leak into the
    # next trace.
    assert tracer._prev_locals == {}
