import { renderDiagramSVG } from "../diagram/render.js?v=20260923f";
import { parseFen } from "../core/fen.js?v=20260923f";
import { listEindspelen } from "../db/eindspelen.js?v=20260923f";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Stap 2 van de eindspelen-uitbreiding: laat zien wat je hebt toegevoegd (nog
// zonder filters/zoeken/opgavevellen — dat komt in latere stappen).
export async function renderEindspelenView(container) {
  container.innerHTML = `
    <h2>Eindspelen</h2>
    <div class="card">
      <div data-role="totals" style="color:#666;font-size:0.85rem;margin-bottom:0.5rem;"></div>
      <div data-role="grid" class="stand-grid"></div>
      <div data-role="empty" style="display:none;color:#666;padding:1rem;text-align:center;">
        Nog geen eindspelen toegevoegd.
      </div>
    </div>
  `;
  const grid = container.querySelector('[data-role="grid"]');
  const emptyMsg = container.querySelector('[data-role="empty"]');
  const totalsHost = container.querySelector('[data-role="totals"]');

  const eindspelen = await listEindspelen();
  eindspelen.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  totalsHost.textContent = `${eindspelen.length} eindspel(en) in totaal.`;
  emptyMsg.style.display = eindspelen.length ? "none" : "block";

  for (const eindspel of eindspelen) {
    const card = document.createElement("div");
    card.className = "stand-card";
    const { board } = parseFen(eindspel.fen);
    const svg = renderDiagramSVG(board, { size: 140 });
    const heeftOplossing = (eindspel.zetten?.length ?? 0) > 0 || (eindspel.oplossing ?? "").trim();
    const heeftToelichting = (eindspel.toelichting ?? "").trim();
    card.innerHTML = `
      ${svg}
      <div class="meta">
        ${eindspel.auteur ? escapeHtml(eindspel.auteur) : ""}${eindspel.nummer ? ` · nr. ${escapeHtml(eindspel.nummer)}` : ""}
        ${!heeftOplossing && !heeftToelichting ? '<br><span style="color:#a30000;">geen oplossing</span>' : ""}
      </div>
    `;
    grid.appendChild(card);
  }
}
