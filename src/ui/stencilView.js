import { getStencil, saveStencil } from "../db/stencils.js?v=20260921a";
import { getStand, saveStand } from "../db/standen.js?v=20260921a";
import { resolveStencilItems } from "../stencil/compose.js?v=20260921a";
import { buildStencilPagesHTML, missingOplossingen } from "../stencil/stencilPreview.js?v=20260921a";
import { buildStencilDocxBlob, downloadBlob } from "../export/docx.js?v=20260921a";
import { renderDiagramSVG } from "../diagram/render.js?v=20260921a";
import { parseFen } from "../core/fen.js?v=20260921a";
import { MAX_DIAGRAMS_PER_PAGE } from "../stencil/layout.js?v=20260921a";

export async function renderStencilView(container, { stencilId, onOpenStand, onGotoDatabaseToAdd, onBack } = {}) {
  let stencil = await getStencil(stencilId);
  if (!stencil) {
    container.innerHTML = `<p>Opgaveblad niet gevonden.</p>`;
    return;
  }

  container.innerHTML = `
    <button type="button" class="secondary" data-action="back" style="margin-bottom:0.75rem;">&#8592; Terug naar overzicht</button>
    <h2>Opgaveblad bewerken</h2>
    <div class="card">
      <div class="field-row">
        <div>
          <label>Titel</label>
          <input type="text" data-field="titel" />
        </div>
        <div>
          <label>Datum</label>
          <input type="text" data-field="datum" />
        </div>
      </div>
      <label>Clubnaam</label>
      <input type="text" data-field="club" />
      <label>Ondertitel/notitie (optioneel)</label>
      <input type="text" data-field="ondertitel" placeholder="komt vooraan bij de opdrachtregel, bijv. 'Clubkampioenschap ronde 3'" />
      <label>Algemene opdrachtregel</label>
      <input type="text" data-field="opdrachtregel" />
    </div>

    <div class="card">
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="add">Standen toevoegen</button>
        <button type="button" class="secondary" data-action="sort-difficulty">Sorteer op moeilijkheidsgraad</button>
      </div>
      <div data-role="grid" class="stand-grid" style="margin-top:1rem;"></div>
      <p data-role="count" style="color:#666;font-size:0.85rem;"></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Uitvoer</h2>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="secondary" data-action="preview-opgaven">Voorbeeld opgaven (afdrukken/PDF)</button>
        <button type="button" class="secondary" data-action="preview-oplossingen">Voorbeeld oplossingen</button>
        <button type="button" class="secondary" data-action="preview-beide">Voorbeeld beide</button>
      </div>
      <p style="color:#666;font-size:0.85rem;">
        Voor een PDF: open het voorbeeld en kies in je browser "Afdrukken" &rarr; "Opslaan als PDF".
      </p>
      <div class="button-row">
        <button type="button" class="primary" data-action="docx-opgaven">Word: alleen opgaven</button>
        <button type="button" class="primary" data-action="docx-oplossingen">Word: alleen oplossingen</button>
        <button type="button" class="primary" data-action="docx-beide">Word: beide (oplossingen op apart blad)</button>
      </div>
      <p data-role="docx-status" style="color:#666;font-size:0.85rem;"></p>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);

  el('[data-action="back"]').addEventListener("click", () => onBack?.());

  el('[data-field="titel"]').value = stencil.titel;
  el('[data-field="datum"]').value = stencil.datum;
  el('[data-field="club"]').value = stencil.club;
  el('[data-field="ondertitel"]').value = stencil.ondertitel;
  el('[data-field="opdrachtregel"]').value = stencil.opdrachtregel;

  async function persistHeader() {
    stencil = await saveStencil({
      ...stencil,
      titel: el('[data-field="titel"]').value.trim() || "Opgaveblad",
      datum: el('[data-field="datum"]').value.trim(),
      club: el('[data-field="club"]').value.trim(),
      ondertitel: el('[data-field="ondertitel"]').value.trim(),
      opdrachtregel: el('[data-field="opdrachtregel"]').value.trim() || "Wit speelt en wint",
    });
  }
  for (const field of ["titel", "datum", "club", "ondertitel", "opdrachtregel"]) {
    el(`[data-field="${field}"]`).addEventListener("change", persistHeader);
  }

  el('[data-action="add"]').addEventListener("click", () => onGotoDatabaseToAdd?.(stencilId));

  // Bewaart de scrollpositie: renderGrid vervangt alle kaarten in de grid, en
  // zonder dit schoot de pagina daardoor (even kortstondig een lege grid) terug
  // naar boven bij bijvoorbeeld het verwijderen van een diagram.
  async function persistStanden(newStanden) {
    const scrollY = window.scrollY;
    stencil = await saveStencil({ ...stencil, standen: newStanden });
    await renderGrid();
    window.scrollTo(0, scrollY);
  }

  async function renderGrid() {
    const grid = el('[data-role="grid"]');
    const count = el('[data-role="count"]');
    grid.innerHTML = "";
    const items = await resolveStencilItems(stencil);
    count.textContent = `${items.length} diagram(men) (max. ${MAX_DIAGRAMS_PER_PAGE} per A4-pagina).`;

    items.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "stand-card";
      const svg = item.stand
        ? renderDiagramSVG(parseFen(item.stand.fen).board, { size: 120 })
        : `<div class="missing" style="color:#a30000;">stand ontbreekt</div>`;
      card.innerHTML = `
        <div style="font-weight:700;">${i + 1}.</div>
        ${svg}
        <input type="text" data-role="opdracht" placeholder="opdracht (optioneel)" value="${escapeAttr(
          item.opdracht || item.stand?.opdracht || ""
        )}" style="font-size:0.8rem;padding:0.3rem;" />
        <div class="button-row" style="justify-content:center;margin-top:0.4rem;">
          <button type="button" class="secondary" data-role="up" ${i === 0 ? "disabled" : ""}>&uarr;</button>
          <button type="button" class="secondary" data-role="down" ${
            i === items.length - 1 ? "disabled" : ""
          }>&darr;</button>
          <button type="button" class="secondary" data-role="open">Open</button>
          <button type="button" class="secondary" data-role="remove">Verwijder</button>
        </div>
      `;

      card.querySelector('[data-role="opdracht"]').addEventListener("change", async (e) => {
        const newText = e.target.value.trim();
        const standOwnText = item.stand?.opdracht || "";
        if (item.stand && newText !== standOwnText) {
          const ookInDb = confirm("Ook aanpassen bij deze stand zelf in de database?");
          if (ookInDb) {
            await saveStand({ ...item.stand, opdracht: newText });
          }
        }
        const updated = stencil.standen.map((s, idx) => (idx === i ? { ...s, opdracht: newText } : s));
        await persistStanden(updated);
      });

      card.querySelector('[data-role="up"]').addEventListener("click", async () => {
        if (i === 0) return;
        const updated = [...stencil.standen];
        [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
        await persistStanden(updated);
      });
      card.querySelector('[data-role="down"]').addEventListener("click", async () => {
        if (i === items.length - 1) return;
        const updated = [...stencil.standen];
        [updated[i + 1], updated[i]] = [updated[i], updated[i + 1]];
        await persistStanden(updated);
      });
      card.querySelector('[data-role="open"]').addEventListener("click", () => {
        if (item.stand) onOpenStand?.(item.stand.id);
      });
      card.querySelector('[data-role="remove"]').addEventListener("click", async () => {
        const updated = stencil.standen.filter((_, idx) => idx !== i);
        await persistStanden(updated);
      });

      grid.appendChild(card);
    });
  }
  await renderGrid();

  // Diagram 1 = laagste moeilijkheidsgraad, oplopend. Een stand zonder eigen
  // classificatie telt voorlopig als 3 sterren. Blijft een expliciete knop
  // (i.p.v. automatisch bij elke wijziging), zodat een handmatige volgorde via
  // ↑/↓ daarna niet steeds weer wordt overschreven.
  el('[data-action="sort-difficulty"]').addEventListener("click", async () => {
    const items = await resolveStencilItems(stencil);
    const moeilijkheidPerStandId = new Map(items.map((item) => [item.standId, item.stand?.moeilijkheid ?? 3]));
    const sorted = [...stencil.standen].sort(
      (a, b) => moeilijkheidPerStandId.get(a.standId) - moeilijkheidPerStandId.get(b.standId)
    );
    await persistStanden(sorted);
  });

  async function openPreview(mode) {
    const items = await resolveStencilItems(stencil);
    if (items.length === 0) {
      alert("Voeg eerst standen toe aan dit opgaveblad.");
      return;
    }
    if ((mode === "oplossingen" || mode === "beide") && missingOplossingen(items) > 0) {
      const doorgaan = confirm(
        `${missingOplossingen(items)} stand(en) hebben nog geen oplossing. Toch doorgaan?`
      );
      if (!doorgaan) return;
    }
    const html = buildStencilPagesHTML(stencil, items, mode);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  el('[data-action="preview-opgaven"]').addEventListener("click", () => openPreview("opgaven"));
  el('[data-action="preview-oplossingen"]').addEventListener("click", () => openPreview("oplossingen"));
  el('[data-action="preview-beide"]').addEventListener("click", () => openPreview("beide"));

  async function exportDocx(mode) {
    const items = await resolveStencilItems(stencil);
    if (items.length === 0) {
      alert("Voeg eerst standen toe aan dit opgaveblad.");
      return;
    }
    if ((mode === "oplossingen" || mode === "beide") && missingOplossingen(items) > 0) {
      const doorgaan = confirm(
        `${missingOplossingen(items)} stand(en) hebben nog geen oplossing. Toch doorgaan?`
      );
      if (!doorgaan) return;
    }
    const status = el('[data-role="docx-status"]');
    status.textContent = "Word-bestand wordt gemaakt...";
    try {
      const blob = await buildStencilDocxBlob(stencil, items, mode);
      const naam = `${stencil.titel || "opgaveblad"}-${mode}.docx`.replace(/[^a-z0-9.\-]+/gi, "_");
      downloadBlob(blob, naam);
      status.textContent = "Word-bestand gedownload.";
    } catch (err) {
      status.textContent = "Er ging iets mis bij het maken van het Word-bestand: " + err.message;
      throw err;
    }
  }

  el('[data-action="docx-opgaven"]').addEventListener("click", () => exportDocx("opgaven"));
  el('[data-action="docx-oplossingen"]').addEventListener("click", () => exportDocx("oplossingen"));
  el('[data-action="docx-beide"]').addEventListener("click", () => exportDocx("beide"));
}

// Een forcing of lokzet is voor een oplosser niet altijd meteen als zodanig
// herkenbaar — dat zet je daarom vast in het opdrachtveld, maar alleen als de
// stand zelf nog geen eigen opdrachttekst heeft (anders overschrijf je iets
// dat er bewust al stond).
function autoOpdracht(stand) {
  if (!stand || stand.opdracht) return "";
  const types = stand.categorieen?.type ?? [];
  const labels = [];
  if (types.includes("forcing")) labels.push("Forcing");
  if (types.includes("lokzet")) labels.push("Lokzet");
  return labels.join(", ");
}

export async function addStandenToStencil(stencilId, standIds) {
  const stencil = await getStencil(stencilId);
  if (!stencil) throw new Error("Opgaveblad niet gevonden.");
  const existingIds = new Set(stencil.standen.map((s) => s.standId));
  const toAdd = standIds.filter((id) => !existingIds.has(id));
  const nieuweItems = [];
  for (const standId of toAdd) {
    const stand = await getStand(standId);
    nieuweItems.push({ standId, opdracht: autoOpdracht(stand) });
  }
  const newStanden = [...stencil.standen, ...nieuweItems];
  await saveStencil({ ...stencil, standen: newStanden });
  return { added: toAdd.length, skipped: standIds.length - toAdd.length };
}

function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}
