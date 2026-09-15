// Bulk-import, stap 1: een foto van een hele boekpagina met meerdere diagrammen
// erop, waarna de app zelf probeert te vinden hoeveel diagrammen erop staan en
// waar. De gebruiker kan gevonden diagrammen verwijderen, de hoeken bijstellen,
// en zelf een gemist diagram toevoegen — de automatische detectie hoeft niet
// perfect te zijn, dat vangt dit scherm op (zie CLAUDE.md-plan voor bulk-import).
//
// Deze eerste versie levert de bevestigde hoeken van elk diagram op via
// `onConfirmed`; het stap-voor-stap doorlopen (hoeken fijn afstellen -> herkennen
// -> oplossing invoeren per diagram) is een volgende stap, nog niet hier.

import { loadDrawable, drawableSize, WORKING_MAX_SIDE } from "./photoImportView.js?v=20260916e";
import { detectMultipleBoardCorners } from "../recognition/detectMultiBoard.js?v=20260916e";

const HANDLE_RADIUS = 12;
const HANDLE_HIT_RADIUS = 26;
const COLORS = ["#d1495b", "#1a5c38", "#3a6ea5", "#e0a800", "#8854d0", "#009688"];

function defaultSquare(canvas, index) {
  const size = Math.min(canvas.width, canvas.height) * 0.22;
  const offset = (index % 5) * size * 0.15;
  const cx = canvas.width / 2 + offset;
  const cy = canvas.height / 2 + offset;
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
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
      <div style="position:relative;display:inline-block;max-width:100%;">
        <canvas data-role="canvas" style="width:100%;max-width:620px;height:auto;display:block;touch-action:none;border-radius:8px;"></canvas>
      </div>
      <div class="button-row" style="margin-top:0.75rem;">
        <button type="button" class="secondary" data-action="add">+ Diagram toevoegen</button>
        <button type="button" class="secondary" data-action="restart">Andere foto</button>
      </div>
      <div data-role="list" style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.4rem;"></div>
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

  let drawable = null;
  let items = []; // { id, corners: [{x,y} x4] in canvas-coördinaten }
  let selectedId = null;
  let dragCornerIndex = -1;
  let nextId = 1;

  function toCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

    items.forEach((item, index) => {
      const color = COLORS[index % COLORS.length];
      const isSelected = item.id === selectedId;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? Math.max(3, canvas.width * 0.006) : Math.max(2, canvas.width * 0.003);
      ctx.beginPath();
      item.corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();

      const label = item.corners[0];
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(canvas.width * 0.03)}px sans-serif`;
      ctx.fillText(String(index + 1), label.x + 4, label.y + canvas.width * 0.03);

      if (isSelected) {
        item.corners.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = i === dragCornerIndex ? "#e7f3ec" : "#ffffff";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = color;
          ctx.stroke();
        });
      }
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
        <span style="flex:1;">Diagram ${index + 1}</span>
        <button type="button" class="secondary" data-select="${item.id}">${item.id === selectedId ? "Klaar met slepen" : "Hoeken aanpassen"}</button>
        <button type="button" class="secondary" data-remove="${item.id}">Verwijderen</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll("[data-select]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.select);
        selectedId = selectedId === id ? null : id;
        renderList();
        redraw();
      });
    });
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.remove);
        items = items.filter((it) => it.id !== id);
        if (selectedId === id) selectedId = null;
        renderList();
        redraw();
      });
    });
  }

  function nearestCorner(point) {
    if (selectedId == null) return -1;
    const item = items.find((it) => it.id === selectedId);
    if (!item) return -1;
    let best = -1;
    let bestDist = Infinity;
    item.corners.forEach((p, i) => {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const hitRadiusCanvasUnits = HANDLE_HIT_RADIUS * (canvas.width / canvas.getBoundingClientRect().width);
    return bestDist <= hitRadiusCanvasUnits ? best : -1;
  }

  function onPointerDown(evt) {
    const point = toCanvasPoint(evt.clientX, evt.clientY);
    const idx = nearestCorner(point);
    if (idx === -1) return;
    dragCornerIndex = idx;
    canvas.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  }
  function onPointerMove(evt) {
    if (dragCornerIndex === -1 || selectedId == null) return;
    const item = items.find((it) => it.id === selectedId);
    if (!item) return;
    const point = toCanvasPoint(evt.clientX, evt.clientY);
    item.corners[dragCornerIndex] = {
      x: Math.max(0, Math.min(canvas.width, point.x)),
      y: Math.max(0, Math.min(canvas.height, point.y)),
    };
    redraw();
    evt.preventDefault();
  }
  function onPointerUp() {
    dragCornerIndex = -1;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  async function handleFile(file) {
    if (!file) return;
    status.textContent = "Foto wordt geladen...";
    try {
      drawable = await loadDrawable(file);
      const { width, height } = drawableSize(drawable);
      const scale = Math.min(1, WORKING_MAX_SIDE / Math.max(width, height));
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
      items = detected.map((corners) => ({
        id: nextId++,
        corners: corners.map((p) => ({ x: p.x * scale, y: p.y * scale })),
      }));
      selectedId = null;

      status.textContent =
        items.length > 0
          ? `${items.length} diagram(men) gevonden — controleer of dit klopt, verwijder wat niet hoort en voeg zo nodig zelf iets toe.`
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
    selectedId = null;
    pickCard.style.display = "block";
    overviewCard.style.display = "none";
    el('[data-role="camera-input"]').value = "";
    el('[data-role="gallery-input"]').value = "";
  });

  el('[data-action="add"]').addEventListener("click", () => {
    const id = nextId++;
    items.push({ id, corners: defaultSquare(canvas, items.length) });
    selectedId = id;
    renderList();
    redraw();
  });

  el('[data-action="confirm"]').addEventListener("click", () => {
    if (items.length === 0) {
      status.textContent = "Voeg eerst minstens één diagram toe.";
      return;
    }
    const { width: fullWidth } = drawableSize(drawable);
    const scaleUp = fullWidth / canvas.width;
    const diagrams = items.map((item) => ({
      corners: item.corners.map((p) => ({ x: p.x * scaleUp, y: p.y * scaleUp })),
    }));
    onConfirmed?.({ drawable, diagrams });
  });
}
