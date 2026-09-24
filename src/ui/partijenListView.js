import { listPartijen } from "../db/partijen.js?v=20260925a";
import { getAllCategorieen } from "../db/categorieen.js?v=20260925a";
import { naamWeergave } from "../core/namen.js?v=20260925a";
import { buildMeerderePartijenDocxBlob } from "../export/partijDocx.js?v=20260925a";
import { downloadBlob } from "../export/docx.js?v=20260925a";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function titel(partij) {
  const wit = naamWeergave(partij.witVoornaam, partij.witAchternaam);
  const zwart = naamWeergave(partij.zwartVoornaam, partij.zwartAchternaam);
  return [wit, zwart].filter(Boolean).join(" - ") || "(nog geen namen)";
}

function subtekst(partij) {
  return [partij.toernooi, partij.datum].filter(Boolean).join(" — ");
}

// Sentinel voor "geen enkele waarde in deze categorie" — zelfde opzet als databaseView.js.
const GEEN_WAARDE = "__geen__";

// Fase 2, stap 3 (uitbreiding); uitgebreid 2026-09-23/24 (CLAUDE.md-feedback) met filteren per
// categorie en meerdere partijen tegelijk afdrukken: overzicht van de opgeslagen partijen, met
// zoeken op speler/toernooi/jaar, dezelfde filtercategorieën als bij Combinaties, en een
// selectievakje per partij (Jans wens 2026-09-24: "ik wil een optie om meerdere partijen tegelijk
// af te drukken") — gewoon client-side filteren/selecteren, net als hierboven.
export async function renderPartijenListView(container, { onOpenPartij, onNieuwePartij } = {}) {
  container.innerHTML = `
    <h2>Partijen</h2>
    <div class="card">
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="new">Nieuwe partij</button>
      </div>
      <div class="filters" style="margin-top:0.75rem;">
        <input type="text" data-role="zoek" placeholder="Zoeken op speler, toernooi of jaar" />
        <span data-role="categorieSelects" style="display:contents;"></span>
      </div>
      <div data-role="selectionBar" style="display:none;margin-top:0.75rem;align-items:center;gap:0.75rem;">
        <span data-role="selectionCount" style="color:#666;font-size:0.85rem;"></span>
        <button type="button" class="secondary" data-action="download-selectie">Geselecteerde partijen downloaden als Word</button>
      </div>
      <div data-role="list" style="margin-top:1rem;"></div>
      <div data-role="empty" style="display:none;color:#666;padding:1rem;text-align:center;"></div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  el('[data-action="new"]').addEventListener("click", () => onNieuwePartij?.());

  const partijen = await listPartijen();
  const byId = new Map(partijen.map((p) => [p.id, p]));
  const geselecteerd = new Set();
  const list = el('[data-role="list"]');
  const emptyMsg = el('[data-role="empty"]');
  const categorieSelectsHost = el('[data-role="categorieSelects"]');
  const selectionBar = el('[data-role="selectionBar"]');
  const selectionCount = el('[data-role="selectionCount"]');

  const categorieen = await getAllCategorieen();
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

  function matchesCategorieFilters(partij) {
    for (const select of categorieSelectsHost.querySelectorAll("select[data-cat-filter]")) {
      const gekozen = select.value;
      if (!gekozen) continue;
      const waarden = partij.categorieen?.[select.dataset.catFilter] ?? [];
      if (gekozen === GEEN_WAARDE) {
        if (waarden.length > 0) return false;
      } else if (!waarden.includes(gekozen)) {
        return false;
      }
    }
    return true;
  }

  function updateSelectionBar() {
    selectionBar.style.display = geselecteerd.size > 0 ? "flex" : "none";
    selectionCount.textContent = `${geselecteerd.size} geselecteerd`;
  }

  function toon(zoekterm) {
    const q = zoekterm.trim().toLowerCase();
    const gefilterd = partijen.filter((p) => {
      if (!matchesCategorieFilters(p)) return false;
      if (!q) return true;
      return `${p.witVoornaam} ${p.witAchternaam} ${p.zwartVoornaam} ${p.zwartAchternaam} ${p.toernooi} ${p.datum}`
        .toLowerCase()
        .includes(q);
    });

    list.innerHTML = "";
    emptyMsg.style.display = gefilterd.length ? "none" : "block";
    emptyMsg.textContent = partijen.length === 0 ? 'Nog geen partijen. Voeg er een toe via "Nieuwe partij".' : "Niets gevonden.";

    for (const partij of gefilterd) {
      const row = document.createElement("div");
      row.className = "card";
      row.style.cssText = "margin-bottom:0.5rem;cursor:pointer;display:flex;align-items:center;gap:0.6rem;";
      row.innerHTML = `
        <input type="checkbox" data-role="select" ${geselecteerd.has(partij.id) ? "checked" : ""} style="margin:0;flex:0 0 auto;" />
        <span style="flex:1 1 auto;">
          <strong>${escapeHtml(titel(partij))}</strong>
          <span style="color:#666;font-size:0.85rem;"> — ${escapeHtml(subtekst(partij))}</span>
        </span>
      `;
      const checkbox = row.querySelector('[data-role="select"]');
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        if (checkbox.checked) geselecteerd.add(partij.id);
        else geselecteerd.delete(partij.id);
        updateSelectionBar();
      });
      row.addEventListener("click", () => onOpenPartij?.(partij.id));
      list.appendChild(row);
    }
  }

  toon("");
  updateSelectionBar();
  el('[data-role="zoek"]').addEventListener("input", (e) => toon(e.target.value));
  for (const select of categorieSelectsHost.querySelectorAll("select[data-cat-filter]")) {
    select.addEventListener("change", () => toon(el('[data-role="zoek"]').value));
  }

  el('[data-action="download-selectie"]').addEventListener("click", async () => {
    const gekozenPartijen = [...geselecteerd].map((id) => byId.get(id)).filter(Boolean);
    if (gekozenPartijen.length === 0) return;
    const blob = await buildMeerderePartijenDocxBlob(gekozenPartijen);
    downloadBlob(blob, `partijen-${gekozenPartijen.length}x.docx`);
  });
}
