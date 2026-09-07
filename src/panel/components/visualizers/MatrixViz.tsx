import type { DataStructureState, Highlight, Pointer } from '../../../shared/types';
import {
  cellColors,
  formatValue,
  highlightsByIndex,
  pickStrongestHighlight,
  truncate,
} from './format';

interface MatrixVizProps {
  dataStructure: DataStructureState;
  highlights: Highlight[];
}

const CELL = 34;
const GAP = 3;
/** Gutter for the row cursors down the left edge. */
const RAIL = 46;

/**
 * Column count for the grid, and the stride the flattened highlight index
 * uses. Rows may be ragged (a triangular DP table is still a grid), so the
 * widest row defines both.
 */
function widthOf(rows: unknown[][]): number {
  return rows.reduce<number>((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
}

/** `cell.col === -1` marks a row cursor; `cell.row === -1` a column cursor. */
function splitPointers(pointers: Pointer[]): { rows: Pointer[]; cols: Pointer[] } {
  const rows: Pointer[] = [];
  const cols: Pointer[] = [];
  for (const pointer of pointers) {
    if (!pointer.cell) continue;
    if (pointer.cell.col === -1) rows.push(pointer);
    else if (pointer.cell.row === -1) cols.push(pointer);
  }
  return { rows, cols };
}

function CursorLabels({ pointers }: { pointers: Pointer[] }) {
  return (
    <>
      {pointers.map((pointer) => (
        <span
          key={pointer.name}
          className="font-mono leading-none"
          style={{ color: pointer.color, fontSize: 10 }}
        >
          {pointer.name}
        </span>
      ))}
    </>
  );
}

export default function MatrixViz({ dataStructure, highlights }: MatrixVizProps) {
  const rows = (Array.isArray(dataStructure.data) ? dataStructure.data : []) as unknown[][];

  if (rows.length === 0) {
    return <div className="font-mono text-sm text-trace-text-muted">[ ]</div>;
  }

  const width = widthOf(rows);
  const byIndex = highlightsByIndex(highlights, dataStructure.id);
  const { rows: rowPointers, cols: colPointers } = splitPointers(dataStructure.pointers);

  const rowCursors = new Map<number, Pointer[]>();
  for (const pointer of rowPointers) {
    const list = rowCursors.get(pointer.index) ?? [];
    list.push(pointer);
    rowCursors.set(pointer.index, list);
  }

  const colCursors = new Map<number, Pointer[]>();
  for (const pointer of colPointers) {
    const list = colCursors.get(pointer.index) ?? [];
    list.push(pointer);
    colCursors.set(pointer.index, list);
  }

  const gridWidth = width * (CELL + GAP);

  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ width: RAIL + gridWidth }}>
        {/* Column cursors, then column indices */}
        <div className="flex" style={{ marginLeft: RAIL, gap: GAP, height: 12 }}>
          {Array.from({ length: width }, (_, col) => (
            <div key={col} className="flex justify-center gap-1" style={{ width: CELL }}>
              <CursorLabels pointers={colCursors.get(col) ?? []} />
            </div>
          ))}
        </div>
        <div className="flex" style={{ marginLeft: RAIL, gap: GAP }}>
          {Array.from({ length: width }, (_, col) => (
            <div
              key={col}
              className="text-center text-trace-text-muted"
              style={{ width: CELL, fontSize: 9 }}
            >
              {col}
            </div>
          ))}
        </div>

        {rows.map((row, rowIndex) => {
          const cells = Array.isArray(row) ? row : [];
          const cursors = rowCursors.get(rowIndex) ?? [];

          return (
            <div key={rowIndex} className="mt-[3px] flex items-center">
              {/* Row index + row cursors */}
              <div
                className="flex items-center justify-end gap-1 pr-1.5"
                style={{ width: RAIL, height: CELL }}
              >
                <CursorLabels pointers={cursors} />
                <span className="text-trace-text-muted" style={{ fontSize: 9 }}>
                  {rowIndex}
                </span>
                <span
                  style={{
                    width: 3,
                    height: CELL,
                    borderRadius: 2,
                    background: cursors[0]?.color ?? 'transparent',
                  }}
                />
              </div>

              <div className="flex" style={{ gap: GAP }}>
                {Array.from({ length: width }, (_, col) => {
                  if (col >= cells.length) {
                    // Ragged row — keep the column alignment, draw nothing.
                    return <div key={col} style={{ width: CELL, height: CELL }} />;
                  }

                  const strongest = pickStrongestHighlight(byIndex.get(rowIndex * width + col));
                  const { border, background } = cellColors(strongest);
                  const text = formatValue(cells[col]);

                  return (
                    <div
                      key={col}
                      className="flex items-center justify-center font-mono text-trace-text-primary"
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 6,
                        border: `1.5px solid ${border}`,
                        background,
                        fontSize: 12,
                        transition: 'border-color 0.25s ease, background-color 0.25s ease',
                      }}
                      title={text}
                    >
                      {truncate(text, 4)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
