import { getStencil, saveStencil } from "../db/stencils.js";
import { saveStand } from "../db/standen.js";
import { resolveStencilItems } from "../stencil/compose.js";
import { buildStencilPagesHTML, missingOplossingen } from "../stencil/stencilPreview.js";
import { buildStencilDocxBlob, downloadBlob } from "../export/docx.js";
import { renderDiagramSVG } from "../diagram/render.js";
import { parseFen } from "../core/fen.js";
import { MAX_DIAGRAMS_PER_STENCIL } from "../stencil/layout.js";

export async function renderStencilView(container, { stencilId, onOpenStand, onGotoDatabaseToAdd } = {}) {
  let stencil = await getStencil(stencilId);
  if (!stencil) {
    container.innerHTML = `<p>Stencil niet gevonden.</p>`;
    return;
  }

  container.innerHTML = `
    <h2>Stencil bewerken</h2>
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
      <label>Algemene opdrachtregel</label>
      <input type="text" data-field="opdrachtregel" />
    </div>

    <div class="card">
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="add">Standen toevoegen</button>
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
        <button type="button" class="primary" data-action="docx-beide">Word: beide (2 pagina's)</button>
      </div>
      <p data-role="docx-status" style="color:#666;font-size:0.85rem;"></p>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);

  el('[data-field="titel"]').value = stencil.titel;
  el('[data-field="datum"]').value = stencil.datum;
  el('[data-field="club"]').value = stencil.club;
  el('[data-field="opdrachtregel"]').value = stencil.opdrachtregel;

  async function persistHeader() {
    stencil = await saveStencil({
      ...stencil,
      titel: el('[data-field="titel"]').value.trim() || "Opgavenstencil",
      datum: el('[data-field="datum"]').value.trim(),
      club: el('[data-field="club"]').value.trim(),
      opdrachtregel: el('[data-field="opdrachtregel"]').value.trim() || "Wit speelt en wint",
    });
  }
  for (const field of ["titel", "datum", "club", "opdrachtregel"]) {
    el(`[data-field="${field}"]`).addEventListener("change", persistHeader);
  }

  el('[data-action="add"]').addEventListener("click", () => onGotoDatabaseToAdd?.(stencilId));

  async function persistStanden(newStanden) {
    stencil = await saveStencil({ ...stencil, standen: newStanden });
    await renderGrid();
  }

  async function renderGrid() {
    const grid = el('[data-role="grid"]');
    const count = el('[data-role="count"]');
    grid.innerHTML = "";
    const items = await resolveStencilItems(stencil);
    count.textContent = `${items.length} van maximaal ${MAX_DIAGRAMS_PER_STENCIL} diagrammen.`;

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

  async function openPreview(mode) {
    const items = await resolveStencilItems(stencil);
    if (items.length === 0) {
      alert("Voeg eerst standen toe aan dit stencil.");
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
      alert("Voeg eerst standen toe aan dit stencil.");
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
      const naam = `${stencil.titel || "stencil"}-${mode}.docx`.replace(/[^a-z0-9.\-]+/gi, "_");
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

export async function addStandenToStencil(stencilId, standIds) {
  const stencil = await getStencil(stencilId);
  if (!stencil) throw new Error("Stencil niet gevonden.");
  const existingIds = new Set(stencil.standen.map((s) => s.standId));
  const toAdd = standIds.filter((id) => !existingIds.has(id));
  const room = MAX_DIAGRAMS_PER_STENCIL - stencil.standen.length;
  const accepted = toAdd.slice(0, Math.max(0, room));
  const newStanden = [...stencil.standen, ...accepted.map((standId) => ({ standId, opdracht: "" }))];
  await saveStencil({ ...stencil, standen: newStanden });
  return { added: accepted.length, skipped: toAdd.length - accepted.length };
}

function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}
