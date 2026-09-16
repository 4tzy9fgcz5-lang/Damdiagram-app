// Vast rooster (3 kolommen x 4 rijen = de volle pagina van 12), ongeacht hoe
// weinig diagrammen er op een bepaalde pagina staan. Eerder kreeg een pagina
// met bv. 2 diagrammen een eigen, grotere rastercel toebedeeld (2 kolommen x
// 1 rij) — de diagrammen werden daardoor véél groter dan op een volle pagina.
// Nu blijft elk diagram overal even groot; een pagina met minder dan 12
// diagrammen laat de rest van het rooster gewoon leeg (linksboven gevuld).
const FIXED_GRID = { cols: 3, rows: 4 };

// Een opgaveblad kent geen bovengrens meer aan het totaal aantal diagrammen,
// maar op één A4-pagina passen er niet meer dan dit aantal (zie paginateItems).
export const MAX_DIAGRAMS_PER_PAGE = 12;

export function getGridLayout(count) {
  if (count < 1 || count > MAX_DIAGRAMS_PER_PAGE) {
    throw new RangeError(`Een pagina heeft 1 tot ${MAX_DIAGRAMS_PER_PAGE} diagrammen, niet ${count}.`);
  }
  return FIXED_GRID;
}

// Splitst alle items van een opgaveblad in pagina's van elk maximaal
// MAX_DIAGRAMS_PER_PAGE stuks, voor de opgavenweergave (scherm-voorbeeld en
// Word-export) — elke pagina krijgt zijn eigen rooster via getGridLayout.
export function paginateItems(items, pageSize = MAX_DIAGRAMS_PER_PAGE) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages.length ? pages : [[]];
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
