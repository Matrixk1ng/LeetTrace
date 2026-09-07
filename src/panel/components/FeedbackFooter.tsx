const FEEDBACK_URL = 'https://tally.so/r/2EWO8D';

export default function FeedbackFooter() {
  return <footer className="shrink-0 border-t border-trace-border bg-trace-bg-secondary p-3">
    <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer"
      className="block w-full rounded-lg border border-trace-border px-3 py-2 text-center text-sm text-trace-text-secondary hover:text-trace-accent">
      Feature request / Report a bug
    </a>
    <p className="mt-2 text-center text-xs text-trace-text-muted">
      Opens our feedback form. Code and testcase inputs are not attached automatically.
    </p>
  </footer>;
}
