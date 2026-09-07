import { useState } from 'react';

const ISSUES = 'https://github.com/Matrixk1ng/LeetTrace/issues/new';

function feedbackUrl(kind: 'bug' | 'feature'): string {
  const version = typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.().version ?? 'unknown' : 'development';
  const body = kind === 'bug'
    ? '## What happened?\n\n\n## What did you expect?\n\n\n## Steps to reproduce\n1. \n\n## LeetCode problem (optional)\n\n\n## Screenshot (optional)\n\n\nLeetTrace version: ' + version
    : '## What would you like LeetTrace to do?\n\n\n## How would this help you?\n\n\nLeetTrace version: ' + version;
  return ISSUES + '?' + new URLSearchParams({title: kind === 'bug' ? '[Bug] ' : '[Feature request] ', body});
}

export default function FeedbackFooter() {
  const [open, setOpen] = useState(false);
  return <footer className="shrink-0 border-t border-trace-border bg-trace-bg-secondary p-3">
    <button type="button" className="w-full rounded-lg border border-trace-border px-3 py-2 text-sm text-trace-text-secondary hover:text-trace-accent"
      aria-expanded={open} aria-controls="feedback-options" onClick={() => setOpen(!open)}>
      Feature request / Report a bug
    </button>
    {open ? <div id="feedback-options" className="mt-3 text-xs text-trace-text-secondary">
      <div className="flex gap-3">
        <a href={feedbackUrl('bug')} target="_blank" rel="noopener noreferrer" className="text-trace-accent underline">Report a bug ↗</a>
        <a href={feedbackUrl('feature')} target="_blank" rel="noopener noreferrer" className="text-trace-accent underline">Request a feature ↗</a>
      </div>
      <p className="mt-2">Opens GitHub. Sign in, review the form, then submit. Reports are public; code and testcase inputs are not attached automatically.</p>
    </div> : null}
  </footer>;
}
