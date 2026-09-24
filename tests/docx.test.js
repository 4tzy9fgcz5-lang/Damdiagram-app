import { describe, it, assertTrue, assertEqual } from "./test-runner.js?v=20260925d";
import { buildStencilDocxBlob } from "../src/export/docx.js?v=20260925d";

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

// Pakt "word/document.xml" uit een gegenereerde .docx (een gewone ZIP) uit, om de ECHTE
// opgemaakte tekst te controleren i.p.v. alleen de bestandsgrootte. Alleen lokaal in deze
// testfile nodig (nergens anders getest), dus geen aparte gedeelde module.
async function extractDocumentXml(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let offset = 0;
  while (offset < buf.length - 4) {
    if (dv.getUint32(offset, true) !== 0x04034b50) break;
    const compMethod = dv.getUint16(offset + 8, true);
    const compSize = dv.getUint32(offset + 18, true);
    const nameLen = dv.getUint16(offset + 26, true);
    const extraLen = dv.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(buf.slice(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const compData = buf.slice(dataStart, dataStart + compSize);
    if (name === "word/document.xml") {
      if (compMethod === 0) return new TextDecoder().decode(compData);
      const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    offset = dataStart + compSize;
  }
  return null;
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

  it("gebruikt Courier New op de oplossingenpagina (2026-09-23, Jans wens: zelfde regels als bij de filmmodule)", async () => {
    const blob = await buildStencilDocxBlob(stencil, items, "oplossingen");
    const xml = await extractDocumentXml(blob);
    assertTrue(xml.includes("Courier New"), "de oplossingentekst moet Courier New gebruiken");
    assertTrue(xml.includes("33-28"), "de echte oplossingstekst moet er nog steeds in staan");
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
