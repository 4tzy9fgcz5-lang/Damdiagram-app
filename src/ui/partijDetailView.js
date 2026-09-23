import { createStartBoard } from "../core/board.js?v=20260923p";
import { parseFen } from "../core/fen.js?v=20260923p";
import { naamWeergave } from "../core/namen.js?v=20260923p";
import { getPartij, deletePartij } from "../db/partijen.js?v=20260923p";
import { getAllCategorieen } from "../db/categorieen.js?v=20260923p";
import { createZettenboomPlayer } from "./zettenboomPlayer.js?v=20260923p";
import { buildPartijDocxBlob } from "../export/partijDocx.js?v=20260923p";
import { downloadBlob } from "../export/docx.js?v=20260923p";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fase 2, stap 3 (uitbreiding): een partij bekijken, alleen-lezen (net als standDetailView.js
// voor een gewone stand) — de boom-viewer uit fase 1 met de partijgegevens eronder.
export async function renderPartijDetailView(container, { partijId, onEdit, onDeleted, onBack, onFilm, onAnnoteren } = {}) {
  const partij = await getPartij(partijId);
  if (!partij) {
    container.innerHTML = `<p>Deze partij bestaat niet (meer).</p>`;
    return;
  }

  const wit = naamWeergave(partij.witVoornaam, partij.witAchternaam);
  const zwart = naamWeergave(partij.zwartVoornaam, partij.zwartAchternaam);
  const titel = [wit, zwart].filter(Boolean).join(" - ") || "(nog geen namen)";
  const categorieRows = [];
  for (const cat of await getAllCategorieen()) {
    const waarden = partij.categorieen?.[cat.key] ?? [];
    if (waarden.length) categorieRows.push([cat.label, waarden.join(", ")]);
  }
  const rows = [
    ["Toernooi", partij.toernooi],
    ["Ronde", partij.ronde],
    ["Datum", partij.datum],
    ["Uitslag", partij.uitslag],
    ...categorieRows,
    ["Bron", partij.bron],
    ["Notities", partij.notities],
  ].filter(([, waarde]) => waarde);

  container.innerHTML = `
    <button type="button" class="secondary" data-action="back" style="margin-bottom:0.75rem;">&#8592; Terug naar overzicht</button>
    <h2>${escapeHtml(titel)}</h2>
    <div class="card" style="text-align:center;">
      <div data-role="player"></div>
      ${
        rows.length
          ? `<table class="stand-detail-tabel">${rows
              .map(([label, waarde]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(waarde)}</td></tr>`)
              .join("")}</table>`
          : ""
      }
      <div class="button-row" style="justify-content:center;">
        <button type="button" class="secondary" data-action="word">Downloaden als Word</button>
        <button type="button" class="secondary" data-action="film">Filmmodule</button>
        <button type="button" class="secondary" data-action="annoteren">Annoteren</button>
        <button type="button" class="secondary" data-action="edit">Bewerken</button>
        <button type="button" class="secondary" data-action="delete">Verwijderen</button>
      </div>
    </div>
  `;

  const playerHost = container.querySelector('[data-role="player"]');
  const { board, turn } = partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
  createZettenboomPlayer(playerHost, { wortel: partij.wortel, bord: board, beurt: turn });

  container.querySelector('[data-action="word"]').addEventListener("click", async () => {
    const blob = await buildPartijDocxBlob(partij);
    downloadBlob(blob, `partij-${(titel || "partij").replace(/[^\w-]+/g, "_")}.docx`);
  });

  container.querySelector('[data-action="back"]').addEventListener("click", () => onBack?.());
  container.querySelector('[data-action="film"]').addEventListener("click", () => onFilm?.(partij.id));
  container.querySelector('[data-action="annoteren"]').addEventListener("click", () => onAnnoteren?.(partij.id));
  container.querySelector('[data-action="edit"]').addEventListener("click", () => onEdit?.(partij.id));
  container.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm(`Deze partij (${titel}) verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    await deletePartij(partij.id);
    onDeleted?.();
  });
}
