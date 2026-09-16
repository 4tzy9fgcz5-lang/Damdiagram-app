// Bulk-import, stap 1: een foto van een hele boekpagina met meerdere diagrammen
// erop. Dit scherm is puur een controle: klopt het aantal gevonden diagrammen?
// Hoeken preciezer afstellen gebeurt straks per diagram, in de vertrouwde
// hoeken-stap (diagramCaptureView.js) — hier alleen verwijderen wat niet hoort en
// zelf toevoegen wat gemist is.

import { loadDrawable, drawableSize, WORKING_MAX_SIDE } from "./imageInput.js?v=20260918e";
import { detectMultipleBoardCorners } from "../recognition/detectMultiBoard.js?v=20260918e";
import { getList, addListValue } from "../db/lijsten.js?v=20260918e";

const COLORS = ["#d1495b", "#1a5c38", "#3a6ea5", "#e0a800", "#8854d0", "#009688"];

// Een redelijke standaardplek voor een handmatig toegevoegd diagram. De
// gebruiker plaatst 'm pas echt zodra dát diagram aan de beurt is — daar krijgt
// hij (anders dan een automatisch gevonden diagram) de hele pagina te zien om de
// hoeken vrij naartoe te kunnen slepen, niet een klein uitsnedegebied.
function defaultBoxCorners(fullWidth, fullHeight, index) {
  const size = Math.min(fullWidth, fullHeight) * 0.22;
  const offset = (index % 5) * size * 0.15;
  const cx = fullWidth / 2 + offset;
  const cy = fullHeight / 2 + offset;
  return [
    { x: cx - size / 2, y: cy - size / 2 },
    { x: cx + size / 2, y: cy - size / 2 },
    { x: cx + size / 2, y: cy + size / 2 },
    { x: cx - size / 2, y: cy + size / 2 },
  ];
}

export async function renderBulkImportView(container, { onConfirmed } = {}) {
  container.innerHTML = `
    <h2>Bulk-import: pagina met meerdere diagrammen</h2>
    <div class="card" data-role="pick">
      <p>Maak een foto van een hele boekpagina met meerdere diagrammen erop, of kies
        een bestaande foto. De app zoekt daarna zelf hoeveel diagrammen erop staan.</p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="camera">Maak foto</button>
        <button type="button" class="secondary" data-action="gallery">Kies uit galerij</button>
      </div>
      <input type="file" accept="image/*" capture="environment" data-role="camera-input" style="display:none" />
      <input type="file" accept="image/*" data-role="gallery-input" style="display:none" />
    </div>

    <div class="card" data-role="overview" style="display:none;">
      <p>Controleer of alle diagrammen op de foto gevonden zijn. Verwijder wat niet
        hoort; voeg zelf iets toe als er een gemist is. De hoeken van elk diagram
        stel je zo meteen, per diagram, precies af.</p>
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
      <div style="position:relative;display:inline-block;max-width:100%;">
        <canvas data-role="canvas" style="width:100%;max-width:620px;height:auto;display:block;border-radius:8px;"></canvas>
      </div>
      <div class="button-row" style="margin-top:0.75rem;">
        <button type="button" class="secondary" data-action="add">+ Diagram toevoegen</button>
        <button type="button" class="secondary" data-action="restart">Andere foto</button>
      </div>
      <div data-role="list" style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.4rem;"></div>

      <label style="margin-top:0.75rem;">Auteur (leeg = niet invullen) — geldt voor alle diagrammen op deze pagina</label>
      <input type="text" data-field="auteur" placeholder="bijv. M. Fabre" />

      <label style="margin-top:0.75rem;">Boekstijl (voor training van de fotoherkenning) — geldt voor alle diagrammen op deze pagina</label>
      <div class="tag-list" data-role="boekstijl"></div>

      <div class="button-row">
        <button type="button" class="primary" data-action="confirm">Doorgaan</button>
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const pickCard = el('[data-role="pick"]');
  const overviewCard = el('[data-role="overview"]');
  const canvas = el('[data-role="canvas"]');
  const ctx = canvas.getContext("2d");
  const status = el('[data-role="status"]');
  const list = el('[data-role="list"]');
  const boekstijlHost = el('[data-role="boekstijl"]');

  let drawable = null;
  let scale = 1;
  // { id, corners: [{x,y} x4] in VOLLEDIGE-RESOLUTIE coördinaten van drawable, manual }
  let items = [];
  let nextId = 1;
  let selectedBoekstijl = "";

  // Zelfde patroon als de boekstijl-kiezer in editorView.js: één keuze, geldt nu
  // voor de hele pagina in plaats van per stand, zodat je dit niet per diagram
  // hoeft te herhalen.
  async function renderBoekstijlPicker() {
    const values = await getList("boekstijl");
    boekstijlHost.innerHTML = "";
    for (const value of values) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = value;
      if (selectedBoekstijl === value) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        selectedBoekstijl = selectedBoekstijl === value ? "" : value;
        renderBoekstijlPicker();
      });
      boekstijlHost.appendChild(btn);
    }
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tag";
    addBtn.textContent = "+ nieuw";
    addBtn.addEventListener("click", async () => {
      const naam = prompt("Uit welk boek of tijdschrift komen deze diagrammen?");
      if (!naam || !naam.trim()) return;
      await addListValue("boekstijl", naam.trim());
      selectedBoekstijl = naam.trim();
      renderBoekstijlPicker();
    });
    boekstijlHost.appendChild(addBtn);
  }
  await renderBoekstijlPicker();

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

    items.forEach((item, index) => {
      const color = COLORS[index % COLORS.length];
      const displayCorners = item.corners.map((p) => ({ x: p.x * scale, y: p.y * scale }));
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, canvas.width * 0.004);
      if (item.manual) ctx.setLineDash([canvas.width * 0.012, canvas.width * 0.008]);
      ctx.beginPath();
      displayCorners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();

      const label = displayCorners[0];
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(canvas.width * 0.03)}px sans-serif`;
      ctx.fillText(String(index + 1), label.x + 4, label.y + canvas.width * 0.03);
      ctx.restore();
    });
  }

  function renderList() {
    list.innerHTML = "";
    if (items.length === 0) {
      list.innerHTML = '<p style="color:#666;font-size:0.85rem;">Geen diagrammen (meer) — voeg er zo nodig zelf een toe.</p>';
      return;
    }
    items.forEach((item, index) => {
      const color = COLORS[index % COLORS.length];
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "0.5rem";
      row.innerHTML = `
        <span style="display:inline-block;width:0.9rem;height:0.9rem;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="flex:1;">Diagram ${index + 1}${item.manual ? " (zelf toegevoegd — hoeken zelf plaatsen op de hele pagina)" : ""}</span>
        <button type="button" class="secondary" data-remove="${item.id}">Verwijderen</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.remove);
        items = items.filter((it) => it.id !== id);
        renderList();
        redraw();
      });
    });
  }

  async function handleFile(file) {
    if (!file) return;
    status.textContent = "Foto wordt geladen...";
    try {
      drawable = await loadDrawable(file);
      const { width, height } = drawableSize(drawable);
      scale = Math.min(1, WORKING_MAX_SIDE / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      status.textContent = "Diagrammen zoeken...";
      pickCard.style.display = "none";
      overviewCard.style.display = "block";
      await new Promise((r) => setTimeout(r, 0));

      let detected = [];
      try {
        detected = detectMultipleBoardCorners(drawable);
      } catch {
        detected = [];
      }
      items = detected.map((corners) => ({ id: nextId++, corners, manual: false }));

      status.textContent =
        items.length > 0
          ? `${items.length} diagram(men) gevonden — controleer of dit klopt en verwijder wat niet hoort.`
          : "Geen diagrammen automatisch gevonden. Voeg ze zelf toe met “+ Diagram toevoegen”.";
      renderList();
      redraw();
    } catch (err) {
      status.textContent = "Kon deze foto niet openen: " + err.message;
    }
  }

  el('[data-role="camera-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-role="gallery-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-action="camera"]').addEventListener("click", () => el('[data-role="camera-input"]').click());
  el('[data-action="gallery"]').addEventListener("click", () => el('[data-role="gallery-input"]').click());

  el('[data-action="restart"]').addEventListener("click", () => {
    drawable = null;
    items = [];
    pickCard.style.display = "block";
    overviewCard.style.display = "none";
    el('[data-role="camera-input"]').value = "";
    el('[data-role="gallery-input"]').value = "";
  });

  el('[data-action="add"]').addEventListener("click", () => {
    const { width, height } = drawableSize(drawable);
    items.push({ id: nextId++, corners: defaultBoxCorners(width, height, items.length), manual: true });
    status.textContent = 'Diagram toegevoegd (gestippeld) — zodra het aan de beurt is, sleep je de hoeken op de hele pagina naar de juiste plek.';
    renderList();
    redraw();
  });

  el('[data-action="confirm"]').addEventListener("click", () => {
    if (items.length === 0) {
      status.textContent = "Voeg eerst minstens één diagram toe.";
      return;
    }
    onConfirmed?.({
      drawable,
      boekstijl: selectedBoekstijl,
      auteur: el('[data-field="auteur"]').value.trim(),
      diagrams: items.map((item) => ({ corners: item.corners, manual: item.manual })),
    });
  });
}
