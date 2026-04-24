import { useTrace } from '../store/TraceContext';

function prettifyPatternName(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function MagnifierIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function PatternBadge() {
  const { state } = useTrace();
  const pattern = state.detectedPattern;

  if (!pattern || pattern.confidence <= 0.5) {
    return null;
  }

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-400/35 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200">
      <MagnifierIcon />
      <span>{prettifyPatternName(pattern.type)}</span>
    </div>
  );
}