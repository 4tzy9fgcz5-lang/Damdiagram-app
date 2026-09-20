import { renderDiagramSVG } from "../diagram/render.js?v=20260921e";
import { parseFen } from "../core/fen.js?v=20260921e";
import { listStanden, resolveOplossingTekst, bulkAddCategorieWaarde } from "../db/standen.js?v=20260921e";
import { getAllCategorieen } from "../db/categorieen.js?v=20260921e";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Sentinel-waarde voor "geen enkele waarde in deze categorie" in een
// categorie-filter-select — analoog aan "Niet gedefinieerd" bij
// moeilijkheidsgraad, maar generiek voor elke (ook zelf toegevoegde)
// categorie uit Instellingen -> Database.
const GEEN_WAARDE = "__geen__";

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
        <span data-role="categorieSelects" style="display:contents;"></span>
        <select data-field="moeilijkheid">
          <option value="">Alle moeilijkheid</option>
          <option value="1">★</option><option value="2">★★</option><option value="3">★★★</option>
          <option value="4">★★★★</option><option value="5">★★★★★</option>
          <option value="ongedefinieerd">Niet gedefinieerd</option>
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
      <div data-role="totals" style="color:#666;font-size:0.85rem;margin-bottom:0.5rem;"></div>
      <div data-role="selectionBar" style="display:none;margin-bottom:0.75rem;">
        <span data-role="selectionCount"></span>
        <button type="button" class="primary" data-action="add-selection">Toevoegen aan opgaveblad</button>
        <button type="button" class="secondary" data-action="bulk-assign">Kenmerken toevoegen</button>
        <button type="button" class="secondary" data-action="share-selection">Stuur naar ander apparaat</button>
        <button type="button" class="secondary" data-action="select-all">Alles selecteren</button>
      </div>
      <div data-role="bulkAssignPanel" style="display:none;margin-bottom:0.75rem;"></div>
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
  const totalsHost = el('[data-role="totals"]');
  const selectionBar = el('[data-role="selectionBar"]');
  const selectionCount = el('[data-role="selectionCount"]');
  const missingWarning = el('[data-role="missingWarning"]');
  const categorieSelectsHost = el('[data-role="categorieSelects"]');
  const bulkAssignPanel = el('[data-role="bulkAssignPanel"]');

  const selected = new Set();
  let lastRendered = [];
  let missingOnly = savedMissingOnly;
  let categorieen = [];

  async function renderCategorieSelects() {
    categorieen = await getAllCategorieen();
    categorieSelectsHost.innerHTML = categorieen
      .map(
        (cat) => `
        <select data-cat-filter="${cat.key}">
          <option value="">Alle ${escapeHtml(cat.label)}</option>
          ${cat.waarden.map((w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join("")}
          <option value="${GEEN_WAARDE}">Geen ${escapeHtml(cat.label)}</option>
        </select>`
      )
      .join("");
  }
  await renderCategorieSelects();

  if (savedFilterState) {
    el('[data-field="search"]').value = savedFilterState.search;
    el('[data-field="moeilijkheid"]').value = savedFilterState.moeilijkheid;
    el('[data-field="sort"]').value = savedFilterState.sort;
    for (const select of categorieSelectsHost.querySelectorAll("select[data-cat-filter]")) {
      const saved = savedFilterState.categorieRaw?.[select.dataset.catFilter];
      if (saved != null) select.value = saved;
    }
  }

  function resetCategorieSelects() {
    for (const select of categorieSelectsHost.querySelectorAll("select[data-cat-filter]")) select.value = "";
  }

  function rawFieldValues() {
    const categorieRaw = {};
    for (const select of categorieSelectsHost.querySelectorAll("select[data-cat-filter]")) {
      categorieRaw[select.dataset.catFilter] = select.value;
    }
    return {
      search: el('[data-field="search"]').value,
      categorieRaw,
      moeilijkheid: el('[data-field="moeilijkheid"]').value,
      sort: el('[data-field="sort"]').value,
    };
  }

  function currentFilters() {
    const raw = rawFieldValues();
    savedFilterState = raw;
    const [sortBy, sortDir] = raw.sort.split("-");
    const categorieFilters = {};
    for (const [key, value] of Object.entries(raw.categorieRaw)) {
      if (!value) continue;
      categorieFilters[key] = value === GEEN_WAARDE ? { ongedefinieerd: true } : { waarde: value };
    }
    return {
      search: raw.search.trim(),
      categorieen: categorieFilters,
      moeilijkheid:
        raw.moeilijkheid && raw.moeilijkheid !== "ongedefinieerd" ? Number.parseInt(raw.moeilijkheid, 10) : undefined,
      moeilijkheidOngedefinieerd: raw.moeilijkheid === "ongedefinieerd" ? true : undefined,
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
    const filters = currentFilters();
    const [standen, totaalAantal] = await Promise.all([listStanden(filters), listStanden().then((a) => a.length)]);
    lastRendered = standen;
    totalsHost.textContent =
      standen.length === totaalAantal
        ? `${totaalAantal} stand(en) in totaal.`
        : `${standen.length} van ${totaalAantal} stand(en) getoond.`;
    const missingCount = missingOnly ? standen.length : (await listStanden({ metOplossing: false })).length;
    updateMissingWarning(missingCount);
    grid.innerHTML = "";
    emptyMsg.style.display = standen.length ? "none" : "block";

    for (const stand of standen) {
      const card = document.createElement("div");
      card.className = "stand-card";
      const { board } = parseFen(stand.fen);
      const svg = renderDiagramSVG(board, { size: 140 });
      card.innerHTML = `
        <label style="float:left;" data-role="selectLabel">
          <input type="checkbox" data-role="select" ${selected.has(stand.id) ? "checked" : ""} />
        </label>
        ${svg}
        <div class="meta">
          ${resolveOplossingTekst(stand) ? "" : '<span style="color:#a30000;">geen oplossing</span>'}
        </div>
      `;
      card.querySelector('[data-role="selectLabel"]').addEventListener("click", (e) => e.stopPropagation());
      card.querySelector('[data-role="select"]').addEventListener("change", (e) => {
        if (e.target.checked) selected.add(stand.id);
        else selected.delete(stand.id);
        updateSelectionBar();
      });
      card.addEventListener("click", () => onOpenStand?.(stand.id, lastRendered.map((s) => s.id)));
      grid.appendChild(card);
    }
  }

  const selectAllBtn = el('[data-action="select-all"]');

  function updateSelectionBar() {
    selectionBar.style.display = selected.size > 0 ? "block" : "none";
    selectionCount.textContent = `${selected.size} stand(en) geselecteerd. `;
    const allSelected = lastRendered.length > 0 && lastRendered.every((s) => selected.has(s.id));
    selectAllBtn.textContent = allSelected ? "Alles deselecteren" : "Alles selecteren";
    if (selected.size === 0) closeBulkAssignPanel();
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
    resetCategorieSelects();
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
      resetCategorieSelects();
      el('[data-field="moeilijkheid"]').value = "";
      el('[data-field="sort"]').value = "createdAt-desc";
      refresh();
    } else if (action === "clear-missing") {
      missingOnly = false;
      savedMissingOnly = false;
      refresh();
    }
  });

  // Kenmerken massaal toevoegen aan de geselecteerde standen — de gekozen
  // waarde(n) komen erbij op elke geselecteerde stand, bestaande kenmerken op
  // die standen blijven gewoon staan (nooit vervangen).
  function closeBulkAssignPanel() {
    bulkAssignPanel.style.display = "none";
    bulkAssignPanel.innerHTML = "";
  }

  el('[data-action="bulk-assign"]').addEventListener("click", () => {
    const gekozen = new Map();
    bulkAssignPanel.style.display = "block";
    bulkAssignPanel.innerHTML = `
      <div class="warnings" style="background:#e7f0fb;color:#1c3d6b;border-color:#a9c3e8;">
        <p style="margin:0 0 0.6rem;">Kies welke kenmerken je wilt toevoegen aan de ${selected.size} geselecteerde stand(en). Ze komen erbij; bestaande kenmerken op die standen blijven staan.</p>
        ${
          categorieen.length
            ? categorieen
                .map(
                  (cat) => `
              <div style="margin-bottom:0.5rem;">
                <label>${escapeHtml(cat.label)}</label>
                <div class="tag-list" data-cat-tags="${cat.key}">
                  ${cat.waarden.map((w) => `<button type="button" class="tag" data-waarde="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join("")}
                </div>
              </div>`
                )
                .join("")
            : '<p style="color:#666;">Nog geen filtercategorieën ingesteld (zie Instellingen -> Database).</p>'
        }
        <div class="button-row">
          <button type="button" class="primary" data-action="bulk-apply">Toepassen</button>
          <button type="button" class="secondary" data-action="bulk-cancel">Sluiten</button>
        </div>
      </div>
    `;
    for (const btn of bulkAssignPanel.querySelectorAll("[data-waarde]")) {
      const key = btn.closest("[data-cat-tags]").dataset.catTags;
      btn.addEventListener("click", () => {
        btn.classList.toggle("selected");
        const set = gekozen.get(key) ?? new Set();
        if (set.has(btn.dataset.waarde)) set.delete(btn.dataset.waarde);
        else set.add(btn.dataset.waarde);
        gekozen.set(key, set);
      });
    }
    bulkAssignPanel.querySelector('[data-action="bulk-cancel"]').addEventListener("click", closeBulkAssignPanel);
    bulkAssignPanel.querySelector('[data-action="bulk-apply"]').addEventListener("click", async (e) => {
      e.target.disabled = true;
      for (const [key, waardenSet] of gekozen) {
        for (const waarde of waardenSet) {
          await bulkAddCategorieWaarde([...selected], key, waarde);
        }
      }
      closeBulkAssignPanel();
      await refresh();
      updateSelectionBar();
    });
  });

  el('[data-action="share-selection"]').addEventListener("click", async () => {
    const { buildShareData } = await import("../db/backup.js?v=20260921e");
    const { encodeShareData } = await import("../db/shareLink.js?v=20260921e");
    const data = await buildShareData([...selected]);
    const encoded = await encodeShareData(data);
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
