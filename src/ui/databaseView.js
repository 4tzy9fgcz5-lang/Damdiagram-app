import { renderDiagramSVG } from "../diagram/render.js?v=20260916i";
import { parseFen } from "../core/fen.js?v=20260916i";
import { listStanden, resolveOplossingTekst } from "../db/standen.js?v=20260916i";
import { getList } from "../db/lijsten.js?v=20260916i";
import { svgToPngDataUrl } from "../export/rasterize.js?v=20260916i";
import { downloadBlob } from "../export/docx.js?v=20260916i";

// Onthoudt de filterkeuzes zolang de pagina open staat (niet in IndexedDB),
// zodat teruggaan vanaf een standdetailpagina niet alle filters wist.
let savedFilterState = null;
let savedMissingOnly = false;

export async function renderDatabaseView(container, { onOpenStand, onAddSelectionToStencil } = {}) {
  container.innerHTML = `
    <h2>Mijn standen</h2>
    <div data-role="missingWarning" style="display:none;margin-bottom:0.75rem;"></div>
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
        <select data-field="sort">
          <option value="createdAt-desc">Nieuwste eerst</option>
          <option value="createdAt-asc">Oudste eerst</option>
          <option value="jaartal-desc">Jaartal (hoog-laag)</option>
          <option value="jaartal-asc">Jaartal (laag-hoog)</option>
          <option value="auteur-asc">Auteur (A-Z)</option>
        </select>
        <button type="button" class="secondary" data-action="reset-filters">Filters resetten</button>
      </div>
      <div data-role="selectionBar" style="display:none;margin-bottom:0.75rem;">
        <span data-role="selectionCount"></span>
        <button type="button" class="primary" data-action="add-selection">Toevoegen aan stencil</button>
        <button type="button" class="secondary" data-action="share-selection">Stuur naar ander apparaat</button>
        <button type="button" class="secondary" data-action="select-all">Alles selecteren</button>
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
  const missingWarning = el('[data-role="missingWarning"]');

  const selected = new Set();
  let lastRendered = [];
  let missingOnly = savedMissingOnly;

  const [speelsystemen, types] = await Promise.all([getList("speelsysteem"), getList("type")]);
  fillOptions(el('[data-field="speelsysteem"]'), speelsystemen);
  fillOptions(el('[data-field="type"]'), types);

  if (savedFilterState) {
    el('[data-field="search"]').value = savedFilterState.search;
    el('[data-field="speelsysteem"]').value = savedFilterState.speelsysteem;
    el('[data-field="type"]').value = savedFilterState.type;
    el('[data-field="moeilijkheid"]').value = savedFilterState.moeilijkheid;
    el('[data-field="sort"]').value = savedFilterState.sort;
  }

  function fillOptions(select, values) {
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
  }

  function rawFieldValues() {
    return {
      search: el('[data-field="search"]').value,
      speelsysteem: el('[data-field="speelsysteem"]').value,
      type: el('[data-field="type"]').value,
      moeilijkheid: el('[data-field="moeilijkheid"]').value,
      sort: el('[data-field="sort"]').value,
    };
  }

  function currentFilters() {
    const raw = rawFieldValues();
    savedFilterState = raw;
    const [sortBy, sortDir] = raw.sort.split("-");
    return {
      search: raw.search.trim(),
      speelsysteem: raw.speelsysteem || undefined,
      type: raw.type || undefined,
      moeilijkheid: raw.moeilijkheid ? Number.parseInt(raw.moeilijkheid, 10) : undefined,
      metOplossing: missingOnly ? false : undefined,
      sortBy,
      sortDir,
    };
  }

  function updateMissingWarning(missingCount) {
    if (missingOnly) {
      missingWarning.style.display = "block";
      missingWarning.innerHTML = `
        <button type="button" data-action="clear-missing" style="background:#fdeaea;color:var(--kleur-fout);border:1px solid var(--kleur-fout);border-radius:8px;padding:0.5rem 0.9rem;cursor:pointer;">
          Filter actief: alleen standen zonder oplossing. Klik om te wissen.
        </button>
      `;
    } else if (missingCount > 0) {
      missingWarning.style.display = "block";
      missingWarning.innerHTML = `
        <button type="button" data-action="show-missing" style="background:#fdeaea;color:var(--kleur-fout);border:1px solid var(--kleur-fout);border-radius:8px;padding:0.5rem 0.9rem;cursor:pointer;">
          ⚠ ${missingCount} stand(en) zonder oplossing — bekijk ze
        </button>
      `;
    } else {
      missingWarning.style.display = "none";
      missingWarning.innerHTML = "";
    }
  }

  async function refresh() {
    const standen = await listStanden(currentFilters());
    lastRendered = standen;
    const missingCount = missingOnly ? standen.length : (await listStanden({ metOplossing: false })).length;
    updateMissingWarning(missingCount);
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

  const selectAllBtn = el('[data-action="select-all"]');

  function updateSelectionBar() {
    selectionBar.style.display = selected.size > 0 ? "block" : "none";
    selectionCount.textContent = `${selected.size} stand(en) geselecteerd. `;
    const allSelected = lastRendered.length > 0 && lastRendered.every((s) => selected.has(s.id));
    selectAllBtn.textContent = allSelected ? "Alles deselecteren" : "Alles selecteren";
  }

  el('[data-action="add-selection"]').addEventListener("click", () => {
    onAddSelectionToStencil?.([...selected]);
  });

  selectAllBtn.addEventListener("click", async () => {
    const allSelected = lastRendered.length > 0 && lastRendered.every((s) => selected.has(s.id));
    if (allSelected) {
      selected.clear();
    } else {
      for (const stand of lastRendered) selected.add(stand.id);
    }
    await refresh();
    updateSelectionBar();
  });

  el('[data-action="reset-filters"]').addEventListener("click", () => {
    el('[data-field="search"]').value = "";
    el('[data-field="speelsysteem"]').value = "";
    el('[data-field="type"]').value = "";
    el('[data-field="moeilijkheid"]').value = "";
    el('[data-field="sort"]').value = "createdAt-desc";
    missingOnly = false;
    savedMissingOnly = false;
    refresh();
  });

  missingWarning.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (action === "show-missing") {
      missingOnly = true;
      savedMissingOnly = true;
      el('[data-field="search"]').value = "";
      el('[data-field="speelsysteem"]').value = "";
      el('[data-field="type"]').value = "";
      el('[data-field="moeilijkheid"]').value = "";
      el('[data-field="sort"]').value = "createdAt-desc";
      refresh();
    } else if (action === "clear-missing") {
      missingOnly = false;
      savedMissingOnly = false;
      refresh();
    }
  });

  el('[data-action="share-selection"]').addEventListener("click", async () => {
    const { buildShareData } = await import("../db/backup.js?v=20260916i");
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
