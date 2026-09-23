import * as docxLib from "../../lib/docx.mjs?v=20260923m";
import { createStartBoard, createEmptyBoard } from "../core/board.js?v=20260923m";
import { parseFen } from "../core/fen.js?v=20260923m";
import { applyMove, plyColor, plyMoveNumber, moveToNotation } from "../core/draughtsMoves.js?v=20260923m";
import { hoofdlijnKnopen } from "../core/zettenboom.js?v=20260923m";
import { renderDiagramSVG } from "../diagram/render.js?v=20260923m";
import { svgToPngBytes } from "./rasterize.js?v=20260923m";
import { naamPrint } from "../core/namen.js?v=20260923m";

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, BorderStyle, convertMillimetersToTwip } = docxLib;

function mmToTwip(mm) {
  return convertMillimetersToTwip(mm);
}
function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = 16;
const PRINT_DPI = 300;
const DISPLAY_DPI = 96;
const COLS = 2;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLE_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

// Fase 2, stap 5 (filmmodule, zie CLAUDE.md): van een partij een opdrachtvel (6, of een ander
// aantal, LEGE diagrammen — de speler zoekt zelf de belangrijkste momenten) en/of een antwoordvel
// (diezelfde diagrammen ingevuld met de door de trainer gekozen momenten, met zetnummer en
// eventueel de toelichting/het commentaar bij die zet) maken. Bewust een eigen bestand, net als
// partijDocx.js — dit is weer een ander soort blad dan een gewoon opgaveblad (docx.js) of een
// lopende partij (partijDocx.js): een vaste kop, de VOLLEDIGE notatie in een apart formaat (5
// zetnummers per regel, zoals gevraagd), en dan een raster met een vast aantal diagrammen.
async function buildImageRun(board, imagePxDisplay) {
  const svg = renderDiagramSVG(board, { size: 300 });
  const rasterPx = Math.max(imagePxDisplay, mmToPx((imagePxDisplay / DISPLAY_DPI) * 25.4, PRINT_DPI));
  const bytes = await svgToPngBytes(svg, rasterPx);
  return new ImageRun({ type: "png", data: bytes, transformation: { width: imagePxDisplay, height: imagePxDisplay } });
}

function koptekst(partij) {
  const titel =
    [naamPrint(partij.witVoornaam, partij.witAchternaam), naamPrint(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  const metaRegels = [
    [partij.toernooi, partij.ronde ? `ronde ${partij.ronde}` : ""].filter(Boolean).join(", "),
    [partij.datum, partij.uitslag].filter(Boolean).join(" — "),
  ].filter(Boolean);
  return [
    new Paragraph({ children: [new TextRun({ text: titel, bold: true, size: 32 })], spacing: { after: 100 } }),
    ...metaRegels.map((regel) => new Paragraph({ children: [new TextRun({ text: regel, size: 22, color: "555555" })], spacing: { after: 40 } })),
    new Paragraph({ children: [new TextRun({ text: "Naam: ______________________________", size: 22 })], spacing: { before: 160, after: 200 } }),
  ];
}

// "5 zetnummers per regel (1-5, 6-10, 11-15, ...)": elke regel bevat 5 zetnummer-paren
// ("N. wit zwart"), dus 5 witte en 5 zwarte zetten. Een ontbrekende zwarte zet (partij eindigt
// na een witte zet) blijft leeg i.p.v. weggelaten, zodat de rasterindeling niet verspringt.
function notatieParagrafen(hoofdlijn, beurt0) {
  const paren = [];
  let i = 0;
  if (plyColor(beurt0, 0) === "black") {
    paren.push({ nummer: plyMoveNumber(beurt0, 0), wit: "", zwart: moveToNotation(hoofdlijn[0].zet) });
    i = 1;
  }
  for (; i < hoofdlijn.length; i += 2) {
    paren.push({
      nummer: plyMoveNumber(beurt0, i),
      wit: moveToNotation(hoofdlijn[i].zet),
      zwart: hoofdlijn[i + 1] ? moveToNotation(hoofdlijn[i + 1].zet) : "",
    });
  }

  const paragrafen = [];
  for (let j = 0; j < paren.length; j += 5) {
    const regel = paren
      .slice(j, j + 5)
      .map((p) => `${p.nummer}. ${p.wit}${p.zwart ? " " + p.zwart : ""}`)
      .join("     ");
    paragrafen.push(new Paragraph({ children: [new TextRun({ text: regel, size: 22 })], spacing: { after: 40 } }));
  }
  return paragrafen.length ? paragrafen : [new Paragraph({ children: [new TextRun({ text: "(nog geen zetten)", size: 22 })] })];
}

// Standen bij elke knoop van de hoofdlijn, index 0 = de beginstand (vóór zet 1).
function standenOpHoofdlijn(beginBord, hoofdlijn) {
  const standen = [beginBord];
  for (const knoop of hoofdlijn) standen.push(applyMove(standen[standen.length - 1], knoop.zet));
  return standen;
}

// `cellen`: lijst van `{ board, onderschriftParagrafen }` (dat laatste optioneel, al kant-en-
// klare `Paragraph`-objecten — zo hoeft deze functie zelf niets te weten over wát erin staat).
async function diagramTabel(cellen) {
  const usableWidthMm = PAGE_MM.width - 2 * MARGIN_MM;
  const cellWMm = usableWidthMm / COLS;
  const imagePx = mmToPx(cellWMm - 4, DISPLAY_DPI);
  const rows = [];
  for (let r = 0; r < cellen.length; r += COLS) {
    const rijCellen = await Promise.all(
      cellen.slice(r, r + COLS).map(async ({ board, onderschriftParagrafen = [] }) => {
        const kinderen = [new Paragraph({ children: [await buildImageRun(board, imagePx)] }), ...onderschriftParagrafen];
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
  return new Table({ width: { size: mmToTwip(usableWidthMm), type: WidthType.DXA }, borders: TABLE_BORDERS, rows });
}

function beginstand(partij) {
  return partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
}

// `mode`: "opdracht" (lege diagrammen), "antwoord" (ingevuld) of "beide" (allebei, op aparte
// pagina's — hier volstaat gewoon achter elkaar, dit document heeft geen herhalende koptekst per
// pagina zoals een opgaveblad, dus een simpele pagina-einde is genoeg).
export async function buildFilmDocxBlob(partij, mode = "beide") {
  if (!partij.film?.zetIndices?.length) throw new Error("Kies eerst de filmmomenten voor je een opdracht-/antwoordvel maakt.");
  const { board: beginBord, turn } = beginstand(partij);
  const hoofdlijn = hoofdlijnKnopen(partij.wortel);
  const standen = standenOpHoofdlijn(beginBord, hoofdlijn);
  const zetIndices = [...partij.film.zetIndices].sort((a, b) => a - b);

  const children = [];

  if (mode === "opdracht" || mode === "beide") {
    children.push(...koptekst(partij), ...notatieParagrafen(hoofdlijn, turn));
    const legeCellen = zetIndices.map(() => ({ board: createEmptyBoard() }));
    children.push(await diagramTabel(legeCellen));
  }

  if (mode === "beide") children.push(new Paragraph({ children: [], pageBreakBefore: true }));

  if (mode === "antwoord" || mode === "beide") {
    children.push(...koptekst(partij), ...notatieParagrafen(hoofdlijn, turn));
    const ingevuldeCellen = zetIndices.map((ply) => {
      const knoop = hoofdlijn[ply];
      const onderschriftParagrafen = [
        new Paragraph({
          children: [new TextRun({ text: `${plyMoveNumber(turn, ply)}. ${moveToNotation(knoop.zet)}`, bold: true, size: 20 })],
          spacing: { before: 40 },
        }),
      ];
      if (knoop.commentaar) {
        onderschriftParagrafen.push(new Paragraph({ children: [new TextRun({ text: knoop.commentaar, italics: true, size: 20 })] }));
      }
      return { board: standen[ply + 1], onderschriftParagrafen };
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
