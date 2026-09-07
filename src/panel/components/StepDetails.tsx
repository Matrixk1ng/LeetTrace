import { formatTraceValue } from '../../shared/display';
import { useTrace } from '../store/useTrace';

export default function StepDetails() {
  const { state, currentSnapshot: step, isAtEnd } = useTrace();
  if (!step) return null;
  const result = step.variables.return;
  const output = state.snapshots.slice(0, state.currentStep + 1).map(s => s.stdout ?? '').join('');
  return <section className="rounded-xl border border-trace-border bg-trace-bg-secondary p-3 min-w-0">
    <div className="text-xs text-trace-accent font-semibold">
      {step.event === 'call' ? 'Entering function' : step.event === 'return' ? 'Leaving function' : 'Before line executes'}
      {' · Line ' + step.line}
    </div>
    <p className="mt-1 font-mono text-sm break-all">{step.frameName}()</p>
    {result && !(isAtEnd && !state.error && !state.truncated) ? <div className="mt-3">
      <p className="text-xs text-trace-text-secondary">This call returns</p>
      <p className="font-mono text-lg text-emerald-300 break-all">{formatTraceValue(result.value, result.type)}</p>
    </div> : null}
    {isAtEnd && !state.error && !state.truncated ? <div className="mt-3">
      <p className="text-xs text-trace-text-secondary">Solution output · {state.testCase?.label ?? "description example"}</p>
      <p className="font-mono text-lg text-emerald-300 break-all">{formatTraceValue(state.returnValue)}</p>
    </div> : null}
    {output ? <details className="mt-3 text-xs text-trace-text-secondary"><summary className="cursor-pointer">Printed output</summary>
      <pre className="mt-2 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{output}</pre></details> : null}
  </section>;
}
