import FeedbackFooter from './components/FeedbackFooter';
import GridSearchViz from './components/visualizers/GridSearchViz';
import { gridSearchStructures } from './components/visualizers/gridSearch';
import StepDetails from './components/StepDetails';
import Controls from './components/Controls';
import PatternBadge from './components/PatternBadge';
import VariableInspector from './components/VariableInspector';
import CallStackViz from './components/visualizers/CallStackViz';
import VizRouter from './components/visualizers/VizRouter';
import { useExecution } from './hooks/useExecution';
import { useTrace } from './store/useTrace';
import './App.css';

/**
 * Main app layout for LeetTrace panel
 * ~350-400px wide, dark theme, three vertical sections:
 * 1. Header with title and pattern badge
 * 2. Controls bar with playback controls
 * 3. Visualization area (variable inspector for now)
 */
function App() {
  const { state, currentSnapshot } = useTrace();
  const hasGridSearch = !!gridSearchStructures(currentSnapshot, state.detectedPattern?.type);
  const { requestTrace } = useExecution();

  const hasTreeTraversal = currentSnapshot?.dataStructures.some(ds => ds.traversal);
  const isIdle = state.status === 'idle';
  const isLoading = state.status === 'loading';
  const isEmptyCompleted = state.status === 'completed' && state.totalSteps === 0;

  return (
    <div className="h-screen overflow-hidden bg-trace-bg-primary text-trace-text-primary flex flex-col">
      <header className="shrink-0 bg-trace-bg-secondary border-b border-trace-border px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-7 w-7 shrink-0 rounded-lg bg-linear-to-br from-trace-accent via-blue-400 to-violet-500 shadow-[0_0_24px_rgba(56,189,248,0.25)]" />
            <div className="min-w-0">
              <h1 className="text-[1.75rem] font-semibold leading-none tracking-tight text-trace-text-primary">
                LeetTrace
              </h1>
            </div>
          </div>
          <PatternBadge />
        </div>
      </header>

      <Controls requestTrace={requestTrace} />

      <main className="flex-1 min-h-0 overflow-y-auto bg-trace-bg-primary px-4 py-4">
        {state.error && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="font-medium">Execution failed</p>
            {state.errorLine !== null ? (
              <p className="mt-1 text-red-200/90">Error on line {state.errorLine}</p>
            ) : null}
            {state.error ? <p className="mt-2 text-red-100/90">{state.error}</p> : null}
          </section>
        )}

        {state.stale ? <p role="status" className="mb-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">{state.inputChanged ? 'Testcase changed — updating the trace…' : 'Code changed — showing the previous trace. Click Trace to update.'}</p> : null}
        {state.truncated ? <p role="status" className="mb-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
          Trace stopped at the {state.limit === 'time' ? 'time' : state.limit === 'events' ? 'execution-event' : 'snapshot'} limit. Showing {state.totalSteps} recorded steps; the solution may not have finished.
        </p> : null}
        <section className={hasGridSearch ? "flex flex-col" : "flex min-h-[360px] flex-col justify-center rounded-[24px] border border-trace-border bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_34%),linear-gradient(180deg,rgba(30,42,74,0.7),rgba(26,26,46,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"}>
          {isIdle ? (
            <div className="mx-auto max-w-[260px] text-center">
              <p className="text-xl font-medium text-trace-text-secondary">
                Write some Python on LeetCode, then click Trace to visualize
              </p>
            </div>
          ) : null}

          {isLoading ? (
            <div className="mx-auto flex flex-col items-center gap-4 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-trace-border border-t-trace-accent" />
              <div>
                <p className="text-lg font-medium text-trace-text-primary">
                  {state.loadingMessage ?? 'Running your code...'}
                </p>
              </div>
            </div>
          ) : null}

          {isEmptyCompleted ? (
            <div className="mx-auto max-w-[260px] text-center">
              <p className="text-lg font-medium text-trace-text-secondary">
                No steps to visualize. Make sure your function is being called.
              </p>
            </div>
          ) : null}

          {!isIdle && !isLoading && !isEmptyCompleted && currentSnapshot ? (
            <div className="flex flex-col gap-3">
              {hasGridSearch ? <GridSearchViz /> : null}
              {hasTreeTraversal ? <VizRouter /> : null}
              {/* Pinned above the structures once recursion is in play — the
                  frame you're in is the context for everything below it. */}
              {(currentSnapshot?.callStack.length ?? 0) > 1 ? (
                <CallStackViz frames={currentSnapshot!.callStack} />
              ) : null}
              {hasGridSearch ? <details className="text-xs text-trace-text-secondary"><summary className="cursor-pointer">Call details and output</summary><div className="mt-2"><StepDetails /></div></details> : <StepDetails />}
              {!hasTreeTraversal ? <VizRouter /> : null}
              <VariableInspector />
            </div>
          ) : null}
        </section>
      </main>
      <FeedbackFooter />
    </div>
  );
}

export default App;
