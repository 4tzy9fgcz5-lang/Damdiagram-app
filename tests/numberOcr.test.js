import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260925d";
import { parseDiagramNumber, fillMissingNumbers, stripRect, stripQuad } from "../src/recognition/numberOcr.js?v=20260925d";

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

  it("werkt ook over pagina's heen: nummers van foto 1 en foto 2 lopen door", () => {
    // twee foto's met elk 2 rijen van 2 diagrammen; foto 2 begint met twee onleesbare nummers
    const page = (nrs, p) => nrs.map((nummer, i) => ({ nummer, cx: p * 100000 + 200 + (i % 2) * 400, cy: 200 + Math.floor(i / 2) * 400, breedte: 300 }));
    const r = fillMissingNumbers([...page([21, 22, 23, 24], 0), ...page([null, null, 27, 28], 1)]);
    assertEqual(r.map((x) => x.nummer), [21, 22, 23, 24, 25, 26, 27, 28]);
    assertEqual(r.map((x) => x.afgeleid), [false, false, false, false, true, true, false, false]);
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

// Eén rij, elk diagram op zijn eigen plek (ver genoeg uit elkaar dat kolomvolgorde = leesvolgorde):
// voor tests die puur de leesvolgorde-logica raken, zonder dat de kolomherkenning meedoet.
function row(nrs) {
  return nrs.map((nummer, i) => ({ nummer, cx: 200 + i * 500, cy: 200, breedte: 300 }));
}

describe("numberOcr: nummers die niet bij de rest van de import passen (2026-09-23)", () => {
  it("verwerpt kleine, op zichzelf 'kloppende' foutlezingen tussen veel grotere, correcte nummers", () => {
    // Nagebootst op wat Jan meldde: op de ene pagina las de tekstlezer 151 goed maar 152-154 als
    // 45/8/297; op de andere pagina 155-158 als 0/(niet gelezen)/1/(niet gelezen), met 159 en 160
    // wél goed. Op zo'n pagina alléén is dit soms niet op te lossen (te weinig bekende nummers om
    // "45" als vreemd te herkennen) — maar in een gewone bulk-import van een heel boek staan er
    // tientallen andere, wél goed gelezen nummers naast (hier 131-150), en dat is genoeg om ze als
    // groep te herkennen als "hoort hier niet bij" en via de reeks (151, dan 159/160) te herstellen.
    const goedDaarvoor = Array.from({ length: 20 }, (_, i) => 131 + i); // 131..150, allemaal goed
    const raw = [...goedDaarvoor, 151, 45, 8, 297, 0, null, 1, null, 159, 160];
    const r = fillMissingNumbers(row(raw));
    assertEqual(r.slice(0, 20).map((x) => x.nummer), goedDaarvoor, "de al goede nummers blijven staan");
    assertTrue(r.slice(0, 20).every((x) => !x.afgeleid));
    assertEqual(
      r.slice(20).map((x) => x.nummer),
      [151, 152, 153, 154, 155, 156, 157, 158, 159, 160],
      "152-158 worden hersteld met 151 en 159/160 als betrouwbare buren"
    );
    assertTrue(r[20].afgeleid === false && r[28].afgeleid === false && r[29].afgeleid === false, "151, 159 en 160 zelf zijn gewoon gelezen, niet afgeleid");
    assertTrue([21, 22, 23, 24, 25, 26, 27].every((i) => r[i].afgeleid), "152-158 zijn afgeleid");
  });

  it("doet niets als er te weinig gelezen nummers zijn om iets als 'vreemd' te herkennen", () => {
    // Dezelfde foute lezingen, maar zonder de 20 betrouwbare buren: te weinig gegevens, dus liever
    // niets aanpassen dan een gok wagen (zie ook "vult niets aan als het niet zeker is" hierboven).
    const r = fillMissingNumbers(row([151, 45, 8, 297]));
    assertEqual(r[0], { nummer: 151, afgeleid: false });
  });

  it("vergelijkt met de eigen BUURT, niet met het midden van een heel boek (1 t/m 300)", () => {
    // Bij een bulk-import van een heel boek lopen de nummers over veel meer dan 25 uiteen (hier
    // 1..300) — een diagram vroeg of laat in het boek zou t.o.v. het MIDDEN van de hele import
    // (~150) altijd als "te ver weg" afgekeurd worden als de vergelijking niet lokaal was.
    const heelBoek = Array.from({ length: 300 }, (_, i) => i + 1);
    const r = fillMissingNumbers(row(heelBoek));
    assertEqual(r.map((x) => x.nummer), heelBoek, "niets uit het begin of eind van het boek wordt afgekeurd");
    assertTrue(r.every((x) => !x.afgeleid));
  });

  it("herkent ook een fout gelezen nummer dat zelf niet als 'gat' opvalt, met genoeg buren (echte foto van Jan)", () => {
    // Precies de situatie uit testdata/nummers/IMG_0795.jpg: 152 werd gelezen als "132" (Tesseract
    // verwisselt de 5 met een 3) — dat getal zit niet "midden in een reeks" (findOutliers ziet dus
    // niets), maar wijkt wel duidelijk af van de buurt eromheen.
    const goedDaarvoor = Array.from({ length: 20 }, (_, i) => 131 + i); // 131..150
    const raw = [...goedDaarvoor, 151, 132, 153, 154]; // 152 gelezen als 132
    const r = fillMissingNumbers(row(raw));
    assertEqual(r.slice(20).map((x) => x.nummer), [151, 152, 153, 154]);
    assertTrue(r[21].afgeleid, "132 wordt verworpen en via 151/153 hersteld tot 152");
  });
});

// Kruisproduct (maat voor hoe ver twee vectoren van evenwijdig af zitten) getoetst relatief aan
// de lengte van de vectoren, zodat de test niet flakey wordt door afrondingsverschillen bij grote
// coördinaten (zoals na een paar keer sinus/cosinus).
function assertParallel(a, b, message) {
  const scale = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  assertTrue(Math.abs(a.x * b.y - a.y * b.x) < 1e-6 * Math.max(scale, 1), message);
}

describe("numberOcr: strookje boven het bord volgt de scheefstand van het diagram (2026-09-23)", () => {
  it("ligt boven een recht (niet-scheef) bord, iets breder dan het bord", () => {
    const corners = [
      { x: 1000, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 2000 },
      { x: 1000, y: 2000 },
    ];
    // stripQuad geeft [boven-links, boven-rechts, bord-rechtsboven, bord-linksboven] terug; de
    // laatste twee liggen iets buiten de aangewezen hoeken (het strookje steekt iets breder uit).
    const [aboveTL, aboveTR, boardTR, boardTL] = stripQuad(corners);
    assertTrue(boardTL.x < corners[0].x && boardTR.x > corners[1].x, "onderkant van het strookje is iets breder dan het bord");
    assertEqual(boardTL.y, corners[0].y);
    assertEqual(boardTR.y, corners[1].y);
    assertTrue(aboveTL.y < corners[0].y && aboveTR.y < corners[1].y, "strookje ligt boven het bord");
    assertTrue(Math.abs(aboveTL.y - aboveTR.y) < 1e-6, "niet-scheef bord geeft een niet-scheef strookje");
    assertTrue(aboveTL.x < corners[0].x && aboveTR.x > corners[1].x, "iets breder dan het bord");
  });

  it("volgt de scheefstand van een gedraaid bord (het strookje draait mee)", () => {
    // Een vierkant van 1000x1000, 20° gedraaid om het midden — zoals een diagram dat scheef op de
    // foto staat.
    const angle = (20 * Math.PI) / 180;
    const center = { x: 1500, y: 1500 };
    const square = [
      { x: 1000, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 2000 },
      { x: 1000, y: 2000 },
    ];
    const corners = square.map(({ x, y }) => ({
      x: center.x + (x - center.x) * Math.cos(angle) - (y - center.y) * Math.sin(angle),
      y: center.y + (x - center.x) * Math.sin(angle) + (y - center.y) * Math.cos(angle),
    }));
    const [TL, TR, , BL] = corners;
    const boardTop = { x: TR.x - TL.x, y: TR.y - TL.y };
    const boardLeft = { x: TL.x - BL.x, y: TL.y - BL.y };

    const [aboveTL, aboveTR, boardTRwide, boardTLwide] = stripQuad(corners);
    const stripTop = { x: aboveTR.x - aboveTL.x, y: aboveTR.y - aboveTL.y };
    const stripLeftSide = { x: aboveTL.x - boardTLwide.x, y: aboveTL.y - boardTLwide.y };
    const stripBottom = { x: boardTRwide.x - boardTLwide.x, y: boardTRwide.y - boardTLwide.y };
    // De bovenkant, onderkant én zijkant van het strookje lopen evenwijdig aan de bijbehorende
    // zijde van het bord (niet "recht omhoog" op de foto) — het strookje draait mee met het bord,
    // in plaats van een assen-gelijk kader om de 4 hoekpunten te zijn.
    assertParallel(boardTop, stripTop, "strookje-top evenwijdig aan bord-top");
    assertParallel(boardTop, stripBottom, "onderkant van het strookje evenwijdig aan bord-top");
    assertParallel(boardLeft, stripLeftSide, "strookje volgt de linkerzijde van het bord");
    // En het strookje zit aan de kant van "omhoog langs het bord", niet omlaag.
    assertTrue(stripLeftSide.x * boardLeft.x + stripLeftSide.y * boardLeft.y > 0, "wijst dezelfde kant op als de bordzijde");
  });

  it("geeft null bij een ontaarde vierhoek (twee hoekpunten die samenvallen)", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 0 }, // zelfde punt als de eerste hoek: linkerzijde heeft lengte 0
    ];
    assertEqual(stripQuad(corners), null);
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
