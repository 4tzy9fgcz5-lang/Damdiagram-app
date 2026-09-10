const GRID_TABLE = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  5: { cols: 3, rows: 2 },
  6: { cols: 3, rows: 2 },
  7: { cols: 3, rows: 3 },
  8: { cols: 3, rows: 3 },
  9: { cols: 3, rows: 3 },
  10: { cols: 3, rows: 4 },
  11: { cols: 3, rows: 4 },
  12: { cols: 3, rows: 4 },
};

export const MAX_DIAGRAMS_PER_STENCIL = 12;

export function getGridLayout(count) {
  if (count < 1 || count > MAX_DIAGRAMS_PER_STENCIL) {
    throw new RangeError(`Een stencil heeft 1 tot ${MAX_DIAGRAMS_PER_STENCIL} diagrammen, niet ${count}.`);
  }
  return GRID_TABLE[count];
}

// Geeft voor elk item een genormaliseerde positie (0..1) binnen het diagramvlak,
// zodat zowel de schermweergave als de Word-export dezelfde indeling gebruiken.
export function computeCellRects(count) {
  const { cols, rows } = getGridLayout(count);
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const rects = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({ x: col * cellW, y: row * cellH, w: cellW, h: cellH });
  }
  return { cols, rows, rects };
}
