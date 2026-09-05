# LeetTrace implementation prompt

Copy everything below the line into a new Claude Code chat opened in this repo.
The same prompt works for every session — it reads `docs/PROGRESS.md` to find
where the previous session left off, so you never need to explain the state.

---

You are continuing a multi-session implementation effort. Do these three things in order before touching any code:

1. **Read `docs/DESIGN.md` in full** — it is the authoritative spec: bug audit (§2, B1–B18 with file references), data-structure coverage matrix (§3), target architecture and snapshot schema v2 (§4), detailed fix specs (§5–§7), UI plan (§8), milestones M1–M8 (§9).
2. **Read `docs/PROGRESS.md`** — it tells you which milestones are done, the active branch, open PRs, the next task, and notes from previous sessions. This is where the last chat left off; trust it over assumptions.
3. **Verify against reality:** check `git branch -a`, `git log --oneline -10`, and `git status`. If git state and PROGRESS.md disagree (e.g. a branch exists that PROGRESS.md doesn't mention), reconcile: inspect the branch's diff, figure out what was actually completed, correct PROGRESS.md, then continue from the true state. Never redo work that's already on a branch — continue it.

Then implement, milestone by milestone, until LeetTrace meets the "fully done" definition in §3 of the design doc.

## Progress tracking (mandatory)

`docs/PROGRESS.md` is the handoff between sessions. You MUST keep it current:

- **After completing each milestone item or meaningful chunk of work**, check it off / update "Current state" and commit the PROGRESS.md change alongside the work.
- **Before your session ends** (including when the user says stop, or you're wrapping a long turn), append a dated entry to §3 "Session notes" with: what you finished, what's in flight (file + what remains), and the exact next step. Write it so a fresh chat with zero context can resume.
- **Record any deviation from DESIGN.md** in PROGRESS.md §4 and update DESIGN.md itself in the same commit.
- If you finished a milestone mid-session, update "Next task" to point at the next milestone's first step.

## Context

LeetTrace is a Chrome MV3 extension (CRXJS + Vite + React 19 + Tailwind 4) that traces LeetCode Python solutions with Pyodide + `sys.settrace` in an offscreen document and visualizes data structures in the side panel. Arrays and hashmaps already work end-to-end — do not regress them. The Python tracer lives as a template string in `src/offscreen/pyodide-runner.ts`; the panel is in `src/panel/`; the content script in `src/content/`; shared contracts in `src/shared/types.ts`.

## Ground rules

- **Work in milestone order: M1 → M8** (§9 of the design doc). Do not start visualizers (M4/M5) before the hardening in M1–M3 lands — everything depends on execution not hanging and on correct serialization.
- **One milestone = one branch + one PR.** Branch off `main` as `feature/m1-hardening`, `feature/m2-serialization`, etc. Commit in small logical steps. Open the PR when the milestone's checklist is done, then continue to the next milestone from the merged (or stacked) result. Ask me before merging anything to `main`.
- **`src/shared/types.ts` is the contract.** Milestone M1 includes fixing the drift (B12) and moving to snapshot schema v2 (§4). Every message sender/receiver in all four contexts (content, background, offscreen, panel) must import and use the shared union — no ad-hoc inline message types.
- **Verify before claiming done.** After each milestone: `npm run lint` and `npm run build` must pass with zero errors. For tracer changes, run the Python tracer under plain CPython with the pytest fixtures described in §10 (create `tests/tracer/` in M1 — the tracer script has no Pyodide dependency, so extract it to a real `.py` file that gets inlined at build time, or test the template's content directly). For UI changes, build and tell me exactly what to check after loading `dist/` at `chrome://extensions` — you can't drive Chrome extension pages yourself.
- **Don't gold-plate.** GraphViz is a stretch goal (§9 M8, §11) — skip it unless everything else is done. Non-goals in §12 stay non-goals.
- **When the design doc and reality conflict** (e.g. a Chrome API behaves differently than assumed, SharedArrayBuffer unavailable in the offscreen context — see §11 risks), implement the documented fallback, note the deviation in the PR description, and update `docs/DESIGN.md` in the same PR so the doc stays truthful.

## Milestone checklists (condensed — full detail is in the design doc)

**M1 — Hardening:** Pyodide into a Web Worker inside the offscreen doc with interrupt-buffer timeout + terminate/respawn fallback (B1, §5); event-count budget raising `LeetTraceLimitError` (§5.3); annotation-driven ListNode/TreeNode input builders + return-value conversion (B2, §6); `scripting` permission + content-script injection fallback in the SW's EXTRACT_CODE relay (B7); clamp error lines to user code (B9); clear timeout timers (B10); types.ts realignment (B12); offscreen self-warmup replacing the WARMUP message (B15); pytest scaffolding for the tracer.

**M2 — Serialization + routing:** `__type` tags for deque/set/heap; dict-like/list-like family matching in `buildDataStructure` (B4); matrix edge cases (B13); snapshot schema v2 fields — `event`, `frameId`, `frameName`, `callDepth`, `stdout` (§4); per-frame `changed` tracking keyed by frame identity (B8).

**M3 — Pointers:** static AST pass mapping arrays → the index variables that actually subscript them (B3); stable per-name colors across the whole trace; matrix `{row, col}` pointers; node pointers for linked lists and trees.

**M4 — Visualizers wave 1:** MatrixViz, StackViz, QueueViz, SetViz, string-as-char-array; HashMapViz changed-value highlighting (B17). Build each against a `mockData.ts` fixture first (§10).

**M5 — Visualizers wave 2:** LinkedListViz (cycle indicator, fast/slow node pointers), TreeViz (SVG top-down layout, traversal trail), CallStackViz.

**M6 — Patterns v2:** replace regex `detectPattern` with the Python AST-based scorer in §7, covering all patterns in §3's list; return best match with confidence.

**M7 — Editor mirroring:** fix scrolled-editor line math using view-line `style.top` / lineHeight (B5); scroll-aware badge repositioning + Monaco model-version-based staleness instead of MutationObserver clearing (B6); FAB fallback messaging for `sidePanel.open` rejection (B16).

**M8 — Polish:** step scrubber, Play-at-end restarts (B14), collapsible structure cards, windowed rendering for long arrays, truncation + stale-trace notices, error-step state display (§8), HeapViz, README refresh (B18). GraphViz only if everything else is green.

Start now: read `docs/DESIGN.md` and `docs/PROGRESS.md`, verify against git state, then continue from wherever PROGRESS.md says the last session stopped (first session: begin M1).
