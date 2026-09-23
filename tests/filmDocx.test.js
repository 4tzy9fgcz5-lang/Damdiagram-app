import { describe, it, assertTrue, assertEqual } from "./test-runner.js?v=20260923n";
import { buildFilmDocxBlob } from "../src/export/filmDocx.js?v=20260923n";
import { createStartBoard } from "../src/core/board.js?v=20260923n";
import { getLegalMoves, applyMove, opposite } from "../src/core/draughtsMoves.js?v=20260923n";
import { maakWortel, voegZetToe } from "../src/core/zettenboom.js?v=20260923n";

async function readMagicBytes(blob, count) {
  const buf = await blob.slice(0, count).arrayBuffer();
  return new Uint8Array(buf);
}

// Speelt steeds de eerste toegestane zet door, `aantal` keer, zodat er een echte hoofdlijn van
// voldoende lengte is om filmmomenten uit te kiezen.
function eenPartijMetZetten(aantal) {
  const wortel = maakWortel();
  let knoop = wortel;
  let b = createStartBoard();
  let t = "white";
  for (let i = 0; i < aantal; i++) {
    const zet = getLegalMoves(b, t)[0];
    const r = voegZetToe(knoop, b, t, zet, i === 3 ? { commentaar: "een mooie zet" } : undefined);
    assertTrue(r.ok, `zet ${i} moet geldig zijn`);
    knoop = r.knoop;
    b = applyMove(b, zet);
    t = opposite(t);
  }
  return { witAchternaam: "A", zwartAchternaam: "B", toernooi: "Test", beginFen: null, wortel };
}

describe("filmmodule-export (.docx)", () => {
  it("bouwt een geldig opdrachtvel (lege diagrammen)", async () => {
    const partij = { ...eenPartijMetZetten(20), film: { aantalDiagrammen: 4, zetIndices: [0, 3, 9, 15] } };
    const blob = await buildFilmDocxBlob(partij, "opdracht");
    assertTrue(blob.size > 500);
    const magic = await readMagicBytes(blob, 2);
    assertEqual(magic[0], 0x50);
    assertEqual(magic[1], 0x4b);
  });

  it("bouwt een geldig antwoordvel (ingevulde diagrammen met zetnummer/toelichting)", async () => {
    const partij = { ...eenPartijMetZetten(20), film: { aantalDiagrammen: 4, zetIndices: [0, 3, 9, 15] } };
    const blob = await buildFilmDocxBlob(partij, "antwoord");
    assertTrue(blob.size > 500);
  });

  it("bouwt allebei achter elkaar", async () => {
    const partij = { ...eenPartijMetZetten(20), film: { aantalDiagrammen: 4, zetIndices: [0, 3, 9, 15] } };
    const blob = await buildFilmDocxBlob(partij, "beide");
    assertTrue(blob.size > 500);
  });

  it("weigert zonder gekozen filmmomenten, met een duidelijke reden", async () => {
    const partij = eenPartijMetZetten(10);
    let fout = null;
    try {
      await buildFilmDocxBlob(partij, "opdracht");
    } catch (e) {
      fout = e;
    }
    assertTrue(fout instanceof Error);
    assertTrue(fout.message.includes("filmmomenten"));
  });
});
