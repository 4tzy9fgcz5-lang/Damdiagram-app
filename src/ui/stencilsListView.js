import { listStencils, saveStencil, deleteStencil } from "../db/stencils.js";

export async function renderStencilsListView(container, { onOpenStencil } = {}) {
  container.innerHTML = `
    <h2>Mijn stencils</h2>
    <div class="card">
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="new">Nieuw stencil</button>
      </div>
      <div data-role="list" style="margin-top:1rem;"></div>
      <div data-role="empty" style="display:none;color:#666;padding:1rem;text-align:center;">
        Nog geen stencils. Maak er een via het overzicht van je standen.
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const list = el('[data-role="list"]');
  const emptyMsg = el('[data-role="empty"]');

  el('[data-action="new"]').addEventListener("click", async () => {
    const saved = await saveStencil({});
    onOpenStencil?.(saved.id);
  });

  const stencils = await listStencils();
  emptyMsg.style.display = stencils.length ? "none" : "block";

  for (const stencil of stencils) {
    const row = document.createElement("div");
    row.className = "card";
    row.style.marginBottom = "0.5rem";
    row.innerHTML = `
      <strong>${escapeHtml(stencil.titel)}</strong>
      <span style="color:#666;font-size:0.85rem;"> — ${stencil.standen.length} diagram(men) — ${escapeHtml(
      stencil.datum
    )}</span>
      <div class="button-row" style="margin-top:0.5rem;">
        <button type="button" class="secondary" data-role="open">Openen</button>
        <button type="button" class="secondary" data-role="del">Verwijderen</button>
      </div>
    `;
    row.querySelector('[data-role="open"]').addEventListener("click", () => onOpenStencil?.(stencil.id));
    row.querySelector('[data-role="del"]').addEventListener("click", async () => {
      if (!confirm(`Stencil "${stencil.titel}" verwijderen?`)) return;
      await deleteStencil(stencil.id);
      row.remove();
    });
    list.appendChild(row);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
