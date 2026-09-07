/**
 * M4 — visualizers wave 1, rendered against the mockData fixtures.
 *
 * These assert what the user can actually read off the card: the values, the
 * cursor labels, the diff callouts. They deliberately don't pin colours or
 * pixel geometry, which are meant to be tuned.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ArrayViz from '../../src/panel/components/visualizers/ArrayViz';
import HashMapViz from '../../src/panel/components/visualizers/HashMapViz';
import MatrixViz from '../../src/panel/components/visualizers/MatrixViz';
import QueueViz from '../../src/panel/components/visualizers/QueueViz';
import SetViz from '../../src/panel/components/visualizers/SetViz';
import StackViz from '../../src/panel/components/visualizers/StackViz';
import * as mock from '../../src/panel/components/visualizers/mockData';
import type { DataStructureState } from '../../src/shared/types';

afterEach(cleanup);

function withData(base: DataStructureState, data: unknown): DataStructureState {
  return { ...base, data };
}

// ---------------------------------------------------------------------------

describe('MatrixViz', () => {
  it('renders every cell of the grid', () => {
    render(<MatrixViz dataStructure={mock.mockMatrix} highlights={mock.mockMatrixHighlights} />);

    expect(screen.getAllByTitle('10')).toHaveLength(1);
    expect(screen.getAllByTitle('6')).toHaveLength(1);
    // 3 rows x 4 columns
    expect(screen.getAllByTitle(/^\d+$/)).toHaveLength(12);
  });

  it('labels the row cursor and the column cursor', () => {
    render(<MatrixViz dataStructure={mock.mockMatrix} highlights={mock.mockMatrixHighlights} />);

    expect(screen.getByText('i')).toBeTruthy();
    expect(screen.getByText('j')).toBeTruthy();
  });

  it('renders a ragged grid without inventing cells', () => {
    render(<MatrixViz dataStructure={mock.mockRaggedMatrix} highlights={[]} />);

    // 1 + 2 + 3 + 4 cells, not 4 x 4.
    expect(screen.getAllByTitle(/^\d+$/)).toHaveLength(10);
  });

  it('falls back to a placeholder for an empty grid', () => {
    render(<MatrixViz dataStructure={withData(mock.mockMatrix, [])} highlights={[]} />);
    expect(screen.getByText('[ ]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('StackViz', () => {
  it('draws the top of the stack first', () => {
    const { container } = render(
      <StackViz dataStructure={mock.mockStack} previousDataStructure={null} />,
    );

    const values = Array.from(container.querySelectorAll('[title]')).map((el) =>
      el.getAttribute('title'),
    );
    // data is [3, 1, 4, 1, 5]; the last element is the top.
    expect(values).toEqual(['5', '1', '4', '1', '3']);
  });

  it('calls out a push', () => {
    render(
      <StackViz
        dataStructure={mock.mockStack}
        previousDataStructure={withData(mock.mockStack, [3, 1, 4, 1])}
      />,
    );
    expect(screen.getByText(/pushed/)).toBeTruthy();
  });

  it('calls out a pop', () => {
    render(
      <StackViz
        dataStructure={mock.mockStack}
        previousDataStructure={withData(mock.mockStack, [3, 1, 4, 1, 5, 9])}
      />,
    );
    expect(screen.getByText(/popped/)).toBeTruthy();
  });

  it('says so when the stack empties', () => {
    render(
      <StackViz
        dataStructure={withData(mock.mockStack, [])}
        previousDataStructure={withData(mock.mockStack, [1])}
      />,
    );
    expect(screen.getByText(/empty/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('QueueViz', () => {
  it('reads the deque payload and renders front to back', () => {
    const { container } = render(
      <QueueViz dataStructure={mock.mockQueue} previousDataStructure={null} />,
    );

    const values = Array.from(container.querySelectorAll('[title]')).map((el) =>
      el.getAttribute('title'),
    );
    expect(values).toEqual(['4', '8', '15', '16']);
  });

  it('labels both ends', () => {
    render(<QueueViz dataStructure={mock.mockQueue} previousDataStructure={null} />);
    expect(screen.getByText(/front/)).toBeTruthy();
    expect(screen.getByText(/back/)).toBeTruthy();
  });

  it('calls out an append at the back', () => {
    render(
      <QueueViz
        dataStructure={mock.mockQueue}
        previousDataStructure={withData(mock.mockQueue, { __type: 'deque', items: [4, 8, 15] })}
      />,
    );
    expect(screen.getByText(/appended/)).toBeTruthy();
  });

  it('calls out a popleft at the front', () => {
    render(
      <QueueViz
        dataStructure={mock.mockQueue}
        previousDataStructure={withData(mock.mockQueue, {
          __type: 'deque',
          items: [99, 4, 8, 15, 16],
        })}
      />,
    );
    expect(screen.getByText(/popped/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('SetViz', () => {
  it('renders each member as a chip', () => {
    render(<SetViz dataStructure={mock.mockSet} previousDataStructure={null} />);

    for (const value of ['2', '3', '5', '7']) {
      expect(screen.getByTitle(value)).toBeTruthy();
    }
    expect(screen.getByText('4 members')).toBeTruthy();
  });

  it('keeps a removed member visible for one step', () => {
    render(
      <SetViz
        dataStructure={mock.mockSet}
        previousDataStructure={withData(mock.mockSet, {
          __type: 'set',
          items: [2, 3, 5, 7, 11],
          frozen: false,
        })}
      />,
    );
    expect(screen.getByTitle('11 — removed')).toBeTruthy();
  });

  it('distinguishes an empty set from a frozenset', () => {
    render(<SetViz dataStructure={withData(mock.mockSet, { __type: 'set', items: [] })} previousDataStructure={null} />);
    expect(screen.getByText('set()')).toBeTruthy();

    cleanup();
    render(
      <SetViz
        dataStructure={withData(mock.mockFrozenSet, { __type: 'set', items: [], frozen: true })}
        previousDataStructure={null}
      />,
    );
    expect(screen.getByText('frozenset()')).toBeTruthy();
  });

  it('marks a frozen set as frozen', () => {
    render(<SetViz dataStructure={mock.mockFrozenSet} previousDataStructure={null} />);
    expect(screen.getByText(/frozen ·/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('HashMapViz (B17)', () => {
  it('marks a changed value, not only a new key', () => {
    // The bug: counting problems keep the same keys and move the values, so
    // nothing lit up at all after the first pass.
    const { container } = render(
      <HashMapViz
        dataStructure={mock.mockHashMap}
        previousDataStructure={mock.mockHashMapPrevious}
      />,
    );

    const rows = Array.from(container.querySelectorAll('div[style*="border"]'));
    const styleFor = (key: string) =>
      rows.find((row) => within(row as HTMLElement).queryByTitle(key))?.getAttribute('style') ?? '';

    // '7' went 9 → 1: changed (amber). '11' is new (green). '2' is untouched.
    expect(styleFor('7')).toContain('245, 158, 11');
    expect(styleFor('11')).toContain('74, 222, 128');
    expect(styleFor('2')).toContain('transparent');
  });

  it('marks nothing when the map did not move', () => {
    const { container } = render(
      <HashMapViz dataStructure={mock.mockHashMap} previousDataStructure={mock.mockHashMap} />,
    );

    const styles = Array.from(container.querySelectorAll('div[style*="border"]')).map((el) =>
      el.getAttribute('style'),
    );
    expect(styles.every((style) => style?.includes('transparent'))).toBe(true);
  });

  it('treats every key as new when there is no previous step', () => {
    const { container } = render(
      <HashMapViz dataStructure={mock.mockHashMap} previousDataStructure={null} />,
    );

    const styles = Array.from(container.querySelectorAll('div[style*="border"]')).map((el) =>
      el.getAttribute('style'),
    );
    expect(styles.every((style) => style?.includes('74, 222, 128'))).toBe(true);
  });

  it('renders a placeholder for an empty map', () => {
    render(<HashMapViz dataStructure={withData(mock.mockHashMap, {})} previousDataStructure={null} />);
    expect(screen.getByText('{ }')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('ArrayViz — strings and empties', () => {
  it('renders a string as bare characters with cursors', () => {
    render(<ArrayViz dataStructure={mock.mockString} highlights={[]} />);

    // Bare, not quoted — a char array shouldn't spend a third of each cell on
    // punctuation.
    expect(screen.getAllByTitle('r')).toHaveLength(2);
    expect(screen.queryByTitle('"r"')).toBeNull();
    expect(screen.getByText('left')).toBeTruthy();
    expect(screen.getByText('right')).toBeTruthy();
  });

  it('renders an empty array as a placeholder', () => {
    render(<ArrayViz dataStructure={mock.mockEmptyArray} highlights={[]} />);
    expect(screen.getByText('[ ]')).toBeTruthy();
  });

  it('renders a long array without dropping cells', () => {
    const { container } = render(<ArrayViz dataStructure={mock.mockLongArray} highlights={[]} />);
    expect(container.querySelectorAll('[title]')).toHaveLength(60);
  });
});
