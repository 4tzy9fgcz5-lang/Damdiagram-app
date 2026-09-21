import { detectMultipleBoardCorners } from "./detectMultiBoard.js?v=20260921ax";
import { fitCornersOnDrawable, findMissingBoardsOnDrawable } from "./detectBoard.js?v=20260921ax";

// Alle diagrammen op een paginafoto vinden, met de vier echte hoeken per diagram
// (voor de bulk-import). Drie stappen:
//   1. `detectMultipleBoardCorners`: grove vlekken die op een bord lijken;
//   2. per vlek de echte hoeken zoeken op het dambordpatroon (`fitCornersOnDrawable`),
//      zodat een nummer/onderschrift vlak bij het bord en scheefstand geen invloed
//      hebben; vlekken zonder duidelijk patroon (tekst, een hand, een foto) vallen af;
//   3. gemiste borden zoeken op de lege plekken van het rijen/kolommen-raster van de
//      pagina (`findMissingBoardsOnDrawable`).
// Geeft [[{x,y} x4]] terug in leesvolgorde (rij voor rij, van links naar rechts), in de
// coördinaten van `drawable`. Een stap die faalt, laat het resultaat van de vorige staan.

// Onder deze "geruitheid" (zie patternSeparation in quadFit.js) is het geen bord: alle
// gemeten tekstblokken, foto's en een hand lagen op of onder 0,58, vaag gedrukte echte
// borden op 0,71 of hoger.
const MIN_SEPARATION = 0.6;
// Tweede vangnet, in grijswaarden: het contrast tussen lichte en donkere velden. Tekst en
// foto's kwamen op 3 tot 7 (ook als hun "geruitheid" boven 0,6 uitkwam), het vaagst
// gedrukte echte bord op 16.
const MIN_CONTRAST = 10;

function readingOrder(boards) {
  if (boards.length < 2) return boards;
  const center = (q) => ({ x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4 });
  const sides = boards.map((q) => Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y)).sort((a, b) => a - b);
  const tolerance = 0.5 * sides[Math.floor(sides.length / 2)];
  const items = boards.map((q) => ({ q, c: center(q) })).sort((a, b) => a.c.y - b.c.y);
  const rows = [];
  for (const item of items) {
    const row = rows.find((r) => Math.abs(r.y - item.c.y) <= tolerance);
    if (row) {
      row.items.push(item);
      row.y = row.items.reduce((s, it) => s + it.c.y, 0) / row.items.length;
    } else {
      rows.push({ y: item.c.y, items: [item] });
    }
  }
  rows.sort((a, b) => a.y - b.y);
  return rows.flatMap((r) => r.items.sort((a, b) => a.c.x - b.c.x).map((it) => it.q));
}

export function detectBulkBoards(drawable) {
  const rough = detectMultipleBoardCorners(drawable);
  let boards = rough;
  try {
    boards = rough
      .map((corners) => fitCornersOnDrawable(drawable, corners))
      .filter((fit) => fit.separation >= MIN_SEPARATION && fit.score >= MIN_CONTRAST)
      .map((fit) => fit.corners);
  } catch {
    boards = rough;
  }
  try {
    boards = [...boards, ...findMissingBoardsOnDrawable(drawable, boards).map((b) => b.corners)];
  } catch {
    // laat wat we al hebben staan
  }
  return readingOrder(boards);
}
