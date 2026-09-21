import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260921as";
import { parseDiagramNumber, fillMissingNumbers, stripRect } from "../src/recognition/numberOcr.js?v=20260921as";

describe("numberOcr: nummer uit gelezen tekst halen", () => {
  it("vindt het nummer achter een woord of met een sterretje erachter", () => {
    assertEqual(parseDiagramNumber("Диаграмма 570"), 570);
    assertEqual(parseDiagramNumber("uapares 571\n"), 571);
    assertEqual(parseDiagramNumber("Диаграмма 580*)"), 580);
    assertEqual(parseDiagramNumber("34"), 34);
  });

  it("kiest het langste cijfergroepje als er ruis bij staat", () => {
    assertEqual(parseDiagramNumber("| 1 . 572 "), 572);
  });

  it("geeft null als er geen cijfers zijn (of alleen een lange reeks)", () => {
    assertEqual(parseDiagramNumber(""), null);
    assertEqual(parseDiagramNumber("Диаграмма"), null);
    assertEqual(parseDiagramNumber("123456"), null);
  });
});

// Een raster van 3 kolommen x 4 rijen; `nrs` per positie in leesvolgorde (rij voor rij).
function grid(nrs) {
  return nrs.map((nummer, i) => ({ nummer, cx: 200 + (i % 3) * 400, cy: 200 + Math.floor(i / 3) * 400, breedte: 300 }));
}

describe("numberOcr: ontbrekende nummers aanvullen", () => {
  it("vult een gat tussen twee nummers als de reeks past (nummers per rij)", () => {
    const items = grid([570, 571, 572, 573, null, 575, 576, 577, 578, 579, 580, null]);
    const r = fillMissingNumbers(items);
    assertEqual(r[4], { nummer: 574, afgeleid: true });
    assertEqual(r[11], { nummer: 581, afgeleid: true }, "achteraan doorlopen");
    assertEqual(r[0], { nummer: 570, afgeleid: false });
  });

  it("werkt ook als de nummers per kolom oplopen (boven naar beneden, dan de volgende kolom)", () => {
    // kolom 1: 34-37, kolom 2: 38-41, kolom 3: 42-45; leesvolgorde is rij voor rij
    const byColumn = [34, 38, 42, 35, null, 43, 36, 40, 44, 37, 41, null];
    const r = fillMissingNumbers(grid(byColumn));
    assertEqual(r[4], { nummer: 39, afgeleid: true });
    assertEqual(r[11], { nummer: 45, afgeleid: true });
  });

  it("herkent een verkeerd gelezen nummer aan de doorlopende reeks en herstelt dat", () => {
    // 593 is als "3" gelezen; 577 als "77"
    const items = grid([582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 3]);
    const r = fillMissingNumbers(items);
    assertEqual(r[11], { nummer: 593, afgeleid: true });
    const mid = fillMissingNumbers(grid([570, 571, 572, 573, 574, 575, 576, 77, 578, 579, 580, 581]));
    assertEqual(mid[7], { nummer: 577, afgeleid: true });
  });

  it("vult niets aan als het niet zeker is", () => {
    const r = fillMissingNumbers(grid([null, 800, null, 12, null, 90, null, null, null, null, null, null]));
    assertTrue(r.every((x, i) => (i === 1 || i === 3 || i === 5 ? !x.afgeleid : x.nummer === null || x.afgeleid)));
    assertEqual(r[0].nummer, null);
  });

  it("laat gelezen nummers ongemoeid, ook als ze niet doorlopen", () => {
    const r = fillMissingNumbers(grid([5, 9, 1, 2, 3, 4, 8, 7, 6, 10, 11, 12]));
    assertEqual(r.map((x) => x.nummer), [5, 9, 1, 2, 3, 4, 8, 7, 6, 10, 11, 12]);
    assertTrue(r.every((x) => !x.afgeleid));
  });
});

describe("numberOcr: strookje boven het bord", () => {
  it("ligt boven het bord, iets breder dan het bord", () => {
    const corners = [
      { x: 1000, y: 1000 },
      { x: 2000, y: 1010 },
      { x: 2000, y: 2000 },
      { x: 1000, y: 2000 },
    ];
    const r = stripRect(corners, 4000, 3000);
    assertTrue(r.x < 1000 && r.x + r.width > 2000, "breder dan het bord");
    assertTrue(r.y < 1000 && r.y + r.height > 1000 && r.y + r.height < 1100, "eindigt vlak onder de bovenrand");
  });

  it("geeft null als het bord tegen de bovenrand van de foto zit", () => {
    const corners = [
      { x: 100, y: 5 },
      { x: 900, y: 5 },
      { x: 900, y: 800 },
      { x: 100, y: 800 },
    ];
    assertEqual(stripRect(corners, 2000, 2000), null);
  });
});
