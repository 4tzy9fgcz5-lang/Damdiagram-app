import { renderDiagramSVG } from "../diagram/render.js?v=20260915m";
import { parseFen } from "../core/fen.js?v=20260915m";
import { listStanden, resolveOplossingTekst } from "../db/standen.js?v=20260915m";
import { getList } from "../db/lijsten.js?v=20260915m";
import { svgToPngDataUrl } from "../export/rasterize.js?v=20260915m";
import { downloadBlob } from "../export/docx.js?v=20260915m";

export async function renderDatabaseView(container, { onOpenStand, onAddSelectionToStencil } = {}) {
  container.innerHTML = `
    <h2>Mijn standen</h2>
    <div class="card">
      <div class="filters">
        <input type="text" data-field="search" placeholder="Zoeken op auteur, publicatie, notities..." />
        <select data-field="speelsysteem"><option value="">Alle speelsystemen</option></select>
        <select data-field="type"><option value="">Alle types</option></select>
        <select data-field="moeilijkheid">
          <option value="">Alle moeilijkheid</option>
          <option value="1">★</option><option value="2">★★</option><option value="3">★★★</option>
          <option value="4">★★★★</option><option value="5">★★★★★</option>
        </select>
        <select data-field="oplossing">
          <option value="">Met en zonder oplossing</option>
          <option value="met">Met oplossing</option>
          <option value="zonder">Zonder oplossing</option>
        </select>
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="checkbox" data-field="ongebruikt" /> Nog nooit gebruikt
        </label>
        <select data-field="sort">
          <option value="createdAt-desc">Nieuwste eerst</option>
          <option value="createdAt-asc">Oudste eerst</option>
          <option value="jaartal-desc">Jaartal (hoog-laag)</option>
          <option value="jaartal-asc">Jaartal (laag-hoog)</option>
          <option value="auteur-asc">Auteur (A-Z)</option>
        </select>
      </div>
      <div data-role="selectionBar" style="display:none;margin-bottom:0.75rem;">
        <span data-role="selectionCount"></span>
        <button type="button" class="primary" data-action="add-selection">Toevoegen aan stencil</button>
        <button type="button" class="secondary" data-action="share-selection">Stuur naar ander apparaat</button>
      </div>
      <div data-role="shareLink" style="display:none;margin-bottom:0.75rem;"></div>
      <div data-role="grid" class="stand-grid"></div>
      <div data-role="empty" style="display:none;color:#666;padding:1rem;text-align:center;">
        Nog geen standen gevonden.
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const grid = el('[data-role="grid"]');
  const emptyMsg = el('[data-role="empty"]');
  const selectionBar = el('[data-role="selectionBar"]');
  const selectionCount = el('[data-role="selectionCount"]');

  const selected = new Set();

  const [speelsystemen, types] = await Promise.all([getList("speelsysteem"), getList("type")]);
  fillOptions(el('[data-field="speelsysteem"]'), speelsystemen);
  fillOptions(el('[data-field="type"]'), types);

  function fillOptions(select, values) {
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
  }

  function currentFilters() {
    const [sortBy, sortDir] = el('[data-field="sort"]').value.split("-");
    const oplossing = el('[data-field="oplossing"]').value;
    return {
      search: el('[data-field="search"]').value.trim(),
      speelsysteem: el('[data-field="speelsysteem"]').value || undefined,
      type: el('[data-field="type"]').value || undefined,
      moeilijkheid: el('[data-field="moeilijkheid"]').value
        ? Number.parseInt(el('[data-field="moeilijkheid"]').value, 10)
        : undefined,
      metOplossing: oplossing === "met" ? true : oplossing === "zonder" ? false : undefined,
      ongebruikt: el('[data-field="ongebruikt"]').checked || undefined,
      sortBy,
      sortDir,
    };
  }

  async function refresh() {
    const standen = await listStanden(currentFilters());
    grid.innerHTML = "";
    emptyMsg.style.display = standen.length ? "none" : "block";

    for (const stand of standen) {
      const card = document.createElement("div");
      card.className = "stand-card";
      const { board } = parseFen(stand.fen);
      const svg = renderDiagramSVG(board, { size: 140 });
      const tags = [...stand.speelsystemen, ...stand.types].join(", ");
      card.innerHTML = `
        <label style="float:left;" data-role="selectLabel">
          <input type="checkbox" data-role="select" ${selected.has(stand.id) ? "checked" : ""} />
        </label>
        ${svg}
        <div class="meta">
          ${stand.jaartal ? `${stand.jaartal}<br>` : ""}
          ${tags ? escapeHtml(tags) : ""}
          ${resolveOplossingTekst(stand) ? "" : '<br><span style="color:#a30000;">geen oplossing</span>'}
        </div>
        <div class="button-row" style="justify-content:center;">
          <button type="button" class="secondary" data-role="png">PNG</button>
        </div>
      `;
      card.querySelector('[data-role="selectLabel"]').addEventListener("click", (e) => e.stopPropagation());
      card.querySelector('[data-role="select"]').addEventListener("change", (e) => {
        if (e.target.checked) selected.add(stand.id);
        else selected.delete(stand.id);
        updateSelectionBar();
      });
      card.querySelector('[data-role="png"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        const { blob } = await svgToPngDataUrl(svg, 900);
        downloadBlob(blob, `damstand-${stand.id.slice(0, 8)}.png`);
      });
      card.addEventListener("click", () => onOpenStand?.(stand.id));
      grid.appendChild(card);
    }
  }

  function updateSelectionBar() {
    selectionBar.style.display = selected.size > 0 ? "block" : "none";
    selectionCount.textContent = `${selected.size} stand(en) geselecteerd. `;
  }

  el('[data-action="add-selection"]').addEventListener("click", () => {
    onAddSelectionToStencil?.([...selected]);
  });

  el('[data-action="share-selection"]').addEventListener("click", async () => {
    const { buildShareData } = await import("../db/backup.js");
    const data = await buildShareData([...selected]);
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const url = `${location.origin}${location.pathname}#/import/${encoded}`;
    const shareHost = el('[data-role="shareLink"]');
    shareHost.style.display = "block";
    shareHost.innerHTML = `
      <div class="warnings" style="background:#e7f3ec;color:#1a5c38;border-color:#9cc9ae;">
        Link met ${data.standen.length} stand(en) (stuur via WhatsApp of mail, open 'm op het andere apparaat):<br>
        <input type="text" readonly value="${url.replace(/"/g, "&quot;")}" style="margin-top:0.4rem;" onclick="this.select()" />
      </div>
    `;
  });

  for (const input of container.querySelectorAll(".filters input, .filters select")) {
    input.addEventListener("input", refresh);
    input.addEventListener("change", refresh);
  }

  await refresh();
  return { refresh };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
