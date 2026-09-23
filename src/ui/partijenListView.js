import { listPartijen } from "../db/partijen.js?v=20260923m";
import { naamWeergave } from "../core/namen.js?v=20260923m";

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

// Fase 2, stap 3 (uitbreiding): overzicht van de opgeslagen partijen, met zoeken op speler/
// toernooi/jaar (gewoon client-side filteren — dezelfde opzet als stencilsListView.js, maar dan
// met een zoekveld, want een lijst partijen wordt sneller lang dan een lijst opgavebladen).
export async function renderPartijenListView(container, { onOpenPartij, onNieuwePartij } = {}) {
  container.innerHTML = `
    <h2>Partijen</h2>
    <div class="card">
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="new">Nieuwe partij</button>
      </div>
      <input type="text" data-role="zoek" placeholder="Zoeken op speler, toernooi of jaar" style="margin-top:0.75rem;" />
      <div data-role="list" style="margin-top:1rem;"></div>
      <div data-role="empty" style="display:none;color:#666;padding:1rem;text-align:center;"></div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  el('[data-action="new"]').addEventListener("click", () => onNieuwePartij?.());

  const partijen = await listPartijen();
  const list = el('[data-role="list"]');
  const emptyMsg = el('[data-role="empty"]');

  function toon(zoekterm) {
    const q = zoekterm.trim().toLowerCase();
    const gefilterd = q
      ? partijen.filter((p) =>
          `${p.witVoornaam} ${p.witAchternaam} ${p.zwartVoornaam} ${p.zwartAchternaam} ${p.toernooi} ${p.datum}`.toLowerCase().includes(q)
        )
      : partijen;

    list.innerHTML = "";
    emptyMsg.style.display = gefilterd.length ? "none" : "block";
    emptyMsg.textContent = partijen.length === 0 ? 'Nog geen partijen. Voeg er een toe via "Nieuwe partij".' : "Niets gevonden.";

    for (const partij of gefilterd) {
      const row = document.createElement("div");
      row.className = "card";
      row.style.cssText = "margin-bottom:0.5rem;cursor:pointer;";
      row.innerHTML = `
        <strong>${escapeHtml(titel(partij))}</strong>
        <span style="color:#666;font-size:0.85rem;"> — ${escapeHtml(subtekst(partij))}</span>
      `;
      row.addEventListener("click", () => onOpenPartij?.(partij.id));
      list.appendChild(row);
    }
  }

  toon("");
  el('[data-role="zoek"]').addEventListener("input", (e) => toon(e.target.value));
}
