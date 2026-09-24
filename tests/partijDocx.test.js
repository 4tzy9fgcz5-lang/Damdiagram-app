import { describe, it, assertTrue, assertEqual } from "./test-runner.js?v=20260925d";
import { buildPartijDocxBlob } from "../src/export/partijDocx.js?v=20260925d";
import { createStartBoard } from "../src/core/board.js?v=20260925d";
import { getLegalMoves } from "../src/core/draughtsMoves.js?v=20260925d";
import { maakWortel, voegZetToe } from "../src/core/zettenboom.js?v=20260925d";

async function readMagicBytes(blob, count) {
  const buf = await blob.slice(0, count).arrayBuffer();
  return new Uint8Array(buf);
}

function eenPartij() {
  const board = createStartBoard();
  const wortel = maakWortel();
  voegZetToe(wortel, board, "white", getLegalMoves(board, "white")[0], { teken: "!" });
  return {
    witVoornaam: "",
    witAchternaam: "Wiersma",
    zwartVoornaam: "G.",
    zwartAchternaam: "Jansen",
    toernooi: "NK 1998",
    ronde: "5",
    datum: "1998-05-20",
    uitslag: "1-0",
    bron: "Dammen 129/130",
    notities: "5e barragepartij",
    wortel,
    beginFen: null,
  };
}

describe("partij-export (.docx)", () => {
  it("bouwt een geldig .docx-bestand voor een partij met zetten", async () => {
    const blob = await buildPartijDocxBlob(eenPartij());
    assertTrue(blob.size > 500);
    const magic = await readMagicBytes(blob, 2);
    assertEqual(magic[0], 0x50);
    assertEqual(magic[1], 0x4b);
  });

  it("werkt ook voor een partij zonder zetten (nog niets ingevoerd)", async () => {
    const blob = await buildPartijDocxBlob({ witAchternaam: "A", zwartAchternaam: "B", wortel: maakWortel() });
    assertTrue(blob.size > 500);
  });
});
