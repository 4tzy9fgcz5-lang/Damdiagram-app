import * as docxLib from "../../lib/docx.mjs?v=20260923n";
import { createStartBoard } from "../core/board.js?v=20260923n";
import { parseFen } from "../core/fen.js?v=20260923n";
import { formatteerBoomTekst } from "../core/zettenboom.js?v=20260923n";
import { naamPrint } from "../core/namen.js?v=20260923n";

const { Document, Packer, Paragraph, TextRun, convertMillimetersToTwip } = docxLib;

function mmToTwip(mm) {
  return convertMillimetersToTwip(mm);
}

const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = 20;

// Fase 2, stap 4 (uitbreiding): een partij printen. Bewust een eigen, EENVOUDIG document i.p.v.
// dit in docx.js (de stencil-export) te passen — dat bestand is helemaal op het herhalende
// opgaven/oplossingen-blad van een opgaveblad gebouwd (koptekst per pagina, rastertabel), een
// partij is gewoon één doorlopend document. Bewust ALLEEN de notatie (bevestigd door Jan): geen
// diagrammen halverwege de tekst zoals damkunst.nl — dat is losstaand van de filmmodule
// (stap 5), die zijn eigen 6 diagrammen al heeft.
export async function buildPartijDocxBlob(partij) {
  const titel =
    [naamPrint(partij.witVoornaam, partij.witAchternaam), naamPrint(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  const metaRegels = [
    [partij.toernooi, partij.ronde ? `ronde ${partij.ronde}` : ""].filter(Boolean).join(", "),
    [partij.datum, partij.uitslag].filter(Boolean).join(" — "),
    partij.bron,
  ].filter(Boolean);

  const { turn } = partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
  const notatie = formatteerBoomTekst(partij.wortel, turn);

  const children = [
    new Paragraph({ children: [new TextRun({ text: titel, bold: true, size: 32 })], spacing: { after: 160 } }),
    ...metaRegels.map((regel) => new Paragraph({ children: [new TextRun({ text: regel, size: 22, color: "555555" })], spacing: { after: 60 } })),
  ];
  if (partij.notities) {
    children.push(new Paragraph({ children: [new TextRun({ text: partij.notities, italics: true, size: 22 })], spacing: { before: 120, after: 200 } }));
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: notatie || "(nog geen zetten)", size: 22 })],
      spacing: { before: 200 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwip(PAGE_MM.width), height: mmToTwip(PAGE_MM.height) },
            margin: { top: mmToTwip(MARGIN_MM), bottom: mmToTwip(MARGIN_MM), left: mmToTwip(MARGIN_MM), right: mmToTwip(MARGIN_MM) },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
