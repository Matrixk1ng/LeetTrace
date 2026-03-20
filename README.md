# 🔍 LeetTrace

A Chrome extension that overlays real-time data structure visualizations directly on LeetCode. Step through your code and watch arrays, trees, linked lists, and hashmaps come alive — right where you code.

> **No context switching.** LeetTrace lives in Chrome's side panel, next to LeetCode's editor.

![LeetTrace Demo](docs/demo.gif) <!-- TODO: Add demo GIF -->

---

## Features

- **Array visualization** with index labels and pointer arrows (i, j, left, right)
- **HashMap visualization** with key→value pairs and new-entry highlighting
- **Linked list visualization** with node chains and slow/fast pointer tracking
- **Binary tree visualization** with top-down layout and node traversal highlighting
- **Variable inspector** showing all variable states at each step
- **Pattern detection** — identifies Two Pointer, Sliding Window, BFS, DFS, Binary Search, DP, and more
- **Execution controls** — play, pause, step forward/back, speed control
- **Gutter annotations** — variable values shown inline next to your code in the editor

---

## Architecture

LeetTrace has three components that communicate via Chrome's message passing API:

```
┌──────────────────────────────────────────────────────────────┐
│                    LeetCode Problem Page                      │
│                                                              │
│  ┌─────────────────┐    messages    ┌──────────────────────┐ │
│  │  Content Script  │◄────────────►│     Side Panel        │ │
│  │                  │               │     (React App)       │ │
│  │  • Read editor   │               │                      │ │
│  │  • FAB button    │               │  • Visualizers       │ │
│  │  • Gutter badges │               │  • Controls          │ │
│  └────────┬─────────┘               │  • Variable table    │ │
│           │                         │  • Pattern badge     │ │
│           │ messages                └──────────┬───────────┘ │
│           │                                    │             │
│           ▼                                    ▼             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Background Service Worker                   │ │
│  │                                                         │ │
│  │  • Pyodide (Python in WebAssembly)                      │ │
│  │  • AST code instrumentation                             │ │
│  │  • Snapshot generation                                  │ │
│  │  • Pattern detection                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Content Script
Injected into `leetcode.com/problems/*` pages. Reads code from LeetCode's Monaco editor, injects the floating "Trace" button, and renders gutter annotations showing variable values next to code lines.

### Side Panel
A React app that opens in Chrome's Side Panel API. Contains all visualizations (array, hashmap, linked list, tree), execution controls (play/pause/step/speed), the variable inspector table, and pattern detection badges.

### Background Service Worker
Loads Pyodide (Python-in-WebAssembly) to execute user code. Uses Python's `sys.settrace` hook to capture variable state at every line execution — no code rewriting needed. Generates an array of snapshots that the side panel renders.

---

## How It Works

1. User writes Python code in LeetCode's editor
2. User clicks the **Trace** button (floating action button)
3. Content script extracts code from Monaco editor
4. Background worker **traces** the code using Python's `sys.settrace` — a built-in hook that fires on every line execution, capturing all local variables automatically
5. Pyodide executes the traced code, collecting **snapshots** (variable values, data structure states, pointer positions) at each step
6. Snapshots are sent to the side panel
7. Side panel **renders visualizations** and the user can step through them

### Snapshot Schema

Each execution step produces one snapshot:

```typescript
{
  step: number           // Step index
  line: number           // Which line of user code
  variables: {           // All variable values
    [name]: { value, type, changed }
  }
  dataStructures: [{     // Detected visualizable structures
    id: string
    type: "array" | "linked_list" | "tree" | "hashmap" | "matrix"
    data: any
    pointers: [{ name, index, color }]
  }]
  highlights: [{         // Which elements to animate
    structureId, indices, type: "compare" | "swap" | "visit" | ...
  }]
}
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3 |
| Side Panel UI | React 18 + Vite |
| Build | CRXJS Vite Plugin |
| Styling | Tailwind CSS |
| Visualization | Canvas API + SVG |
| Python Execution | Pyodide (WebAssembly) |
| Code Tracing | Python `sys.settrace` via Pyodide |
| State Management | Zustand |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Google Chrome** (or Chromium-based browser)
- **Git**

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/leettrace.git
cd leettrace

# 2. Install dependencies
npm install

# 3. Start development build (with watch mode)
npm run dev

# 4. Load the extension in Chrome:
#    a. Go to chrome://extensions
#    b. Enable "Developer mode" (top right toggle)
#    c. Click "Load unpacked"
#    d. Select the dist/ folder in this project

# 5. Go to any LeetCode problem page
#    You should see the LeetTrace FAB button (bottom right)
```

### Development Workflow

```bash
# Watch mode — rebuilds on file changes
npm run dev

# Production build
npm run build

# After making changes:
# 1. Save your files (watch mode auto-rebuilds)
# 2. Go to chrome://extensions
# 3. Click the refresh icon on the LeetTrace extension
# 4. Reload the LeetCode tab
```

### Project Structure

```
leettrace/
├── manifest.json                  # Chrome extension config
├── package.json
├── vite.config.ts                 # Vite + CRXJS build config
├── tailwind.config.js
├── tsconfig.json
│
├── src/
│   ├── background/
│   │   ├── index.ts               # Service worker entry + message routing
│   │   ├── pyodide-runner.ts      # Pyodide lifecycle + code execution
│   │   └── tracer.py              # Python sys.settrace hook + serialization
│   │
│   ├── content/
│   │   ├── index.ts               # Content script entry + message listener
│   │   ├── editor-hook.ts         # Monaco editor code extraction
│   │   ├── gutter.ts              # Inline variable annotations
│   │   ├── fab.ts                 # Floating action button
│   │   └── styles.css             # Injected CSS for FAB + gutter
│   │
│   ├── panel/
│   │   ├── index.html             # Side panel HTML shell
│   │   ├── main.tsx               # React entry
│   │   ├── App.tsx                # Main layout
│   │   ├── store/
│   │   │   └── useTraceStore.ts   # Zustand state management
│   │   ├── components/
│   │   │   ├── Controls.tsx       # Play/pause/step/speed
│   │   │   ├── VariableInspector.tsx
│   │   │   ├── PatternBadge.tsx
│   │   │   └── visualizers/
│   │   │       ├── ArrayViz.tsx
│   │   │       ├── LinkedListViz.tsx
│   │   │       ├── TreeViz.tsx
│   │   │       ├── HashMapViz.tsx
│   │   │       ├── MatrixViz.tsx
│   │   │       └── StackQueueViz.tsx
│   │   └── hooks/
│   │       └── useExecution.ts    # Execution lifecycle + auto-play timer
│   │
│   └── shared/
│       ├── types.ts               # Shared TypeScript types (the contract)
│       └── constants.ts           # Colors, limits, config
│
└── public/
    └── icons/                     # Extension icons
```

---

## Issues and How to Pick Work

There are 7 issues, ordered from foundation to finish. **Pick any issue whose dependencies are merged.** After Issue #1, Issues #2, #3, and #4 can all be worked on in parallel by different people.

| Issue | What | Dependencies | Can work in parallel with |
|-------|------|-------------|--------------------------|
| #1 | Project setup, manifest, shared types | None | — |
| #2 | Content script (editor hook, FAB, gutter) | #1 | #3, #4 |
| #3 | Background worker (Pyodide + sys.settrace) | #1 | #2, #4 |
| #4 | Side panel (React app, store, controls) | #1 | #2, #3 |
| #5 | Array and hashmap visualizers | #4 | #2, #3 |
| #6 | Linked list and tree visualizers | #5 | #2, #3 |
| #7 | End-to-end integration + polish | #2, #3, #4, #5 | — |

### How to Collaborate

1. **Do Issue #1 together** — set up the repo and agree on the shared types. These types are the contract between all components.
2. **Pick issues freely after that.** Issues #2, #3, and #4 are independent — you can each grab one and work in parallel.
3. **Test independently using mocks:** whoever works on the side panel (#4, #5, #6) can use hardcoded mock snapshot data in a `mockData.ts` file. Whoever works on the background worker (#3) can test by logging snapshots to console. The shared `Snapshot` type is what connects everything.
4. **Issue #7 is done together** — that's where you connect the pieces and test the full flow.

### Git Workflow

```
main (protected)
  └── dev
       ├── feature/issue-1-setup
       ├── feature/issue-2-content-script
       ├── feature/issue-3-background
       └── ...
```

- Branch off `dev` for each issue
- Open PRs to `dev`, get reviewed by the other person
- Merge `dev` → `main` when milestones are complete

---

## Key Concepts to Learn

If you're new to any of these, here are starting points:

- **Chrome Extension Development (MV3)**: https://developer.chrome.com/docs/extensions/develop
- **Chrome Side Panel API**: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- **Content Scripts**: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- **Message Passing**: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- **Pyodide (Python in browser)**: https://pyodide.org/en/stable/
- **Python sys.settrace**: https://docs.python.org/3/library/sys.html#sys.settrace
- **Zustand**: https://docs.pmnd.rs/zustand
- **CRXJS Vite Plugin**: https://crxjs.dev/vite-plugin
- **Canvas API**: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- **SVG basics**: https://developer.mozilla.org/en-US/docs/Web/SVG

---

## Known Gotchas

1. **Monaco access**: Content scripts run in an isolated world and can't access `window.monaco` directly. You need to inject a page-level `<script>` tag and use `window.postMessage` to communicate back.
2. **Pyodide size**: ~10MB first download. Subsequent loads use browser cache. Always show a loading state.
3. **Service worker lifecycle**: MV3 service workers die after 5 min idle. Pyodide state is lost. Always check if Pyodide is initialized before each execution and reinitialize if needed.
4. **LeetCode DOM**: Class names are hashed (CSS modules). Use structural selectors (`.monaco-editor`, `.view-lines`), not class names.
5. **sys.settrace**: The callback MUST return itself to keep tracing. Returning `None` stops tracing. Filter on `frame.f_code.co_filename == '<exec>'` to avoid tracing into stdlib.
6. **Large inputs**: Cap at 5000 snapshots. Virtualize long arrays in the UI.

---

## License

MIT
