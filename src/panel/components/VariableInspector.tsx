import type { VariableState } from '../../shared/types';
import { useTrace } from '../store/TraceContext';

function formatBooleanLike(value: unknown): string {
  if (value === null) {
    return 'None';
  }

  if (value === true) {
    return 'True';
  }

  if (value === false) {
    return 'False';
  }

  return '';
}

function formatValue(value: unknown): string {
  const pythonLiteral = formatBooleanLike(value);
  if (pythonLiteral) {
    return pythonLiteral;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const preview = value.slice(0, 10).map((item) => formatValue(item)).join(', ');
    return value.length > 10 ? `[${preview}, ...]` : `[${preview}]`;
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function compareVariables(
  [leftName, leftValue]: [string, VariableState],
  [rightName, rightValue]: [string, VariableState],
): number {
  if (leftValue.changed !== rightValue.changed) {
    return leftValue.changed ? -1 : 1;
  }

  return leftName.localeCompare(rightName);
}

export default function VariableInspector() {
  const { currentSnapshot } = useTrace();

  if (!currentSnapshot) {
    return null;
  }

  const variables = Object.entries(currentSnapshot.variables).sort(compareVariables);

  return (
    <section className="rounded-2xl border border-trace-border bg-trace-bg-card/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-trace-text-muted">
        Variables
      </div>

      {variables.length === 0 ? (
        <p className="text-sm text-trace-text-muted">No variables recorded for this step.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-trace-border bg-trace-bg-primary/60">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-trace-bg-secondary/70 text-trace-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {variables.map(([name, variable]) => (
                <tr key={name} className="border-t border-trace-border/80 align-top">
                  <td className="px-3 py-2 text-trace-text-primary">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          variable.changed ? 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.65)]' : 'bg-transparent'
                        }`}
                      />
                      <span className="font-medium">{name}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 font-[JetBrains_Mono,ui-monospace,SFMono-Regular,Menlo,monospace] ${variable.changed ? 'text-amber-300' : 'text-trace-text-primary'}`}>
                    {formatValue(variable.value)}
                  </td>
                  <td className="px-3 py-2 text-trace-text-secondary">{variable.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}