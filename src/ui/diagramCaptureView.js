// Herbruikbare stap "hoeken fijn afstellen -> rechttrekken en herkennen ->
// resultaat", losgetrokken uit photoImportView.js zodat zowel de losse
// foto-import als elke stap van de bulk-import (rij-door-diagrammen) precies
// dezelfde, vertrouwde flow gebruiken.

import { warpToSquareCanvas } from "../recognition/homography.js?v=20260916i";
import { classifyBoard, CONFIDENCE_THRESHOLD, RECOGNITION_VERSION } from "../recognition/classify.js?v=20260916i";
import {
  createClassifier as createNewClassifier,
  FLAG_BELOW as NEW_FLAG_BELOW,
  RECOGNITION_VERSION as NEW_RECOGNITION_VERSION,
} from "../recognition/newClassify.js?v=20260916i";
import {
  buildCornersOverlay,
  buildGridOverlay,
  buildFieldCrops,
  buildRawFieldCrops,
} from "../recognition/debugRender.js?v=20260916i";
import { FIELD_COUNT, createEmptyBoard, PIECE_TYPES } from "../core/board.js?v=20260916i";
import { drawableSize, WORKING_MAX_SIDE } from "./imageInput.js?v=20260916i";

// Ligt buiten het bereik van het cache-bust-bompscript (dat kijkt alleen naar JS-
// imports/HTML-tags) — bij het trainen van een nieuw damscan/weights.json dus ook
// deze versie met de hand ophogen, anders houdt Fastly (GitHub Pages) tot 10
// minuten de oude gewichten vast.
const WEIGHTS_VERSION = "20260915l";

let newClassifierPromise = null;
function getNewClassifier() {
  if (!newClassifierPromise) {
    newClassifierPromise = fetch(`damscan/weights.json?v=${WEIGHTS_VERSION}`)
      .then((r) => {
        if (!r.ok) throw new Error("kon damscan/weights.json niet laden");
        return r.json();
      })
      .then((weights) => createNewClassifier(weights));
  }
  return newClassifierPromise;
}

// Herkent één rechtgetrokken bord met de gekozen classifier. Geeft altijd hetzelfde
// vorm terug (board/confidences/uncertainFields/modelVersion), zodat de rest van
// deze pagina niet hoeft te weten welke classifier er precies draaide.
async function classifyWith(useNew, warpedCanvas) {
  if (useNew) {
    let clf;
    try {
      clf = await getNewClassifier();
    } catch (err) {
      throw new Error(`nieuwe herkenning kon niet laden (${err.message}) — probeer de oude via de schakelaar`);
    }
    const rawCrops = buildRawFieldCrops(warpedCanvas);
    const cropInputs = rawCrops.map(({ canvas }) => {
      const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      return { data: d.data, width: d.width, height: d.height };
    });
    const { squares } = clf.classifyBoard(cropInputs);
    const board = createEmptyBoard();
    const confidences = new Array(FIELD_COUNT + 1).fill(1);
    const uncertainFields = [];
    for (const sq of squares) {
      confidences[sq.square] = sq.confidence;
      if (sq.label === "white") board[sq.square] = PIECE_TYPES.WHITE_PIECE;
      else if (sq.label === "black") board[sq.square] = PIECE_TYPES.BLACK_PIECE;
      if (sq.confidence < NEW_FLAG_BELOW) uncertainFields.push(sq.square);
    }
    return { board, confidences, uncertainFields, modelVersion: NEW_RECOGNITION_VERSION };
  }

  const size = warpedCanvas.width;
  const imageData = warpedCanvas.getContext("2d").getImageData(0, 0, size, size);
  const { board, confidences } = classifyBoard(imageData, size);
  const uncertainFields = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    if (confidences[f] < CONFIDENCE_THRESHOLD) uncertainFields.push(f);
  }
  return { board, confidences, uncertainFields, modelVersion: RECOGNITION_VERSION };
}

// Herkent met de gekozen classifier (die de weergegeven stand levert), en laat op
// de achtergrond ook de ándere classifier meekijken — puur om per veld te
// vergelijken. Velden waar oud en nieuw een ander stuk zien, komen in
// `disagreementFields` en worden net als "onzeker" gemarkeerd: uit de vergelijking
// tussen beide methoden bleek onenigheid de grootste resterende foutenbron te
// dekken, groter dan wat elke methode voor zichzelf al als onzeker herkent. Als de
// andere classifier om wat voor reden dan ook niet laadt, gaat de herkenning
// gewoon door zonder die extra vergelijking.
async function classifyWithComparison(useNew, warpedCanvas) {
  const [primary, secondary] = await Promise.allSettled([
    classifyWith(useNew, warpedCanvas),
    classifyWith(!useNew, warpedCanvas),
  ]);
  if (primary.status === "rejected") throw primary.reason;
  const result = primary.value;

  const disagreementFields = [];
  if (secondary.status === "fulfilled") {
    const other = secondary.value;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      if (result.board[f] !== other.board[f]) disagreementFields.push(f);
    }
  }
  const uncertainFields = [...new Set([...result.uncertainFields, ...disagreementFields])].sort((a, b) => a - b);
  return { ...result, uncertainFields, disagreementFields };
}

const WARP_SIZE = 500;
const HANDLE_RADIUS = 14;
const HANDLE_HIT_RADIUS = 28;

// Snijdt een ruim opgevuld gebied rond de gegeven hoeken uit `sourceDrawable`
// (bijvoorbeeld de foto van een hele boekpagina), zodat er in de hoeken-stap
// straks een lekker groot, gemakkelijk te bewerken beeld van dat ene diagram
// staat in plaats van de hele pagina. `corners` staat in de volledige-resolutie
// coördinaten van `sourceDrawable`. Geeft een canvas + de corners terug,
// omgerekend naar de coördinaten van dat uitgesneden canvas.
export function cropAroundCorners(sourceDrawable, corners, paddingFactor = 0.6) {
  const { width: fullWidth, height: fullHeight } = drawableSize(sourceDrawable);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * paddingFactor;
  const padY = (maxY - minY) * paddingFactor;

  const cropX0 = Math.max(0, Math.floor(minX - padX));
  const cropY0 = Math.max(0, Math.floor(minY - padY));
  const cropX1 = Math.min(fullWidth, Math.ceil(maxX + padX));
  const cropY1 = Math.min(fullHeight, Math.ceil(maxY + padY));
  const cropWidth = Math.max(1, cropX1 - cropX0);
  const cropHeight = Math.max(1, cropY1 - cropY0);

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  canvas
    .getContext("2d")
    .drawImage(sourceDrawable, cropX0, cropY0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  return {
    canvas,
    corners: corners.map((p) => ({ x: p.x - cropX0, y: p.y - cropY0 })),
  };
}

// drawable: canvas/bitmap/image, tekenbaar via drawImage.
// initialCorners: [{x,y} x4] in de volledige-resolutie coördinaten van `drawable`.
// heading: optionele titel boven het scherm (bv. "Diagram 3 van 6" bij bulk-import).
// onRestart: optioneel — als gezet, toont een "Andere foto"-knop die dit aanroept
//   in plaats van terug te gaan naar een fotokeuze-scherm (dat hoort hier niet).
export function renderDiagramCapture(container, { drawable, initialCorners, heading, onRestart, onRecognized } = {}) {
  container.innerHTML = `
    ${heading ? `<h2>${heading}</h2>` : ""}
    <div class="card" data-role="corners">
      <p>Sleep de 4 puntjes naar de hoeken van het <strong>dambordpatroon zelf</strong> (niet de rand of lijst
        eromheen) — of sleep ergens binnen het vak om het in één keer te verschuiven.</p>
      <div style="position:relative;display:inline-block;max-width:100%;">
        <canvas data-role="canvas" style="width:100%;max-width:480px;height:auto;display:block;touch-action:none;border-radius:8px;"></canvas>
      </div>
      <div class="quick-actions" style="justify-content:flex-start;" data-role="classifier-toggle">
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="radio" name="classifier-corners" value="new" checked /> Nieuwe herkenning (aanbevolen)
        </label>
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="radio" name="classifier-corners" value="old" /> Oude herkenning
        </label>
      </div>
      <div class="button-row">
        <button type="button" class="primary" data-action="recognize">Rechttrekken en herkennen</button>
        ${onRestart ? '<button type="button" class="secondary" data-action="restart">Andere foto</button>' : ""}
      </div>
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
    </div>

    <div class="card" data-role="results" style="display:none;">
      <div class="quick-actions" style="justify-content:flex-start;" data-role="classifier-toggle">
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="radio" name="classifier-results" value="new" checked /> Nieuwe herkenning (aanbevolen)
        </label>
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="radio" name="classifier-results" value="old" /> Oude herkenning
        </label>
      </div>
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
  const cornersCard = el('[data-role="corners"]');
  const resultsCard = el('[data-role="results"]');
  const canvas = el('[data-role="canvas"]');
  const ctx = canvas.getContext("2d");
  const status = el('[data-role="status"]');

  const { width: fullWidth, height: fullHeight } = drawableSize(drawable);
  const scale = Math.min(1, WORKING_MAX_SIDE / Math.max(fullWidth, fullHeight));
  canvas.width = Math.round(fullWidth * scale);
  canvas.height = Math.round(fullHeight * scale);

  let corners = initialCorners.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  let dragIndex = -1;
  let lastRecognition = null;
  let useNewClassifier = true;

  // Twee losse exemplaren van dezelfde schakelaar (hoeken-scherm en resultaten-
  // scherm) — eigen `name` per stel (anders vormen ze onbedoeld één radiogroep en
  // kan er middels twee gelijke waarden techisch geen van beide meer aangevinkt
  // staan), maar wel steeds met elkaar gesynchroniseerd.
  const classifierToggles = container.querySelectorAll('[data-role="classifier-toggle"]');
  function syncClassifierToggles(value) {
    for (const toggle of classifierToggles) {
      for (const radio of toggle.querySelectorAll('input[type="radio"]')) {
        radio.checked = radio.value === value;
      }
    }
  }
  for (const toggle of classifierToggles) {
    toggle.addEventListener("change", (e) => {
      if (e.target.name.indexOf("classifier-") !== 0 || !e.target.checked) return;
      useNewClassifier = e.target.value === "new";
      syncClassifierToggles(e.target.value);
      if (lastRecognition && resultsCard.style.display !== "none") reclassify();
    });
  }

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
    ctx.fillStyle = "rgba(26, 92, 56, 0.12)";
    ctx.strokeStyle = "#1a5c38";
    ctx.lineWidth = Math.max(2, canvas.width * 0.004);
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
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

  // Ray-casting: staat het punt binnen de (mogelijk niet-convexe) vierhoek?
  function pointInCorners(point) {
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
      const pi = corners[i];
      const pj = corners[j];
      const intersects =
        pi.y > point.y !== pj.y > point.y &&
        point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  // 'corner': één hoekpunt fijn afstellen. 'move': het hele vak in één keer
  // verschuiven (handig als de startpositie ver van het echte diagram af staat,
  // zoals bij een zelf toegevoegd diagram op de volledige pagina) — daarna kun je
  // de hoeken nog los bijstellen.
  let dragMode = null;
  let moveStart = null;
  let moveOriginalCorners = null;

  function onPointerDown(evt) {
    const point = toCanvasPoint(evt.clientX, evt.clientY);
    const idx = nearestCornerIndex(point);
    if (idx !== -1) {
      dragMode = "corner";
      dragIndex = idx;
      canvas.setPointerCapture(evt.pointerId);
      redraw();
      evt.preventDefault();
      return;
    }
    if (pointInCorners(point)) {
      dragMode = "move";
      moveStart = point;
      moveOriginalCorners = corners.map((p) => ({ ...p }));
      canvas.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    }
  }
  function onPointerMove(evt) {
    if (!dragMode) return;
    const point = toCanvasPoint(evt.clientX, evt.clientY);
    if (dragMode === "corner") {
      corners[dragIndex] = {
        x: Math.max(0, Math.min(canvas.width, point.x)),
        y: Math.max(0, Math.min(canvas.height, point.y)),
      };
    } else {
      // Verschuiving begrenzen zodat geen enkele hoek het canvas uit schiet, maar
      // de vorm van het vak daarbij niet vervormt (alle hoeken dezelfde dx/dy).
      const rawDx = point.x - moveStart.x;
      const rawDy = point.y - moveStart.y;
      const minDx = Math.max(...moveOriginalCorners.map((p) => -p.x));
      const maxDx = Math.min(...moveOriginalCorners.map((p) => canvas.width - p.x));
      const minDy = Math.max(...moveOriginalCorners.map((p) => -p.y));
      const maxDy = Math.min(...moveOriginalCorners.map((p) => canvas.height - p.y));
      const dx = Math.max(minDx, Math.min(maxDx, rawDx));
      const dy = Math.max(minDy, Math.min(maxDy, rawDy));
      corners = moveOriginalCorners.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    redraw();
    evt.preventDefault();
  }
  function onPointerUp() {
    if (!dragMode) return;
    dragMode = null;
    dragIndex = -1;
    redraw();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  if (onRestart) {
    el('[data-action="restart"]').addEventListener("click", onRestart);
  }

  el('[data-action="recognize"]').addEventListener("click", async () => {
    status.textContent = "Bezig met rechttrekken en herkennen...";
    await new Promise((r) => setTimeout(r, 0));
    try {
      // Belangrijk: rechttrekken vanaf de originele foto (drawable), niet vanaf het
      // canvas met de groene hoekmarkeringen erop getekend — anders lekt die overlay
      // mee het herkenningsbeeld in. Corners staan in canvas-coördinaten (mogelijk
      // verkleind), dus terugschalen naar de resolutie van de originele foto.
      const scaleUp = fullWidth / canvas.width;
      const fullResCorners = corners.map((p) => ({ x: p.x * scaleUp, y: p.y * scaleUp }));
      const warpedCanvas = warpToSquareCanvas(drawable, fullResCorners, WARP_SIZE);
      const photoDataUrl = warpedCanvas.toDataURL("image/jpeg", 0.85);
      const result = await classifyWithComparison(useNewClassifier, warpedCanvas);

      lastRecognition = { ...result, photoDataUrl, warpedCanvas, scaleUp, fullResCorners };
      renderResults(lastRecognition);
      status.textContent = "";
      cornersCard.style.display = "none";
      resultsCard.style.display = "block";
    } catch (err) {
      status.textContent = "Herkenning is mislukt: " + err.message + ". Probeer de hoeken opnieuw aan te wijzen.";
    }
  });

  // Herkent dezelfde, al rechtgetrokken foto opnieuw met de andere classifier —
  // voor de schakelaar in het resultatenscherm, zodat je oud en nieuw op precies
  // dezelfde foto kunt vergelijken zonder de hoeken opnieuw aan te wijzen.
  async function reclassify() {
    const summary = el('[data-role="summary"]');
    const prevText = summary.textContent;
    summary.textContent = "Bezig met herkennen...";
    try {
      const { warpedCanvas, photoDataUrl, scaleUp, fullResCorners } = lastRecognition;
      const result = await classifyWithComparison(useNewClassifier, warpedCanvas);
      lastRecognition = { ...result, photoDataUrl, warpedCanvas, scaleUp, fullResCorners };
      renderResults(lastRecognition);
      if (el('[data-role="debug"]').style.display !== "none") renderDebug(lastRecognition);
    } catch (err) {
      summary.textContent = prevText;
      alert("Herkennen met deze classifier is mislukt: " + err.message);
    }
  }

  function renderResults({ board, confidences, uncertainFields, disagreementFields }) {
    let occupied = 0;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      if (board[f]) occupied++;
    }
    let text = `${occupied} van de 50 velden herkend als bezet, ${uncertainFields.length} veld(en) zijn onzeker (geel gemarkeerd in de editor).`;
    if (disagreementFields?.length) {
      text += ` Daarvan ${disagreementFields.length} omdat de oude en nieuwe herkenning het niet met elkaar eens zijn.`;
    }
    el('[data-role="summary"]').textContent = text;
  }

  function renderDebug({ board, confidences, uncertainFields, warpedCanvas, fullResCorners }) {
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

    for (const crop of buildFieldCrops(warpedCanvas, board, confidences, uncertainFields)) {
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
    const { board, confidences, uncertainFields, photoDataUrl, modelVersion } = lastRecognition;
    onRecognized?.({ board, confidences, uncertainFields, photoDataUrl, modelVersion });
  });

  redraw();
}
