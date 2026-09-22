import { listEindspelen } from "../db/eindspelen.js?v=20260922a";

// Stap 1 van de eindspelen-uitbreiding: alleen een leeg overzicht, om de
// nieuwe opslagplaats en het nieuwe tabblad te kunnen testen. Filters, invoer
// en opgavevellen voor eindspelen komen in latere stappen.
export async function renderEindspelenView(container) {
  container.innerHTML = `
    <h2>Eindspelen</h2>
    <div class="card">
      <div data-role="empty" style="display:none;color:#666;padding:1rem;text-align:center;">
        Nog geen eindspelen toegevoegd.
      </div>
    </div>
  `;
  const eindspelen = await listEindspelen();
  container.querySelector('[data-role="empty"]').style.display = eindspelen.length ? "none" : "block";
}
