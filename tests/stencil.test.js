import { describe, it, assertEqual, assertThrows } from "./test-runner.js?v=20260923l";
import { getGridLayout, computeCellRects, paginateItems, MAX_DIAGRAMS_PER_PAGE } from "../src/stencil/layout.js?v=20260923l";
import { buildStencilPagesHTML, missingOplossingen } from "../src/stencil/stencilPreview.js?v=20260923l";
import { opdrachtregelMetOndertitel } from "../src/stencil/compose.js?v=20260923l";

describe("stencil: rasterindeling", () => {
  it("gebruikt altijd 3 kolommen x 4 rijen, ongeacht het aantal diagrammen", () => {
    // Vast rooster (zie layout.js) zodat elk diagram overal even groot blijft —
    // ook op een pagina met maar 1 of 2 stuks, i.p.v. een eigen, grotere cel.
    assertEqual(getGridLayout(12), { cols: 3, rows: 4 });
    assertEqual(getGridLayout(1), { cols: 3, rows: 4 });
    assertEqual(getGridLayout(4), { cols: 3, rows: 4 });
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
  it("MAX_DIAGRAMS_PER_PAGE is 12", () => {
    assertEqual(MAX_DIAGRAMS_PER_PAGE, 12);
  });
  it("verdeelt items in pagina's van maximaal 12", () => {
    const items = Array.from({ length: 14 }, (_, i) => i);
    const paginas = paginateItems(items);
    assertEqual(paginas.length, 2);
    assertEqual(paginas[0].length, 12);
    assertEqual(paginas[1].length, 2);
  });
  it("geeft één lege pagina voor een leeg opgaveblad", () => {
    assertEqual(paginateItems([]), [[]]);
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
  it("zet de ondertitel vooraan bij de opdrachtregel, gescheiden door een koppelteken", () => {
    assertEqual(
      opdrachtregelMetOndertitel({ ...stencil, ondertitel: "Clubkampioenschap ronde 3" }),
      "Clubkampioenschap ronde 3 - Wit speelt en wint"
    );
  });
  it("laat de opdrachtregel ongewijzigd zonder ondertitel", () => {
    assertEqual(opdrachtregelMetOndertitel(stencil), "Wit speelt en wint");
  });
});
