import { importAll } from "../db/backup.js";
import { renderDiagramSVG } from "../diagram/render.js";
import { parseFen } from "../core/fen.js";

export async function renderImportView(container, { encoded, onDone } = {}) {
  let data;
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    data = JSON.parse(json);
  } catch {
    container.innerHTML = `<div class="card"><p>Deze link kon niet worden gelezen. Vraag een nieuwe link aan het andere apparaat.</p></div>`;
    return;
  }

  const standen = data.standen ?? [];
  container.innerHTML = `
    <h2>Standen ontvangen</h2>
    <div class="card">
      <p>Je hebt een link geopend met <strong>${standen.length}</strong> stand(en). Wil je ze toevoegen aan je eigen database op dit apparaat? Standen die je al hebt, worden niet dubbel toegevoegd.</p>
      <div class="stand-grid">
        ${standen
          .slice(0, 12)
          .map((s) => renderDiagramSVG(parseFen(s.fen).board, { size: 100 }))
          .join("")}
      </div>
      <div class="button-row">
        <button type="button" class="primary" data-action="import">Toevoegen aan mijn database</button>
      </div>
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
    </div>
  `;

  container.querySelector('[data-action="import"]').addEventListener("click", async () => {
    const status = container.querySelector('[data-role="status"]');
    status.textContent = "Bezig met toevoegen...";
    await importAll(data, { mode: "merge" });
    status.textContent = "Klaar! De standen staan in je database.";
    onDone?.();
  });
}
