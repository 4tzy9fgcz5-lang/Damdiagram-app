import { describe, it, assertTrue, assertEqual } from "./test-runner.js";
import { buildStencilDocxBlob } from "../src/export/docx.js";

const stencil = {
  titel: "Testblad",
  club: "DV Test",
  datum: "2026-01-01",
  opdrachtregel: "Wit speelt en wint",
};

const items = [
  {
    standId: "a",
    opdracht: "",
    stand: { fen: "W:W13,15,33:B1,5,30", opdracht: "", oplossing: "33-28", auteur: "A", jaartal: 2000, publicatie: "Boek" },
  },
  {
    standId: "b",
    opdracht: "Zwart wint",
    stand: { fen: "W:W14:B2", opdracht: "", oplossing: "", auteur: "", jaartal: null, publicatie: "" },
  },
];

async function readMagicBytes(blob, count) {
  const buf = await blob.slice(0, count).arrayBuffer();
  return new Uint8Array(buf);
}

describe("Word-export (.docx)", () => {
  it("bouwt een geldig .docx-bestand (zip) voor opgaven", async () => {
    const blob = await buildStencilDocxBlob(stencil, items, "opgaven");
    assertTrue(blob.size > 1000);
    const magic = await readMagicBytes(blob, 2);
    assertEqual(magic[0], 0x50);
    assertEqual(magic[1], 0x4b);
  });

  it("bouwt een geldig .docx-bestand voor oplossingen", async () => {
    const blob = await buildStencilDocxBlob(stencil, items, "oplossingen");
    assertTrue(blob.size > 500);
  });

  it("bouwt een geldig .docx-bestand met beide op aparte paginas", async () => {
    const blob = await buildStencilDocxBlob(stencil, items, "beide");
    assertTrue(blob.size > 1000);
  });

  it("werkt ook met een ontbrekende stand tussen de items", async () => {
    const withMissing = [...items, { standId: "c", opdracht: "", stand: null }];
    const blob = await buildStencilDocxBlob(stencil, withMissing, "beide");
    assertTrue(blob.size > 1000);
  });
});
