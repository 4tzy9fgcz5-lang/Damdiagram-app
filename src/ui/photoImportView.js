import { warpToSquareCanvas } from "../recognition/homography.js";
import { classifyBoard, CONFIDENCE_THRESHOLD } from "../recognition/classify.js";
import { buildCornersOverlay, buildGridOverlay, buildFieldCrops } from "../recognition/debugRender.js";
import { FIELD_COUNT } from "../core/board.js";

const WORKING_MAX_SIDE = 1400;
const WARP_SIZE = 500;
const HANDLE_RADIUS = 14;
const HANDLE_HIT_RADIUS = 28;

async function loadDrawable(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kon de foto niet openen."));
      img.src = URL.createObjectURL(file);
    });
  }
}

function drawableSize(drawable) {
  return { width: drawable.width ?? drawable.naturalWidth, height: drawable.height ?? drawable.naturalHeight };
}

function defaultCorners(width, height) {
  const mx = width * 0.12;
  const my = height * 0.12;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

export async function renderPhotoImportView(container, { onRecognized } = {}) {
  container.innerHTML = `
    <h2>Foto van een diagram</h2>
    <div class="card" data-role="pick">
      <p>Maak een foto van het diagram in het boek, of kies een bestaande foto/screenshot.</p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="camera">Maak foto</button>
        <button type="button" class="secondary" data-action="gallery">Kies uit galerij</button>
      </div>
      <input type="file" accept="image/*" capture="environment" data-role="camera-input" style="display:none" />
      <input type="file" accept="image/*" data-role="gallery-input" style="display:none" />
    </div>

    <div class="card" data-role="corners" style="display:none;">
      <p>Sleep de 4 puntjes naar de hoeken van het <strong>dambordpatroon zelf</strong> (niet de rand of lijst eromheen).</p>
      <div style="position:relative;display:inline-block;max-width:100%;">
        <canvas data-role="canvas" style="width:100%;max-width:480px;height:auto;display:block;touch-action:none;border-radius:8px;"></canvas>
      </div>
      <div class="button-row">
        <button type="button" class="primary" data-action="recognize">Rechttrekken en herkennen</button>
        <button type="button" class="secondary" data-action="restart">Andere foto</button>
      </div>
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
    </div>

    <div class="card" data-role="results" style="display:none;">
      <p data-role="summary"></p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="goto-editor">Ga naar editor</button>
        <button type="button" class="secondary" data-action="toggle-debug">Toon herkenningsstappen</button>
      </div>
      <div data-role="debug" style="display:none;margin-top:1rem;">
        <h3 style="font-size:0.9rem;">1. Aangewezen hoeken op de foto</h3>
        <div data-role="debug-corners"></div>
        <h3 style="font-size:0.9rem;">2. Rechtgetrokken met 10×10-raster</h3>
        <div data-role="debug-grid"></div>
        <h3 style="font-size:0.9rem;">3. Elk veld apart, met herkenning en betrouwbaarheid</h3>
        <div data-role="debug-crops" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:0.4rem;"></div>
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const pickCard = el('[data-role="pick"]');
  const cornersCard = el('[data-role="corners"]');
  const resultsCard = el('[data-role="results"]');
  const canvas = el('[data-role="canvas"]');
  const ctx = canvas.getContext("2d");
  const status = el('[data-role="status"]');

  let drawable = null;
  let corners = null;
  let dragIndex = -1;
  let lastRecognition = null;

  function toCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.strokeStyle = "#1a5c38";
    ctx.lineWidth = Math.max(2, canvas.width * 0.004);
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();

    corners.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = i === dragIndex ? "#e7f3ec" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1a5c38";
      ctx.stroke();
    });
    ctx.restore();
  }

  function nearestCornerIndex(point) {
    let best = -1;
    let bestDist = Infinity;
    corners.forEach((p, i) => {
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
    const idx = nearestCornerIndex(point);
    if (idx === -1) return;
    dragIndex = idx;
    canvas.setPointerCapture(evt.pointerId);
    redraw();
    evt.preventDefault();
  }
  function onPointerMove(evt) {
    if (dragIndex === -1) return;
    const point = toCanvasPoint(evt.clientX, evt.clientY);
    corners[dragIndex] = {
      x: Math.max(0, Math.min(canvas.width, point.x)),
      y: Math.max(0, Math.min(canvas.height, point.y)),
    };
    redraw();
    evt.preventDefault();
  }
  function onPointerUp(evt) {
    if (dragIndex === -1) return;
    dragIndex = -1;
    redraw();
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
      corners = defaultCorners(canvas.width, canvas.height);
      pickCard.style.display = "none";
      cornersCard.style.display = "block";
      status.textContent = "";
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
    corners = null;
    lastRecognition = null;
    pickCard.style.display = "block";
    cornersCard.style.display = "none";
    resultsCard.style.display = "none";
    el('[data-role="debug"]').style.display = "none";
    el('[data-action="toggle-debug"]').textContent = "Toon herkenningsstappen";
    el('[data-role="camera-input"]').value = "";
    el('[data-role="gallery-input"]').value = "";
  });

  el('[data-action="recognize"]').addEventListener("click", async () => {
    status.textContent = "Bezig met rechttrekken en herkennen...";
    await new Promise((r) => setTimeout(r, 0));
    try {
      // Belangrijk: rechttrekken vanaf de originele foto (drawable), niet vanaf het
      // canvas met de groene hoekmarkeringen erop getekend — anders lekt die overlay
      // mee het herkenningsbeeld in. Corners staan in canvas-coördinaten (mogelijk
      // verkleind), dus terugschalen naar de resolutie van de originele foto.
      const { width: fullWidth } = drawableSize(drawable);
      const scaleUp = fullWidth / canvas.width;
      const fullResCorners = corners.map((p) => ({ x: p.x * scaleUp, y: p.y * scaleUp }));
      const warpedCanvas = warpToSquareCanvas(drawable, fullResCorners, WARP_SIZE);
      const imageData = warpedCanvas.getContext("2d").getImageData(0, 0, WARP_SIZE, WARP_SIZE);
      const { board, confidences } = classifyBoard(imageData, WARP_SIZE);
      const photoDataUrl = warpedCanvas.toDataURL("image/jpeg", 0.85);

      lastRecognition = { board, confidences, photoDataUrl, warpedCanvas, scaleUp, fullResCorners };
      renderResults(lastRecognition);
      status.textContent = "";
      cornersCard.style.display = "none";
      resultsCard.style.display = "block";
    } catch (err) {
      status.textContent = "Herkenning is mislukt: " + err.message + ". Probeer de hoeken opnieuw aan te wijzen.";
    }
  });

  function renderResults({ board, confidences }) {
    let occupied = 0;
    let uncertain = 0;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      if (board[f]) occupied++;
      if (confidences[f] < CONFIDENCE_THRESHOLD) uncertain++;
    }
    el('[data-role="summary"]').textContent =
      `${occupied} van de 50 velden herkend als bezet, ${uncertain} veld(en) zijn onzeker (geel gemarkeerd in de editor).`;
  }

  function renderDebug({ board, confidences, warpedCanvas, fullResCorners }) {
    const debugCorners = el('[data-role="debug-corners"]');
    const debugGrid = el('[data-role="debug-grid"]');
    const debugCrops = el('[data-role="debug-crops"]');
    debugCorners.innerHTML = "";
    debugGrid.innerHTML = "";
    debugCrops.innerHTML = "";

    const cornersCanvas = buildCornersOverlay(drawable, fullResCorners, 1, 400);
    cornersCanvas.style.maxWidth = "100%";
    cornersCanvas.style.borderRadius = "8px";
    debugCorners.appendChild(cornersCanvas);

    const gridCanvas = buildGridOverlay(warpedCanvas);
    gridCanvas.style.width = "300px";
    gridCanvas.style.maxWidth = "100%";
    gridCanvas.style.borderRadius = "8px";
    debugGrid.appendChild(gridCanvas);

    for (const crop of buildFieldCrops(warpedCanvas, board, confidences)) {
      const wrapper = document.createElement("div");
      wrapper.style.textAlign = "center";
      wrapper.style.fontSize = "0.65rem";
      crop.canvas.style.width = "100%";
      crop.canvas.style.borderRadius = "4px";
      crop.canvas.style.border = crop.uncertain ? "2px solid #e0a800" : "1px solid #d0d0d0";
      wrapper.appendChild(crop.canvas);
      const caption = document.createElement("div");
      caption.textContent = `${crop.field}: ${crop.label} (${Math.round(crop.confidence * 100)}%)`;
      wrapper.appendChild(caption);
      debugCrops.appendChild(wrapper);
    }
  }

  el('[data-action="toggle-debug"]').addEventListener("click", (e) => {
    const debugBlock = el('[data-role="debug"]');
    const willShow = debugBlock.style.display === "none";
    if (willShow && lastRecognition) renderDebug(lastRecognition);
    debugBlock.style.display = willShow ? "block" : "none";
    e.target.textContent = willShow ? "Verberg herkenningsstappen" : "Toon herkenningsstappen";
  });

  el('[data-action="goto-editor"]').addEventListener("click", () => {
    if (!lastRecognition) return;
    const { board, confidences, photoDataUrl } = lastRecognition;
    onRecognized?.({ board, confidences, photoDataUrl });
  });
}
