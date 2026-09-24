import * as docxLib from "../../lib/docx.mjs?v=20260925b";
import { createStartBoard, createEmptyBoard } from "../core/board.js?v=20260925b";
import { parseFen } from "../core/fen.js?v=20260925b";
import { applyMove, plyMoveNumber } from "../core/draughtsMoves.js?v=20260925b";
import { hoofdlijnKnopen, notatieKortMetVoorloopnul } from "../core/zettenboom.js?v=20260925b";
import { renderDiagramSVG } from "../diagram/render.js?v=20260925b";
import { svgToPngBytes } from "./rasterize.js?v=20260925b";
import { naamPrint } from "../core/namen.js?v=20260925b";
import { bouwZettenRooster, zetParen } from "./zetRooster.js?v=20260925b";

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
  BorderStyle,
  TableLayoutType,
  convertMillimetersToTwip,
} = docxLib;

function mmToTwip(mm) {
  return convertMillimetersToTwip(mm);
}
function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

const PAGE_MM = { width: 210, height: 297 };
// Bijgesteld 2026-09-24 (Jans melding: "diagrammen passen niet op de pagina") van 16 naar 12mm —
// meer speelruimte, samen met de andere fix hieronder (`layout: FIXED` op de diagramtabel).
const MARGIN_MM = 12;
const PRINT_DPI = 300;
const DISPLAY_DPI = 96;
// 3 kolommen (zoals Jans meegestuurde voorbeeldvellen, 2026-09-23): zo passen 6 diagrammen in
// 2 rijen, ruim binnen één A4 met de koptekst en de notatie erboven — met 2 kolommen (3 rijen)
// paste dat niet meer.
const COLS = 3;
const FONT = "Courier New";
const NOTATIE_SIZE = 21; // 10,5pt (Jans wens) — docx rekent in halve punten
const BLANCO_REGEL = "_".repeat(20);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLE_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

// Fase 2, stap 5 (filmmodule, zie CLAUDE.md); bijgewerkt 2026-09-23 (CLAUDE.md-feedback) naar
// het formaat van Jans meegestuurde voorbeeldvellen: van een partij een opdrachtvel (lege,
// genummerde diagrammen met een invulregel eronder — de speler zoekt zelf de belangrijkste
// momenten en schrijft de zet erbij) en/of een antwoordvel (diezelfde diagrammen ingevuld, met
// zetnummer en eventueel de toelichting) maken. Bewust een eigen bestand, net als partijDocx.js.
async function buildImageRun(board, imagePxDisplay) {
  const svg = renderDiagramSVG(board, { size: 300 });
  const rasterPx = Math.max(imagePxDisplay, mmToPx((imagePxDisplay / DISPLAY_DPI) * 25.4, PRINT_DPI));
  const bytes = await svgToPngBytes(svg, rasterPx);
  return new ImageRun({ type: "png", data: bytes, transformation: { width: imagePxDisplay, height: imagePxDisplay } });
}

// Geen "Naam: ..."-regel meer (Jan, 2026-09-23: "hoeft geen regel voor de naam van degene die
// de film maakt"); toernooi/ronde/datum/uitslag op zo min mogelijk regels, net als partijDocx.js.
function koptekst(partij) {
  const titel =
    [naamPrint(partij.witVoornaam, partij.witAchternaam), naamPrint(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  const metaRegel = [partij.toernooi, partij.ronde ? `ronde ${partij.ronde}` : "", partij.datum, partij.uitslag].filter(Boolean).join(", ");
  const regels = [new Paragraph({ children: [new TextRun({ text: titel, bold: true, font: FONT, size: 32 })], spacing: { after: 100 } })];
  if (metaRegel) {
    regels.push(new Paragraph({ children: [new TextRun({ text: metaRegel, font: FONT, size: NOTATIE_SIZE, color: "555555" })], spacing: { after: 160 } }));
  }
  return regels;
}

// Standen bij elke knoop van de hoofdlijn, index 0 = de beginstand (vóór zet 1).
function standenOpHoofdlijn(beginBord, hoofdlijn) {
  const standen = [beginBord];
  for (const knoop of hoofdlijn) standen.push(applyMove(standen[standen.length - 1], knoop.zet));
  return standen;
}

// `cellen`: lijst van `{ board, onderschriftParagrafen }` (dat laatste optioneel, al kant-en-
// klare `Paragraph`-objecten). Elk diagram krijgt een genummerd kopje ("Diagram N") erboven,
// zoals op Jans voorbeeldvellen.
async function diagramTabel(cellen) {
  const usableWidthMm = PAGE_MM.width - 2 * MARGIN_MM;
  const cellWMm = usableWidthMm / COLS;
  const imagePx = mmToPx(cellWMm - 4, DISPLAY_DPI);
  const rows = [];
  for (let r = 0; r < cellen.length; r += COLS) {
    const rijCellen = await Promise.all(
      cellen.slice(r, r + COLS).map(async ({ board, nummer, onderschriftParagrafen = [] }) => {
        const kinderen = [
          new Paragraph({ children: [new TextRun({ text: `Diagram ${nummer}`, bold: true, font: FONT, size: NOTATIE_SIZE })], spacing: { after: 40 } }),
          new Paragraph({ children: [await buildImageRun(board, imagePx)] }),
          ...onderschriftParagrafen,
        ];
        return new TableCell({
          width: { size: mmToTwip(cellWMm), type: WidthType.DXA },
          margins: { top: mmToTwip(2), bottom: mmToTwip(2), left: mmToTwip(2), right: mmToTwip(2) },
          children: kinderen,
        });
      })
    );
    while (rijCellen.length < COLS) rijCellen.push(new TableCell({ children: [new Paragraph({ children: [] })] }));
    rows.push(new TableRow({ children: rijCellen }));
  }
  // `layout: FIXED` + expliciete `columnWidths` op de tabel zelf (niet alleen op elke cel) —
  // zonder dat negeert Word de opgegeven kolombreedtes en berekent hij ze zelf uit de inhoud
  // (AUTOFIT, de standaard), wat precies de oorzaak was van Jans melding (2026-09-24):
  // "diagrammen passen niet op de pagina". Zie ook zetRooster.js voor dezelfde valkuil.
  return new Table({
    width: { size: mmToTwip(usableWidthMm), type: WidthType.DXA },
    columnWidths: new Array(COLS).fill(mmToTwip(cellWMm)),
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows,
  });
}

function beginstand(partij) {
  return partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
}

// `mode`: "opdracht" (lege diagrammen + invulregel), "antwoord" (ingevuld) of "beide" (allebei,
// op aparte pagina's — hier volstaat gewoon een pagina-einde, dit document heeft geen
// herhalende koptekst per pagina zoals een opgaveblad).
export async function buildFilmDocxBlob(partij, mode = "beide") {
  if (!partij.film?.zetIndices?.length) throw new Error("Kies eerst de filmmomenten voor je een opdracht-/antwoordvel maakt.");
  const { board: beginBord, turn } = beginstand(partij);
  const hoofdlijn = hoofdlijnKnopen(partij.wortel);
  const standen = standenOpHoofdlijn(beginBord, hoofdlijn);
  const zetIndices = [...partij.film.zetIndices].sort((a, b) => a - b);

  const usableWidthMm = PAGE_MM.width - 2 * MARGIN_MM;
  const rooster = () => bouwZettenRooster(zetParen(hoofdlijn, turn), { usableWidthMm, font: FONT, size: NOTATIE_SIZE });
  const children = [];

  if (mode === "opdracht" || mode === "beide") {
    children.push(...koptekst(partij), ...rooster());
    const legeCellen = zetIndices.map((_, i) => ({
      board: createEmptyBoard(),
      nummer: i + 1,
      onderschriftParagrafen: [new Paragraph({ children: [new TextRun({ text: BLANCO_REGEL, font: FONT, size: NOTATIE_SIZE })], spacing: { before: 40 } })],
    }));
    children.push(await diagramTabel(legeCellen));
  }

  if (mode === "beide") children.push(new Paragraph({ children: [], pageBreakBefore: true }));

  if (mode === "antwoord" || mode === "beide") {
    children.push(...koptekst(partij), ...rooster());
    const ingevuldeCellen = zetIndices.map((ply, i) => {
      const knoop = hoofdlijn[ply];
      const onderschriftParagrafen = [
        new Paragraph({
          children: [new TextRun({ text: `${plyMoveNumber(turn, ply)}. ${notatieKortMetVoorloopnul(knoop.zet)}`, bold: true, font: FONT, size: NOTATIE_SIZE })],
          spacing: { before: 40 },
        }),
      ];
      if (knoop.commentaar) {
        onderschriftParagrafen.push(new Paragraph({ children: [new TextRun({ text: knoop.commentaar, italics: true, font: FONT, size: NOTATIE_SIZE })] }));
      }
      return { board: standen[ply + 1], nummer: i + 1, onderschriftParagrafen };
    });
    children.push(await diagramTabel(ingevuldeCellen));
  }

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
