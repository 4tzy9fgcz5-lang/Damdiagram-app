import * as docxLib from "../../lib/docx.mjs?v=20260921e";
import { renderDiagramSVG } from "../diagram/render.js?v=20260921e";
import { parseFen } from "../core/fen.js?v=20260921e";
import { getGridLayout, paginateItems } from "../stencil/layout.js?v=20260921e";
import { opdrachtregelMetOndertitel } from "../stencil/compose.js?v=20260921e";
import { svgToPngBytes } from "./rasterize.js?v=20260921e";
import { resolveOplossingTekst } from "../db/standen.js?v=20260921e";

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  Header,
  WidthType,
  HeightRule,
  BorderStyle,
  AlignmentType,
  LineRuleType,
  TableLayoutType,
  convertMillimetersToTwip,
} = docxLib;

const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = 14;
// Titel en opdrachtregel staan in de Word-koptekst (herhaalt zich, en telt niet mee
// als gewone tekst in het lichaam van het document). Deze 3 maten samen bepalen de
// bovenmarge van de pagina: afstand-tot-koptekst + ruimte-voor-koptekst + luchtje.
const HEADER_DISTANCE_MM = 8;
const HEADER_HEIGHT_MM = 13;
const HEADER_GAP_MM = 2;
const TOP_MARGIN_MM = HEADER_DISTANCE_MM + HEADER_HEIGHT_MM + HEADER_GAP_MM;
const CELL_TEXT_RESERVED_MM = 5; // ruimte voor een eventuele losse opdrachtregel onder de afbeelding
// Dit is de daadwerkelijke celmarge rond elk diagram (zowel in de breedte- als de
// hoogteberekening) — de twee moeten gelijk zijn, anders reserveert de hoogte-
// berekening ruimte die nergens fysiek wordt toegepast, en dat gaf onzichtbare
// "dode" witruimte onder elk diagram.
const CELL_PADDING_MM = 1.5;
const PRINT_DPI = 300;
const DISPLAY_DPI = 96;

// Zonder expliciete regelafstand valt Word terug op zijn eigen standaard (ca. 1,15
// regelafstand + ruimte ná elke alinea) — dat was de bron van de te grote
// "regelafstand" die Jan zag tussen de opgaven. Alle alinea's in de tabel krijgen
// daarom expliciet enkele regelafstand en geen automatische ruimte erna.
function tightSpacing(overrides = {}) {
  return { after: 0, before: 0, line: 240, lineRule: LineRuleType.AUTO, ...overrides };
}

function mmToTwip(mm) {
  return convertMillimetersToTwip(mm);
}

function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLE_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

function pageSection(children, headerNode) {
  return {
    properties: {
      page: {
        size: { width: mmToTwip(PAGE_MM.width), height: mmToTwip(PAGE_MM.height) },
        margin: {
          top: mmToTwip(TOP_MARGIN_MM),
          bottom: mmToTwip(MARGIN_MM),
          left: mmToTwip(MARGIN_MM),
          right: mmToTwip(MARGIN_MM),
          header: mmToTwip(HEADER_DISTANCE_MM),
        },
      },
    },
    headers: { default: headerNode },
    children,
  };
}

function buildHeader(stencil, { titelSuffix = "", toonOpdracht = true } = {}) {
  const titleChildren = [new TextRun({ text: stencil.titel, bold: true, size: 32 })];
  if (titelSuffix) titleChildren.push(new TextRun({ text: titelSuffix, bold: true, size: 32 }));

  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: tightSpacing({ after: toonOpdracht ? 40 : 0 }),
      children: titleChildren,
    }),
  ];
  // Club en datum staan niet op het geprinte stencil (alleen relevant voor eigen
  // administratie in de database) — bespaart ruimte, en de opgaven hoeven dat niet
  // te tonen.
  if (toonOpdracht) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: tightSpacing({ before: 20 }),
        children: [new TextRun({ text: opdrachtregelMetOndertitel(stencil), italics: true, size: 22 })],
      })
    );
  }
  return new Header({ children: paragraphs });
}

async function buildImageRun(fen, imagePxDisplay) {
  const { board } = parseFen(fen);
  const svg = renderDiagramSVG(board, { size: 300 });
  const rasterPx = Math.max(imagePxDisplay, mmToPx((imagePxDisplay / DISPLAY_DPI) * 25.4, PRINT_DPI));
  const bytes = await svgToPngBytes(svg, rasterPx);
  return new ImageRun({
    type: "png",
    data: bytes,
    transformation: { width: imagePxDisplay, height: imagePxDisplay },
  });
}

async function buildOpgavenTable(stencil, items, offset = 0) {
  const { cols } = getGridLayout(items.length);
  const usableWidthMm = PAGE_MM.width - 2 * MARGIN_MM;
  const cellWMm = usableWidthMm / cols;
  const cellPaddingTwip = mmToTwip(CELL_PADDING_MM);
  const cellMargins = { top: cellPaddingTwip, bottom: cellPaddingTwip, left: cellPaddingTwip, right: cellPaddingTwip };
  const NO_MARGIN = { top: 0, bottom: 0, left: 0, right: 0 };

  // Het opgavenummer staat naast het diagram (in een smalle kolom), niet meer op
  // een eigen regel erboven — dat scheelt een hele tekstregel hoogte per rij, en
  // is nodig om alle 12 opgaven op 1 A4'tje te laten passen. De binnentabel krijgt
  // een vaste indeling (layout: FIXED), anders bepaalt Word zelf hoe de ruimte
  // tussen nummer en diagram verdeeld wordt, met te veel lucht tot gevolg.
  const numberColWMm = 5.5;
  const innerWidthMm = cellWMm - 2 * CELL_PADDING_MM;
  const contentColWMm = innerWidthMm - numberColWMm;
  const numberColWidthTwip = mmToTwip(numberColWMm);
  const contentColWidthTwip = mmToTwip(contentColWMm);
  const innerTableWidthTwip = numberColWidthTwip + contentColWidthTwip;

  const imageSizeMm = Math.max(10, contentColWMm);
  const imagePxDisplay = mmToPx(imageSizeMm, DISPLAY_DPI);
  const colWidthTwip = mmToTwip(cellWMm);
  // Voor elke aantal-diagrammen-combinatie in GRID_TABLE (1-12, dus max. 4 rijen bij
  // 3 kolommen) past bovenstaande breedte-gestuurde hoogte ruim binnen de
  // beschikbare paginahoogte; een aparte terugval is dus niet nodig.

  const cells = [];
  const cellHeightsMm = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tekst = item.opdracht || item.stand?.opdracht || "";
    const contentChildren = [];
    if (item.stand) {
      contentChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: tightSpacing({ after: tekst ? 20 : 0 }),
          children: [await buildImageRun(item.stand.fen, imagePxDisplay)],
        })
      );
    } else {
      contentChildren.push(
        new Paragraph({ spacing: tightSpacing(), children: [new TextRun({ text: "(stand ontbreekt)", color: "AA0000", size: 18 })] })
      );
    }
    // De opdrachttekst (indien aanwezig) staat onder het diagram, niet erboven —
    // dat leest natuurlijker en houdt de nummering direct naast de bovenkant van
    // het diagram.
    if (tekst) {
      contentChildren.push(
        new Paragraph({ alignment: AlignmentType.LEFT, spacing: tightSpacing(), children: [new TextRun({ text: tekst, size: 18 })] })
      );
    }

    const innerTable = new Table({
      width: { size: innerTableWidthTwip, type: WidthType.DXA },
      columnWidths: [numberColWidthTwip, contentColWidthTwip],
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: numberColWidthTwip, type: WidthType.DXA },
              margins: NO_MARGIN,
              children: [
                new Paragraph({ spacing: tightSpacing(), children: [new TextRun({ text: `${offset + i + 1}.`, bold: true, size: 18 })] }),
              ],
            }),
            new TableCell({
              width: { size: contentColWidthTwip, type: WidthType.DXA },
              margins: NO_MARGIN,
              children: contentChildren,
            }),
          ],
        }),
      ],
    });

    cells.push(
      new TableCell({
        width: { size: colWidthTwip, type: WidthType.DXA },
        margins: cellMargins,
        // Een cel moet in het onderliggende bestandsformaat altijd eindigen met een
        // "gewone" alinea, niet met een tabel — de docx-bibliotheek voegt er anders
        // zelf één toe, met de standaard regelafstand van Word (dat was precies de
        // extra witruimte tussen de diagrammen). Door hem hier zelf, zonder
        // regelafstand en met een piepklein lettertype toe te voegen, blijft die
        // ruimte verwaarloosbaar.
        children: [innerTable, new Paragraph({ spacing: tightSpacing(), children: [new TextRun({ text: "", size: 2 })] })],
      })
    );
    // De rijhoogte wordt per rij bepaald door wat de cellen daarin daadwerkelijk
    // nodig hebben — een cel zonder eigen opdrachttekst reserveert dus geen ruimte
    // voor een regel die er toch nooit komt (dat was de belangrijkste bron van de
    // overgebleven witruimte tussen de diagrammen).
    cellHeightsMm.push(imageSizeMm + (tekst ? CELL_TEXT_RESERVED_MM : 0) + 2 * CELL_PADDING_MM);
  }
  while (cells.length % cols !== 0) {
    cells.push(new TableCell({ width: { size: colWidthTwip, type: WidthType.DXA }, children: [new Paragraph({ text: "" })] }));
    cellHeightsMm.push(imageSizeMm + 2 * CELL_PADDING_MM);
  }

  const tableRows = [];
  for (let r = 0; r < cells.length / cols; r++) {
    const rowHeightMm = Math.max(...cellHeightsMm.slice(r * cols, (r + 1) * cols));
    tableRows.push(
      new TableRow({
        height: { value: mmToTwip(rowHeightMm), rule: HeightRule.ATLEAST },
        children: cells.slice(r * cols, (r + 1) * cols),
      })
    );
  }

  return new Table({
    width: { size: mmToTwip(usableWidthMm), type: WidthType.DXA },
    columnWidths: new Array(cols).fill(colWidthTwip),
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: tableRows,
  });
}

function oplossingenParagraphs(items) {
  const paragraphs = [];
  items.forEach((item, i) => {
    if (!item.stand) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: `${i + 1}. `, bold: true }), new TextRun({ text: "stand ontbreekt", color: "AA0000" })] })
      );
      return;
    }
    const oplossingTekst = resolveOplossingTekst(item.stand);
    const oplossing = oplossingTekst || "geen oplossing ingevoerd";
    paragraphs.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true }),
          new TextRun({ text: oplossing, color: oplossingTekst ? "000000" : "AA0000" }),
        ],
      })
    );
    const bron = [item.stand.auteur, item.stand.jaartal, item.stand.publicatie].filter(Boolean).join(", ");
    if (bron) {
      paragraphs.push(
        new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: bron, size: 18, color: "555555" })] })
      );
    }
  });
  return paragraphs;
}

export async function buildStencilDocxBlob(stencil, items, mode = "beide") {
  const sections = [];

  if (mode === "opgaven" || mode === "beide") {
    const paginas = paginateItems(items);
    let offset = 0;
    for (let i = 0; i < paginas.length; i++) {
      const table = await buildOpgavenTable(stencil, paginas[i], offset);
      const titelSuffix = paginas.length > 1 ? ` (blad ${i + 1} van ${paginas.length})` : "";
      sections.push(pageSection([table], buildHeader(stencil, { titelSuffix })));
      offset += paginas[i].length;
    }
  }
  if (mode === "oplossingen" || mode === "beide") {
    sections.push(
      pageSection(oplossingenParagraphs(items), buildHeader(stencil, { titelSuffix: " — Oplossingen", toonOpdracht: false }))
    );
  }

  const doc = new Document({ sections });
  return Packer.toBlob(doc);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
