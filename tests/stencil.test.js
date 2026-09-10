import { describe, it, assertEqual, assertThrows } from "./test-runner.js";
import { getGridLayout, computeCellRects, MAX_DIAGRAMS_PER_STENCIL } from "../src/stencil/layout.js";
import { buildStencilPagesHTML, missingOplossingen } from "../src/stencil/stencilPreview.js";

describe("stencil: rasterindeling", () => {
  it("gebruikt 3 kolommen x 4 rijen bij 12 diagrammen", () => {
    assertEqual(getGridLayout(12), { cols: 3, rows: 4 });
  });
  it("gebruikt een net raster voor 1 diagram", () => {
    assertEqual(getGridLayout(1), { cols: 1, rows: 1 });
  });
  it("gebruikt 2x2 voor 4 diagrammen", () => {
    assertEqual(getGridLayout(4), { cols: 2, rows: 2 });
  });
  it("weigert 0 of meer dan 12 diagrammen", () => {
    assertThrows(() => getGridLayout(0));
    assertThrows(() => getGridLayout(13));
  });
  it("berekent genormaliseerde celposities die het vlak volledig vullen", () => {
    const { rects, cols, rows } = computeCellRects(6);
    assertEqual(rects.length, 6);
    assertEqual(rects[0], { x: 0, y: 0, w: 1 / cols, h: 1 / rows });
  });
  it("MAX_DIAGRAMS_PER_STENCIL is 12", () => {
    assertEqual(MAX_DIAGRAMS_PER_STENCIL, 12);
  });
});

describe("stencil: voorbeeldweergave", () => {
  const stencil = {
    titel: "Testblad",
    club: "DV Test",
    datum: "2026-01-01",
    opdrachtregel: "Wit speelt en wint",
  };
  const items = [
    { standId: "a", opdracht: "", stand: { fen: "W:W13:B1", opdracht: "", oplossing: "13-9", auteur: "A", jaartal: 2000, publicatie: "" } },
    { standId: "b", opdracht: "", stand: { fen: "W:W14:B2", opdracht: "", oplossing: "", auteur: "", jaartal: null, publicatie: "" } },
  ];

  it("bouwt een HTML-pagina met opgaven", () => {
    const html = buildStencilPagesHTML(stencil, items, "opgaven");
    assertEqual(html.includes("Testblad"), true);
    assertEqual(html.includes("<svg"), true);
    assertEqual(html.includes("Oplossingen"), false);
  });
  it("bouwt een aparte oplossingenpagina", () => {
    const html = buildStencilPagesHTML(stencil, items, "oplossingen");
    assertEqual(html.includes("Oplossingen"), true);
    assertEqual(html.includes("13-9"), true);
    assertEqual(html.includes("geen oplossing ingevoerd"), true);
  });
  it("telt standen zonder oplossing", () => {
    assertEqual(missingOplossingen(items), 1);
  });
});
