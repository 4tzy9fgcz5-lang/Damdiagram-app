import { renderDiagramSVG } from "../diagram/render.js";
import { parseFen } from "../core/fen.js";
import { getGridLayout } from "./layout.js";
import { effectiveOpdracht } from "./compose.js";

const PAGE_STYLE = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
  .sheet { page-break-after: always; padding-top: 2mm; }
  .sheet:last-child { page-break-after: auto; }
  .sheet-header { text-align: center; margin-bottom: 6mm; }
  .sheet-header h1 { font-size: 16pt; margin: 0 0 1mm; }
  .sheet-header .club { font-size: 10pt; color: #444; margin: 0 0 1mm; }
  .sheet-header .opdracht { font-size: 11pt; font-style: italic; margin: 2mm 0 0; }
  .grid { display: grid; gap: 4mm; }
  .cell { border: 1px solid #ccc; border-radius: 2mm; padding: 2mm; display: flex; flex-direction: column; align-items: center; }
  .cell .cell-head { width: 100%; font-size: 9pt; margin-bottom: 1mm; }
  .cell .cell-head .nr { font-weight: 700; margin-right: 1mm; }
  .cell svg { width: 100%; height: auto; max-width: 100%; }
  .missing { color: #a30000; font-size: 9pt; }
  .oplossingen-list { font-size: 10.5pt; }
  .oplossingen-list .item { margin-bottom: 3mm; }
  .oplossingen-list .nr { font-weight: 700; margin-right: 2mm; }
  .oplossingen-list .bron { color: #555; font-size: 9pt; }
  .oplossingen-list .ontbreekt { color: #a30000; }
`;

function headerHTML(stencil, subtitel) {
  return `
    <div class="sheet-header">
      <h1>${escapeHtml(stencil.titel)}${subtitel ? " — " + escapeHtml(subtitel) : ""}</h1>
      <div class="club">${escapeHtml(stencil.club)}${stencil.club && stencil.datum ? " · " : ""}${escapeHtml(
    stencil.datum
  )}</div>
      ${subtitel ? "" : `<div class="opdracht">${escapeHtml(stencil.opdrachtregel)}</div>`}
    </div>
  `;
}

function opgavenSheetHTML(stencil, items) {
  const { cols, rows } = getGridLayout(items.length || 1);
  const cells = items
    .map((item, i) => {
      if (!item.stand) {
        return `<div class="cell"><div class="cell-head"><span class="nr">${i + 1}.</span></div><div class="missing">stand niet gevonden</div></div>`;
      }
      const { board } = parseFen(item.stand.fen);
      const svg = renderDiagramSVG(board, { size: 260 });
      const tekst = item.opdracht || item.stand.opdracht || "";
      return `<div class="cell">
        <div class="cell-head"><span class="nr">${i + 1}.</span>${escapeHtml(tekst)}</div>
        ${svg}
      </div>`;
    })
    .join("");
  return `<div class="sheet">
    ${headerHTML(stencil)}
    <div class="grid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);">
      ${cells}
    </div>
  </div>`;
}

function oplossingenSheetHTML(stencil, items) {
  const rows = items
    .map((item, i) => {
      if (!item.stand) {
        return `<div class="item"><span class="nr">${i + 1}.</span><span class="ontbreekt">stand niet gevonden</span></div>`;
      }
      const bronParts = [item.stand.auteur, item.stand.jaartal, item.stand.publicatie].filter(Boolean);
      const bron = bronParts.length ? `<div class="bron">${escapeHtml(bronParts.join(", "))}</div>` : "";
      const oplossing = item.stand.oplossing
        ? escapeHtml(item.stand.oplossing)
        : `<span class="ontbreekt">geen oplossing ingevoerd</span>`;
      return `<div class="item"><span class="nr">${i + 1}.</span>${oplossing}${bron}</div>`;
    })
    .join("");
  return `<div class="sheet">
    ${headerHTML(stencil, "Oplossingen")}
    <div class="oplossingen-list">${rows}</div>
  </div>`;
}

export function missingOplossingen(items) {
  return items.filter((item) => item.stand && !item.stand.oplossing).length;
}

export function buildStencilPagesHTML(stencil, items, mode = "beide") {
  let body = "";
  if (mode === "opgaven" || mode === "beide") body += opgavenSheetHTML(stencil, items);
  if (mode === "oplossingen" || mode === "beide") body += oplossingenSheetHTML(stencil, items);

  return `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>${escapeHtml(stencil.titel)}</title><style>${PAGE_STYLE}</style></head>
<body>${body}</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
