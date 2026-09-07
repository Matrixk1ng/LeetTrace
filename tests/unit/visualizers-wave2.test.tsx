/**
 * M5 — LinkedListViz, TreeViz, CallStackViz, rendered against the fixtures.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CallStackViz from '../../src/panel/components/visualizers/CallStackViz';
import LinkedListViz from '../../src/panel/components/visualizers/LinkedListViz';
import TreeViz from '../../src/panel/components/visualizers/TreeViz';
import * as mock from '../../src/panel/components/visualizers/mockData';
import type { DataStructureState } from '../../src/shared/types';

afterEach(cleanup);

function withData(base: DataStructureState, data: unknown): DataStructureState {
  return { ...base, data };
}

describe('LinkedListViz', () => {
  it('renders one node per value', () => {
    const { container } = render(<LinkedListViz dataStructure={mock.mockPlainLinkedList} />);
    const values = Array.from(container.querySelectorAll('[title]')).map((el) =>
      el.getAttribute('title'),
    );
    expect(values).toEqual(['1', '2', '3', '4', '5']);
  });

  it('labels the cursors folded onto the list by M3', () => {
    // slow/fast each serialize as a whole list of their own; M3 collapses them
    // into nodePointers so this renders one chain, not three.
    render(<LinkedListViz dataStructure={mock.mockLinkedList} />);
    expect(screen.getByText('slow')).toBeTruthy();
    expect(screen.getByText('fast')).toBeTruthy();
  });

  it('calls out a cycle and where it links back to', () => {
    render(<LinkedListViz dataStructure={mock.mockLinkedList} />);
    expect(screen.getByText(/cycle — tail links back to index 1/)).toBeTruthy();
  });

  it('ends an acyclic list with None', () => {
    render(<LinkedListViz dataStructure={mock.mockPlainLinkedList} />);
    expect(screen.getByText('→ None')).toBeTruthy();
    expect(screen.queryByText(/cycle/)).toBeNull();
  });

  it('renders an empty list as None', () => {
    render(<LinkedListViz dataStructure={withData(mock.mockPlainLinkedList, { nodes: [] })} />);
    expect(screen.getByText('None')).toBeTruthy();
  });

  it('counts the nodes', () => {
    render(<LinkedListViz dataStructure={mock.mockPlainLinkedList} />);
    expect(screen.getByText('5 nodes')).toBeTruthy();
  });
});

describe('TreeViz', () => {
  it('draws every node', () => {
    const { container } = render(<TreeViz dataStructure={mock.mockPlainTree} />);
    expect(container.querySelectorAll('circle')).toHaveLength(5);
  });

  it('draws an edge per child', () => {
    // 5 nodes, so 4 parent-to-child edges.
    const { container } = render(<TreeViz dataStructure={mock.mockPlainTree} />);
    expect(container.querySelectorAll('line')).toHaveLength(4);
  });

  it('places a cursor by pre-order index, matching how ids are serialized', () => {
    // mockTree pre-order is [3, 9, 20, 15, 7]; nodeIndex 2 is the node 20.
    const { container } = render(<TreeViz dataStructure={mock.mockTree} />);
    expect(screen.getByText('node')).toBeTruthy();

    const labelled = Array.from(container.querySelectorAll('text')).map((el) => el.textContent);
    expect(labelled).toContain('20');
  });

  it('does not overlap subtrees', () => {
    // An in-order x assignment gives every node its own column.
    const { container } = render(<TreeViz dataStructure={mock.mockPlainTree} />);
    const xs = Array.from(container.querySelectorAll('circle')).map((el) => el.getAttribute('cx'));
    expect(new Set(xs).size).toBe(5);
  });

  it('reports size and depth', () => {
    render(<TreeViz dataStructure={mock.mockPlainTree} />);
    expect(screen.getByText(/5 nodes · depth 3/)).toBeTruthy();
  });

  it('renders an empty tree as None', () => {
    render(<TreeViz dataStructure={withData(mock.mockPlainTree, { root: null })} />);
    expect(screen.getByText('None')).toBeTruthy();
  });
});

describe('CallStackViz', () => {
  it('puts the innermost frame on top', () => {
    const { container } = render(<CallStackViz frames={mock.mockCallStack} />);
    const titles = Array.from(container.querySelectorAll('[title]')).map((el) =>
      el.getAttribute('title'),
    );
    expect(titles[0]).toBe('backtrack() — line 5');
    expect(titles[titles.length - 1]).toBe('subsets() — line 2');
  });

  it('reports the depth', () => {
    render(<CallStackViz frames={mock.mockCallStack} />);
    expect(screen.getByText('depth 4')).toBeTruthy();
  });

  it('renders nothing when the stack is empty', () => {
    const { container } = render(<CallStackViz frames={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
