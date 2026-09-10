import * as docxLib from "../../lib/docx.mjs";
import { renderDiagramSVG } from "../diagram/render.js";
import { parseFen } from "../core/fen.js";
import { getGridLayout } from "../stencil/layout.js";
import { svgToPngBytes } from "./rasterize.js";

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
  HeightRule,
  BorderStyle,
  AlignmentType,
  convertMillimetersToTwip,
} = docxLib;

const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = 14;
const HEADER_RESERVED_MM = 26;
const PRINT_DPI = 300;
const DISPLAY_DPI = 96;

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

function pageSection(children) {
  return {
    properties: {
      page: {
        size: { width: mmToTwip(PAGE_MM.width), height: mmToTwip(PAGE_MM.height) },
        margin: {
          top: mmToTwip(MARGIN_MM),
          bottom: mmToTwip(MARGIN_MM),
          left: mmToTwip(MARGIN_MM),
          right: mmToTwip(MARGIN_MM),
        },
      },
    },
    children,
  };
}

function headerParagraphs(stencil, subtitel) {
  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: stencil.titel, bold: true, size: 32 }),
        subtitel ? new TextRun({ text: ` — ${subtitel}`, bold: true, size: 32 }) : new TextRun({ text: "" }),
      ],
    }),
  ];
  const clubDatum = [stencil.club, stencil.datum].filter(Boolean).join(" · ");
  if (clubDatum) {
    paragraphs.push(
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: clubDatum, size: 20, color: "444444" })] })
    );
  }
  if (!subtitel) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120 },
        children: [new TextRun({ text: stencil.opdrachtregel, italics: true, size: 22 })],
      })
    );
  }
  paragraphs.push(new Paragraph({ text: "" }));
  return paragraphs;
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

async function buildOpgavenTable(stencil, items) {
  const { cols, rows } = getGridLayout(items.length);
  const usableWidthMm = PAGE_MM.width - 2 * MARGIN_MM;
  const usableHeightMm = PAGE_MM.height - 2 * MARGIN_MM - HEADER_RESERVED_MM;
  const cellWMm = usableWidthMm / cols;
  const cellHMm = usableHeightMm / rows;
  const imageSizeMm = Math.max(10, Math.min(cellWMm, cellHMm) - 8);
  const imagePxDisplay = mmToPx(imageSizeMm, DISPLAY_DPI);
  const colWidthTwip = mmToTwip(cellWMm);
  const rowHeightTwip = mmToTwip(cellHMm);

  const cells = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tekst = item.opdracht || item.stand?.opdracht || "";
    const children = [
      new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true, size: 18 }),
          new TextRun({ text: tekst, size: 18 }),
        ],
      }),
    ];
    if (item.stand) {
      children.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [await buildImageRun(item.stand.fen, imagePxDisplay)] })
      );
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: "(stand ontbreekt)", color: "AA0000", size: 18 })] }));
    }
    cells.push(
      new TableCell({
        width: { size: colWidthTwip, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children,
      })
    );
  }
  while (cells.length % cols !== 0) {
    cells.push(new TableCell({ width: { size: colWidthTwip, type: WidthType.DXA }, children: [new Paragraph({ text: "" })] }));
  }

  const tableRows = [];
  for (let r = 0; r < cells.length / cols; r++) {
    tableRows.push(
      new TableRow({
        height: { value: rowHeightTwip, rule: HeightRule.ATLEAST },
        children: cells.slice(r * cols, (r + 1) * cols),
      })
    );
  }

  return new Table({
    width: { size: mmToTwip(usableWidthMm), type: WidthType.DXA },
    columnWidths: new Array(cols).fill(colWidthTwip),
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
    const oplossing = item.stand.oplossing || "geen oplossing ingevoerd";
    paragraphs.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true }),
          new TextRun({ text: oplossing, color: item.stand.oplossing ? "000000" : "AA0000" }),
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
    const table = await buildOpgavenTable(stencil, items);
    sections.push(pageSection([...headerParagraphs(stencil), table]));
  }
  if (mode === "oplossingen" || mode === "beide") {
    sections.push(pageSection([...headerParagraphs(stencil, "Oplossingen"), ...oplossingenParagraphs(items)]));
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
