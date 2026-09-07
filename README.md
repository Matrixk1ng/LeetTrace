# LeetTrace

LeetTrace is a Chrome extension for stepping through LeetCode Python solutions beside the editor. It runs the selected LeetCode testcase locally in Pyodide and shows how variables, data structures, and function calls change.

## What is implemented

- Arrays and indexed strings with stable index pointers; large arrays show a browsable 60-item window.
- Matrices, hash maps and counters, sets, stacks, queues, linked lists (including cycles), binary trees, and heaps.
- Collapsible diagrams, node references, previous-cursor tree highlights, and recursive call stacks.
- Readable local values and return values. Python function objects and the `self` wrapper are hidden; useful instance fields such as `self.count` remain visible.
- Timeline scrubbing, play/pause, forward/back, replay from the end, and step delay. With the panel focused, use Left/Right or Space; form controls retain their native keys.
- AST-based pattern hints for binary search, two pointers, sliding windows, BFS, DFS, backtracking, dynamic programming, heaps, prefix sums, monotonic stacks, fast/slow pointers, union-find, and greedy algorithms. These are conservative heuristics, not a correctness proof or calibrated probabilities. Hover or focus the badge for its description.
- Editor highlights and compact badges that follow scrolling; code changes mark existing traces stale.
- Partial state at runtime errors, printed output, and notices when tracing stops at a budget.

## Run locally

Use a Node.js version supported by the installed Vite package (`node_modules/vite/package.json`), npm, Chrome, and Python with pytest for tracer tests.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this repository's `dist/` folder. Open a LeetCode problem, select Python, open LeetTrace using its floating button or extension icon, then click **Trace** in the panel.

After changing code, rebuild and reload the extension. Reload the LeetCode tab if testing content-script or Monaco-bridge changes. `npm run dev` starts the Vite development server.

## Testcases and custom inputs

Open LeetCode's **Testcase** tab, select a case, and click **Trace** once.
After that, changing cases or editing inputs automatically retraces after a short
pause. Cases added with LeetCode's **+** button work the same way. The panel shows
**Tracing Case N** and an expandable copy of the exact input.

Keep the Testcase pane open when starting a trace. If the selected inputs are
unreadable or incomplete, LeetTrace reports an error instead of running a
different example. It reads visible named fields (including linked-list `pos`)
and preserves multiline values and whitespace inside strings. Live LeetCode
selector compatibility still needs checking after page layout changes.

## Receiving bug reports and feature requests

The pinned **Feature request / Report a bug** button opens prefilled GitHub issue
forms in [Matrixk1ng/LeetTrace](https://github.com/Matrixk1ng/LeetTrace/issues).
The repository is public and Issues was verified enabled on 2026-09-07.

Users sign into GitHub, review the form, and submit it. You receive each report
in the repository's **Issues** tab, where you can reply, label, and close it.
To receive alerts, choose **Watch → Custom → Issues** on the repository, then
enable email under [GitHub notification settings](https://github.com/settings/notifications).
See [GitHub's notification guide](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications).

No extension backend, email credentials, API token, or extra Chrome permission
is needed: GitHub stores submissions. Reports are public, and the forms include
only the extension version automatically; code and testcase inputs are not
attached. A private or account-free feedback flow would require changing the
destination to a hosted form or a feedback backend.

## How to read a trace

A **line** snapshot shows values **before that line executes**. Call and return steps show entry and exit from a function. Amber local values changed within that function invocation; a node-reference label shows where a variable points in a diagram. At the last step, **Solution output** is the return value for the selected testcase, not a LeetCode submission verdict.

Click **View … diagram** beside a structure value to find its visualization. Expand a structure's header to reopen a collapsed card. A heap preserves its array positions rather than sorting values for display. Trees initially show six levels; deeper captured nodes can be expanded.

## Architecture

```text
Side panel <-> background service worker <-> offscreen document <-> Pyodide Web Worker
                    |
              content script <-> page-world Monaco bridge
```

The service worker routes messages and opens the panel. The offscreen document owns a dedicated worker; Python execution therefore cannot block its timeout handling. The Python tracer captures state with `sys.settrace`, builds annotated tree/list inputs, and analyzes the AST. TypeScript reconstructs the call stack and attaches structure pointers.

```text
src/background/service-worker.ts     Message routing and injection recovery
src/content/                        Extraction, floating button, editor annotations
public/monaco-bridge.js              Access to Monaco and model-change notifications
src/offscreen/tracer.py              Python tracing, serialization, inputs, pattern scoring
src/offscreen/pyodide-worker.ts      Pyodide execution and result processing
src/offscreen/pyodide-host.ts        Worker lifetime and execution budgets
src/offscreen/snapshot-builder.ts   Structure routing, pointers, call stacks
src/panel/                          React 19 UI and reducer
src/shared/types.ts                 Shared message and snapshot contract
manifest.config.js                  Chrome MV3 configuration
tests/                             TypeScript, Python, and visual fixtures
```

## Verification

```sh
npm run lint
npm run build
npm test
npm run test:tracer
npm run smoke:pyodide
npm run gallery
```

The gallery writes `tests/dev/gallery.html`, including a full panel fixture based on the binary-tree example. Build first so it includes current styles.

Live Chrome checks are still required on LeetCode: trace one example per structure, scroll the editor, edit while tracing, navigate between problems, reload the extension, test the floating-button fallback, and inspect a runtime failure. Automated DOM tests and headless gallery checks do not replace those integrations.

## Limits and remaining work

- Python/Python3 and the first public `Solution` method are the supported entry point. Annotation-based input builders do not cover every custom problem interface.
- Execution has time/event/snapshot budgets. Trees retain up to 11 serialized levels; expanding the diagram shows captured data only.
- Monaco access and selected-testcase extraction depend on LeetCode's page structure. The line-number rail is preferred for annotations, with absolute line-position math as a fallback.
- Pattern detection can miss unfamiliar implementations or classify mixed algorithms imperfectly.
- Graph visualization remains an optional stretch feature; adjacency maps still have the hash-map view.
- Custom input editing, other languages, persistent traces, and contest pages remain outside v1 scope.

See [DESIGN.md](docs/DESIGN.md) for the design and historical audit, and [PROGRESS.md](docs/PROGRESS.md) for current verification and handoff notes.
