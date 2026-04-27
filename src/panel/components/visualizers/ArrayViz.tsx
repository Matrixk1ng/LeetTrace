import type { DataStructureState, Highlight, Pointer } from '../../../shared/types';
import { HIGHLIGHT_COLORS } from '../../../shared/constants';

interface ArrayVizProps {
  dataStructure: DataStructureState;
  highlights: Highlight[];
}

const HIGHLIGHT_BG: Record<Highlight['type'], string> = {
  compare: 'rgba(252, 211, 77, 0.18)',
  visit: 'rgba(96, 165, 250, 0.18)',
  swap: 'rgba(251, 146, 60, 0.18)',
  current: 'rgba(167, 139, 250, 0.20)',
  result: 'rgba(74, 222, 128, 0.20)',
};

const HIGHLIGHT_PRIORITY: Highlight['type'][] = ['result', 'swap', 'compare', 'visit', 'current'];

function pickStrongestHighlight(types: Set<Highlight['type']>): Highlight['type'] | null {
  for (const type of HIGHLIGHT_PRIORITY) {
    if (types.has(type)) return type;
  }
  return null;
}

function formatCellValue(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text;
}

export default function ArrayViz({ dataStructure, highlights }: ArrayVizProps) {
  const data = Array.isArray(dataStructure.data) ? (dataStructure.data as unknown[]) : [];

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

  // Group highlights for this structure by index → set of types.
  const highlightsByIndex = new Map<number, Set<Highlight['type']>>();
  for (const h of highlights) {
    if (h.structureId !== dataStructure.id) continue;
    for (const idx of h.indices) {
      if (!highlightsByIndex.has(idx)) highlightsByIndex.set(idx, new Set());
      highlightsByIndex.get(idx)!.add(h.type);
    }
  }

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
          const types = highlightsByIndex.get(i);
          const strongest = types ? pickStrongestHighlight(types) : null;
          const borderColor = strongest ? HIGHLIGHT_COLORS[strongest] : '#2d3a5c';
          const background = strongest ? HIGHLIGHT_BG[strongest] : '#16213e';

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
              title={String(formatCellValue(value))}
            >
              {truncate(formatCellValue(value), maxValueChars)}
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
