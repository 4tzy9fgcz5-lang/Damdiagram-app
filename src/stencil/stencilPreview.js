import { renderDiagramSVG } from "../diagram/render.js?v=20260921s";
import { parseFen } from "../core/fen.js?v=20260921s";
import { resolveOplossingTekst } from "../db/standen.js?v=20260921s";
import { getGridLayout, paginateItems } from "./layout.js?v=20260921s";
import { opdrachtregelMetOndertitel } from "./compose.js?v=20260921s";

const PAGE_STYLE = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
  .sheet { page-break-after: always; padding-top: 2mm; }
  .sheet:last-child { page-break-after: auto; }
  .sheet-header { text-align: left; margin-bottom: 3mm; }
  .sheet-header h1 { font-size: 16pt; margin: 0 0 1mm; }
  .sheet-header .opdracht { font-size: 11pt; font-style: italic; margin: 1mm 0 0; }
  .grid { display: grid; gap: 2mm; }
  .cell { border: 1px solid #ccc; border-radius: 2mm; padding: 1.5mm; display: flex; flex-direction: row; align-items: flex-start; gap: 1mm; }
  .cell .nr { font-weight: 700; font-size: 9pt; flex-shrink: 0; width: 5.5mm; }
  .cell .cell-content { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
  .cell .cell-text { width: 100%; font-size: 9pt; margin-top: 1mm; text-align: left; }
  .cell svg { width: 100%; height: auto; max-width: 100%; }
  .missing { color: #a30000; font-size: 9pt; }
  .oplossingen-list { font-size: 10.5pt; }
  .oplossingen-list .item { margin-bottom: 3mm; }
  .oplossingen-list .nr { font-weight: 700; margin-right: 2mm; }
  .oplossingen-list .bron { color: #555; font-size: 9pt; }
  .oplossingen-list .ontbreekt { color: #a30000; }
`;

// Club en datum staan niet op het geprinte stencil (alleen relevant voor eigen
// administratie in de database).
function headerHTML(stencil, { titelSuffix = "", toonOpdracht = true } = {}) {
  return `
    <div class="sheet-header">
      <h1>${escapeHtml(stencil.titel)}${titelSuffix}</h1>
      ${toonOpdracht ? `<div class="opdracht">${escapeHtml(opdrachtregelMetOndertitel(stencil))}</div>` : ""}
    </div>
  `;
}

function opgavenPaginaHTML(stencil, pageItems, offset, titelSuffix) {
  const { cols, rows } = getGridLayout(pageItems.length || 1);
  const cells = pageItems
    .map((item, i) => {
      const nr = offset + i + 1;
      if (!item.stand) {
        return `<div class="cell"><span class="nr">${nr}.</span><div class="cell-content missing">stand niet gevonden</div></div>`;
      }
      const { board } = parseFen(item.stand.fen);
      const svg = renderDiagramSVG(board, { size: 260 });
      const tekst = item.opdracht || item.stand.opdracht || "";
      return `<div class="cell">
        <span class="nr">${nr}.</span>
        <div class="cell-content">
          ${svg}
          ${tekst ? `<div class="cell-text">${escapeHtml(tekst)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
  return `<div class="sheet">
    ${headerHTML(stencil, { titelSuffix })}
    <div class="grid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);">
      ${cells}
    </div>
  </div>`;
}

function opgavenSheetHTML(stencil, items) {
  const paginas = paginateItems(items);
  let offset = 0;
  return paginas
    .map((pageItems, i) => {
      const titelSuffix = paginas.length > 1 ? ` (blad ${i + 1} van ${paginas.length})` : "";
      const html = opgavenPaginaHTML(stencil, pageItems, offset, titelSuffix);
      offset += pageItems.length;
      return html;
    })
    .join("");
}

function oplossingenSheetHTML(stencil, items) {
  const rows = items
    .map((item, i) => {
      if (!item.stand) {
        return `<div class="item"><span class="nr">${i + 1}.</span><span class="ontbreekt">stand niet gevonden</span></div>`;
      }
      const bronParts = [item.stand.auteur, item.stand.jaartal, item.stand.publicatie].filter(Boolean);
      const bron = bronParts.length ? `<div class="bron">${escapeHtml(bronParts.join(", "))}</div>` : "";
      const oplossingTekst = resolveOplossingTekst(item.stand);
      const oplossing = oplossingTekst
        ? escapeHtml(oplossingTekst)
        : `<span class="ontbreekt">geen oplossing ingevoerd</span>`;
      return `<div class="item"><span class="nr">${i + 1}.</span>${oplossing}${bron}</div>`;
    })
    .join("");
  return `<div class="sheet">
    ${headerHTML(stencil, { titelSuffix: " — Oplossingen", toonOpdracht: false })}
    <div class="oplossingen-list">${rows}</div>
  </div>`;
}

export function missingOplossingen(items) {
  return items.filter((item) => item.stand && !resolveOplossingTekst(item.stand)).length;
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
