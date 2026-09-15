import { parseFen } from "../core/fen.js?v=20260915e";
import { getStand, deleteStand } from "../db/standen.js?v=20260915e";
import { createSolutionPlayer } from "./solutionPlayer.js?v=20260915e";

// Focus-weergave van een opgeslagen stand: opgave, bord, oplossing, auteur. Geen
// invulvelden — bewerken gaat via de knop onderaan naar de gewone invoerpagina.
export async function renderStandDetailView(container, { standId, onEdit, onDeleted } = {}) {
  const stand = await getStand(standId);
  if (!stand) {
    container.innerHTML = `<p>Deze stand bestaat niet (meer).</p>`;
    return;
  }

  const { board, turn } = parseFen(stand.fen);
  const opgave = stand.opdracht?.trim() || (turn === "white" ? "Wit speelt en wint" : "Zwart speelt en wint");

  const bijschrift = [];
  if (stand.auteur) bijschrift.push(escapeHtml(stand.auteur));
  if (stand.jaartal) bijschrift.push(String(stand.jaartal));
  if (stand.publicatie) bijschrift.push(escapeHtml(stand.publicatie));

  container.innerHTML = `
    <h2>${escapeHtml(opgave)}</h2>
    <div class="card" style="text-align:center;">
      <div data-role="player"></div>
      <div data-role="legacyOplossing"></div>
      ${bijschrift.length ? `<p class="stand-detail-meta">${bijschrift.join(" · ")}</p>` : ""}
      <div class="button-row" style="justify-content:center;">
        <button type="button" class="secondary" data-action="edit">Bewerken</button>
        <button type="button" class="secondary" data-action="delete">Verwijderen</button>
      </div>
    </div>
  `;

  const playerHost = container.querySelector('[data-role="player"]');
  createSolutionPlayer(playerHost, { board, zetten: stand.zetten ?? [], turn });

  const legacyHost = container.querySelector('[data-role="legacyOplossing"]');
  const heeftZetten = stand.zetten && stand.zetten.length > 0;
  if (!heeftZetten && stand.oplossing) {
    legacyHost.innerHTML = `<p style="white-space:pre-wrap;text-align:left;">${escapeHtml(stand.oplossing)}</p>`;
  } else if (!heeftZetten && !stand.oplossing) {
    legacyHost.innerHTML = `<p style="color:#666;">Nog geen oplossing ingevoerd.</p>`;
  }

  container.querySelector('[data-action="edit"]').addEventListener("click", () => onEdit?.(stand.id));
  container.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm("Deze stand verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    await deleteStand(stand.id);
    onDeleted?.();
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
