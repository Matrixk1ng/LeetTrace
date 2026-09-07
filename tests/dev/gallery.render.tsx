import App from '../../src/panel/App';
import { TraceContext } from '../../src/panel/store/useTrace';
import { initialState } from '../../src/panel/store/traceReducer';
import type { Snapshot } from '../../src/shared/types';
import HeapViz from '../../src/panel/components/visualizers/HeapViz';
/**
 * Renders every visualizer against the mockData fixtures and writes a single
 * static HTML page, so the cards can be *looked at* without loading the
 * extension into Chrome (docs/DESIGN.md §10 — the fixture-driven workflow).
 *
 *   npm run gallery
 *
 * Output: tests/dev/gallery.html, which is gitignored. It is a generator, not
 * an assertion — it lives under vitest only to reuse the JSX + jsdom pipeline
 * the unit tests already have, and is excluded from the normal test run.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

import ArrayViz from '../../src/panel/components/visualizers/ArrayViz';
import CallStackViz from '../../src/panel/components/visualizers/CallStackViz';
import HashMapViz from '../../src/panel/components/visualizers/HashMapViz';
import LinkedListViz from '../../src/panel/components/visualizers/LinkedListViz';
import MatrixViz from '../../src/panel/components/visualizers/MatrixViz';
import QueueViz from '../../src/panel/components/visualizers/QueueViz';
import SetViz from '../../src/panel/components/visualizers/SetViz';
import StackViz from '../../src/panel/components/visualizers/StackViz';
import TreeViz from '../../src/panel/components/visualizers/TreeViz';
import * as mock from '../../src/panel/components/visualizers/mockData';
import type { DataStructureState } from '../../src/shared/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

function withData(base: DataStructureState, data: unknown): DataStructureState {
  return { ...base, data };
}

/** The panel is 400px wide — every card is shown at that width. */
function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[10px] border border-trace-border bg-trace-bg-card"
      style={{ padding: 14, marginBottom: 14 }}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-trace-text-muted">
        {title}
      </div>
      {note ? <div className="mb-2 text-xs text-trace-text-secondary">{note}</div> : null}
      {children}
    </section>
  );
}

const bstRoot = {__type: 'tree', root: {id: 'a', val: 2,
  left: {id: 'b', val: 1, left: null, right: null},
  right: {id: 'c', val: 3, left: null, right: null}}};
const bst: Snapshot = {
  step: 37, line: 17, event: 'return', frameId: 'f1', frameName: 'isValidBST', callDepth: 1,
  callStack: [], highlights: [],
  variables: {
    self: {type: 'Solution', value: '<Solution object at 0xc27900>', changed: false},
    dfs: {type: 'function', value: '<function Solution.isValidBST.dfs>', changed: false},
    root: {type: 'TreeNode', value: bstRoot, changed: false},
    return: {type: 'bool', value: true, changed: true},
  },
  dataStructures: [{id: 'root', type: 'tree', data: bstRoot, pointers: []}],
};
function Gallery() {
  return (
    <div style={{ width: 400 }}>
      <div className="panel-preview"><TraceContext.Provider value={{state: {...initialState, status: 'paused',
        testCase: {label: 'Case 1', input: 'root = [2,1,3]'},
        snapshots: Array.from({length: 38}, () => bst), currentStep: 37, totalSteps: 38, returnValue: true,
        detectedPattern: {type: 'dfs', confidence: .66, description: 'Explores subproblems through recursive calls.'}},
        dispatch: () => {}}}>
        <App />
      </TraceContext.Provider></div>
      <Card title="nums — array" note="two cursors, stable colours">
        <ArrayViz dataStructure={mock.mockArray} highlights={[]} />
      </Card>

      <Card title="s — string" note="indexed string, rendered as characters">
        <ArrayViz dataStructure={mock.mockString} highlights={[]} />
      </Card>

      <Card title="big — array (60)" note="long array, horizontal scroll">
        <ArrayViz dataStructure={mock.mockLongArray} highlights={[]} />
      </Card>

      <Card title="grid — matrix" note="row cursor i, column cursor j, crossing cell highlighted">
        <MatrixViz dataStructure={mock.mockMatrix} highlights={mock.mockMatrixHighlights} />
      </Card>

      <Card title="dp — matrix (ragged)" note="triangular table; columns stay aligned">
        <MatrixViz dataStructure={mock.mockRaggedMatrix} highlights={[]} />
      </Card>

      <Card title="stack — stack" note="top first; a push is called out">
        <StackViz
          dataStructure={mock.mockStack}
          previousDataStructure={withData(mock.mockStack, [3, 1, 4, 1])}
        />
      </Card>

      <Card title="stack — stack (pop)" note="same stack, stepping after a pop">
        <StackViz
          dataStructure={mock.mockStack}
          previousDataStructure={withData(mock.mockStack, [3, 1, 4, 1, 5, 9])}
        />
      </Card>

      <Card title="queue — queue" note="deque; append at the back called out">
        <QueueViz
          dataStructure={mock.mockQueue}
          previousDataStructure={withData(mock.mockQueue, { __type: 'deque', items: [4, 8, 15] })}
        />
      </Card>

      <Card title="queue — queue (popleft)" note="front consumed">
        <QueueViz
          dataStructure={mock.mockQueue}
          previousDataStructure={withData(mock.mockQueue, {
            __type: 'deque',
            items: [99, 4, 8, 15, 16],
          })}
        />
      </Card>

      <Card title="seen — set" note="7 just added, 11 just removed">
        <SetViz
          dataStructure={mock.mockSet}
          previousDataStructure={withData(mock.mockSet, {
            __type: 'set',
            items: [2, 3, 5, 11],
            frozen: false,
          })}
        />
      </Card>

      <Card title="seen — hash map" note="B17: 11 is new (green), 7 changed 9 → 1 (amber), 2 untouched">
        <HashMapViz
          dataStructure={mock.mockHashMap}
          previousDataStructure={mock.mockHashMapPrevious}
        />
      </Card>

      <Card title="heap — heap" note="priority at root, expandable array storage">
        <HeapViz dataStructure={mock.mockHeap} />
      </Card>

      <Card title="head — linked list" note="acyclic; curr sits on node 2">
        <LinkedListViz dataStructure={mock.mockPlainLinkedList} />
      </Card>

      <Card title="head — linked list (cycle)" note="slow/fast folded on by M3; tail loops to index 1">
        <LinkedListViz dataStructure={mock.mockLinkedList} />
      </Card>

      <Card title="root — tree" note="SVG top-down layout, in-order x placement">
        <TreeViz dataStructure={mock.mockPlainTree} />
      </Card>

      <Card title="root — tree (cursor)" note="node cursor at pre-order index 2">
        <TreeViz dataStructure={mock.mockTree} />
      </Card>

      <Card title="out — array (empty)">
        <ArrayViz dataStructure={mock.mockEmptyArray} highlights={[]} />
      </Card>
      <CallStackViz frames={mock.mockCallStack} />
    </div>
  );
}

/** The panel's compiled Tailwind, so the gallery looks like the real thing. */
function panelCss(): string {
  const assets = join(ROOT, 'dist', 'assets');
  try {
    const file = readdirSync(assets).find((name) => name.startsWith('index-') && name.endsWith('.css'));
    if (file) return readFileSync(join(assets, file), 'utf8');
  } catch {
    // dist/ isn't built — fall through to the note below.
  }
  return '';
}

it('writes the visualizer gallery', () => {
  const css = panelCss();
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>LeetTrace visualizer gallery</title>
<style>${css}</style>
<style>
  body { margin: 0; padding: 20px; background: #1a1a2e; font-family: system-ui, sans-serif; }
  .panel-preview > div { height: 900px; margin-bottom: 20px; }
  .missing-css { color: #f87171; font: 13px system-ui; margin-bottom: 16px; }
</style>
</head>
<body>
${css ? '' : '<p class="missing-css">dist/ has no compiled CSS — run `npm run build` first.</p>'}
${renderToStaticMarkup(<Gallery />)}
</body>
</html>`;

  mkdirSync(HERE, { recursive: true });
  writeFileSync(join(HERE, 'gallery.html'), html, 'utf8');

  expect(html).toContain('visualizer gallery');
});
