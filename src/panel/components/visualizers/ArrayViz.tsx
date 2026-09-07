import { useState } from 'react';
import type { DataStructureState, Highlight, Pointer } from '../../../shared/types';
import {
  cellColors,
  formatValue,
  highlightsByIndex,
  pickStrongestHighlight,
  truncate,
} from './format';

interface ArrayVizProps {
  dataStructure: DataStructureState;
  highlights: Highlight[];
}

export default function ArrayViz({ dataStructure, highlights }: ArrayVizProps) {
  const [page, setPage] = useState<number | null>(null);
  const data = Array.isArray(dataStructure.data) ? (dataStructure.data as unknown[]) : [];
  // A string is already a row of characters — quoting each one would spend a
  // third of every cell on punctuation.
  const focus = dataStructure.pointers.find(p => p.index >= 0 && p.index < data.length)?.index ?? 0;
  const start = data.length > 60 ? Math.max(0, Math.min(page ?? Math.max(0, focus - 3), data.length - 60)) : 0;
  const visible = data.slice(start, start + 60);
  const isCharArray = dataStructure.type === 'string';
  const cellText = (value: unknown): string =>
    isCharArray && typeof value === 'string' ? value : formatValue(value);

  if (data.length === 0) {
    return (
      <div className="font-mono text-sm text-trace-text-muted">[ ]</div>
    );
  }

  const isLong = data.length > 8;
  const cellWidth = isLong ? 32 : 40;
  const cellHeight = 40;
  const gap = 3;
  const slotWidth = cellWidth + gap;

  const byIndex = highlightsByIndex(highlights, dataStructure.id);

  // Group pointers by index so we can stack them vertically when colocated.
  const pointersByIndex = new Map<number, Pointer[]>();
  for (const p of dataStructure.pointers) {
    if (!Number.isInteger(p.index) || p.index < start || p.index >= start + visible.length) continue;
    if (!pointersByIndex.has(p.index)) pointersByIndex.set(p.index, []);
    pointersByIndex.get(p.index)!.push(p);
  }

  const rowWidth = visible.length * slotWidth;
  const maxValueChars = isLong ? 4 : 6;

  return (
    <div>
      {data.length > 60 ? <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-trace-text-secondary">
        <button type="button" disabled={start === 0} onClick={() => setPage(Math.max(0, start - 60))}>← Earlier</button>
        <span>{start > 0 ? start + ' earlier · ' : ''}Indices {start}–{start + visible.length - 1}{start + visible.length < data.length ? ' · ' + (data.length - start - visible.length) + ' more' : ''}</span>
        <button type="button" disabled={start + visible.length >= data.length} onClick={() => setPage(start + 60)}>Later →</button>
        <button type="button" onClick={() => setPage(null)}>Follow pointer</button>
        {dataStructure.pointers.map(p => <button key={p.name} type="button" onClick={() => setPage(Math.max(0, p.index - 3))}>{p.name}: {p.index}</button>)}
      </div> : null}
      <div className="overflow-x-auto pb-1">
      {/* Index labels */}
      <div className="flex" style={{ gap: `${gap}px`, width: rowWidth }}>
        {visible.map((_, i) => (
          <div
            key={i}
            className="text-center text-trace-text-muted"
            style={{ width: cellWidth, fontSize: 9 }}
          >
            {start + i}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="mt-1 flex" style={{ gap: `${gap}px`, width: rowWidth }}>
        {visible.map((value, offset) => {
          const i = start + offset;
          const strongest = pickStrongestHighlight(byIndex.get(i));
          const { border: borderColor, background } = cellColors(strongest);

          return (
            <div
              key={i}
              className="flex items-center justify-center font-mono text-trace-text-primary"
              style={{
                width: cellWidth,
                height: cellHeight,
                borderRadius: 6,
                border: `1.5px solid ${borderColor}`,
                background,
                fontSize: 13,
                transition: 'border-color 0.25s ease, background-color 0.25s ease',
              }}
              title={cellText(value)}
            >
              {truncate(cellText(value), maxValueChars)}
            </div>
          );
        })}
      </div>

      {/* Pointer arrows */}
      {pointersByIndex.size > 0 ? (
        <div
          className="relative mt-1"
          style={{ width: rowWidth, height: 18 * Math.max(...Array.from(pointersByIndex.values()).map((arr) => arr.length)) }}
        >
          {Array.from(pointersByIndex.entries()).map(([index, pointers]) => (
            <div
              key={index}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: (index - start) * slotWidth, width: cellWidth }}
            >
              {pointers.map((p, stackIdx) => (
                <div
                  key={p.name + stackIdx}
                  className="flex items-center gap-0.5 font-mono leading-none"
                  style={{ color: p.color, fontSize: 10, marginTop: stackIdx === 0 ? 0 : 2 }}
                >
                  <span>▲</span>
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      </div>
    </div>
  );
}
