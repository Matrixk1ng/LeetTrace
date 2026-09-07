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
  const data = Array.isArray(dataStructure.data) ? (dataStructure.data as unknown[]) : [];
  // A string is already a row of characters — quoting each one would spend a
  // third of every cell on punctuation.
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
  const useScroll = data.length > 20;

  const byIndex = highlightsByIndex(highlights, dataStructure.id);

  // Group pointers by index so we can stack them vertically when colocated.
  const pointersByIndex = new Map<number, Pointer[]>();
  for (const p of dataStructure.pointers) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= data.length) continue;
    if (!pointersByIndex.has(p.index)) pointersByIndex.set(p.index, []);
    pointersByIndex.get(p.index)!.push(p);
  }

  const rowWidth = data.length * slotWidth;
  const maxValueChars = isLong ? 4 : 6;

  return (
    <div className={useScroll ? 'overflow-x-auto pb-1' : ''}>
      {/* Index labels */}
      <div className="flex" style={{ gap: `${gap}px`, width: rowWidth }}>
        {data.map((_, i) => (
          <div
            key={i}
            className="text-center text-trace-text-muted"
            style={{ width: cellWidth, fontSize: 9 }}
          >
            {i}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="mt-1 flex" style={{ gap: `${gap}px`, width: rowWidth }}>
        {data.map((value, i) => {
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
              style={{ left: index * slotWidth, width: cellWidth }}
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
  );
}
