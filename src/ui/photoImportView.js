import { warpToSquareCanvas } from "../recognition/homography.js?v=20260915i";
import { classifyBoard, CONFIDENCE_THRESHOLD, RECOGNITION_VERSION } from "../recognition/classify.js?v=20260915i";
import {
  createClassifier as createNewClassifier,
  FLAG_BELOW as NEW_FLAG_BELOW,
  RECOGNITION_VERSION as NEW_RECOGNITION_VERSION,
} from "../recognition/newClassify.js?v=20260915i";
import {
  buildCornersOverlay,
  buildGridOverlay,
  buildFieldCrops,
  buildRawFieldCrops,
  buildLabelCheckImage,
} from "../recognition/debugRender.js?v=20260915i";
import { detectBoardCorners } from "../recognition/detectBoard.js?v=20260915i";
import { FIELD_COUNT, createEmptyBoard, PIECE_TYPES } from "../core/board.js?v=20260915i";
import { buildZip } from "../export/zip.js?v=20260915i";
import { boardToLabelLine } from "../recognition/labelFormat.js?v=20260915i";

// Ligt buiten het bereik van het cache-bust-bompscript (dat kijkt alleen naar JS-
// imports/HTML-tags) — bij het trainen van een nieuw damscan/weights.json dus ook
// deze versie met de hand ophogen, anders houdt Fastly (GitHub Pages) tot 10
// minuten de oude gewichten vast.
const WEIGHTS_VERSION = "20260915i";

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
        <button type="button" class="secondary" data-action="restart">Andere foto</button>
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
        <button type="button" class="secondary" data-action="dump-crops">Exporteer voor labelen</button>
        <button type="button" class="secondary" data-action="next-photo">Volgende diagram</button>
      </div>
      <p data-role="dump-status" style="color:#666;font-size:0.85rem;"></p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="secondary" data-action="download-collection" data-role="download-collection-btn" style="display:none;">
          Download alles (<span data-role="collection-count">0</span> foto's)
        </button>
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
  let currentFileName = null;
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

  // Verzamelmodus voor het labelwerk (damscan/OPDRACHT.md): per diagram wordt hier
  // een export aan toegevoegd i.p.v. meteen gedownload; pas aan het eind bundelt
  // "Download alles" alles tot 1 zip. Blijft bestaan zolang je op deze pagina
  // blijft (dus over meerdere "Andere foto"-rondes heen), en wordt na de
  // verzameldownload weer leeg.
  const collected = [];

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
    currentFileName = file.name;
    status.textContent = "Foto wordt geladen...";
    try {
      drawable = await loadDrawable(file);
      const { width, height } = drawableSize(drawable);
      const scale = Math.min(1, WORKING_MAX_SIDE / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      // Probeer het bord zelf te vinden (dikke buitenrand); lukt dat niet, dan de
      // vaste 12%-marge zoals voorheen. In beide gevallen kan de gebruiker de
      // hoeken nog gewoon verslepen — dit is alleen het startpunt.
      status.textContent = "Bord zoeken...";
      let detected = null;
      try {
        detected = detectBoardCorners(drawable);
      } catch {
        detected = null;
      }
      corners = detected
        ? detected.map((p) => ({ x: p.x * scale, y: p.y * scale }))
        : defaultCorners(canvas.width, canvas.height);

      pickCard.style.display = "none";
      cornersCard.style.display = "block";
      status.textContent = detected ? "Bord automatisch gevonden — controleer en pas zo nodig aan." : "";
      redraw();
    } catch (err) {
      status.textContent = "Kon deze foto niet openen: " + err.message;
    }
  }

  el('[data-role="camera-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-role="gallery-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-action="camera"]').addEventListener("click", () => el('[data-role="camera-input"]').click());
  el('[data-action="gallery"]').addEventListener("click", () => el('[data-role="gallery-input"]').click());

  // Gedeeld door "Andere foto" (in het hoekenscherm) en "Volgende diagram" (in het
  // resultatenscherm, nodig voor de verzamelmodus): terug naar het beginscherm om
  // een nieuwe foto te kiezen, zónder de verzameling (`collected`) leeg te maken.
  function resetToPick() {
    drawable = null;
    corners = null;
    lastRecognition = null;
    currentFileName = null;
    pickCard.style.display = "block";
    cornersCard.style.display = "none";
    resultsCard.style.display = "none";
    el('[data-role="debug"]').style.display = "none";
    el('[data-action="toggle-debug"]').textContent = "Toon herkenningsstappen";
    el('[data-role="camera-input"]').value = "";
    el('[data-role="gallery-input"]').value = "";
  }

  el('[data-action="restart"]').addEventListener("click", resetToPick);
  el('[data-action="next-photo"]').addEventListener("click", resetToPick);

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
      const photoDataUrl = warpedCanvas.toDataURL("image/jpeg", 0.85);
      const result = await classifyWith(useNewClassifier, warpedCanvas);

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
      const result = await classifyWith(useNewClassifier, warpedCanvas);
      lastRecognition = { ...result, photoDataUrl, warpedCanvas, scaleUp, fullResCorners };
      renderResults(lastRecognition);
      if (el('[data-role="debug"]').style.display !== "none") renderDebug(lastRecognition);
    } catch (err) {
      summary.textContent = prevText;
      alert("Herkennen met deze classifier is mislukt: " + err.message);
    }
  }

  function renderResults({ board, confidences, uncertainFields }) {
    let occupied = 0;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      if (board[f]) occupied++;
    }
    el('[data-role="summary"]').textContent =
      `${occupied} van de 50 velden herkend als bezet, ${uncertainFields.length} veld(en) zijn onzeker (geel gemarkeerd in de editor).`;
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

  function canvasToPngBytes(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("kon canvas niet naar PNG omzetten"));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      }, "image/png");
    });
  }

  function updateCollectionButton() {
    const btn = el('[data-role="download-collection-btn"]');
    el('[data-role="collection-count"]').textContent = String(collected.length);
    btn.style.display = collected.length > 0 ? "inline-block" : "none";
  }

  // Voor damscan/OPDRACHT.md stap 1 + 2, in verzamelmodus: voegt voor déze foto
  // toe aan `collected` —
  //   crops/<naam>/01.png .. 50.png   (stap 1, ongewijzigd: buildFieldCrops)
  //   1 labelregel                     (stap 2: in het formaat van damscan/labels.js,
  //                                     op basis van de HUIDIGE herkenning — jij corrigeert
  //                                     daarna zelf de foute velden in labels.txt)
  //   check/<naam>.png                (stap 2: rechtgetrokken beeld met veldnummers + wat de
  //                                     herkenning er nu in ziet, om die correctie zonder
  //                                     telwerk te kunnen doen)
  // <naam> is de bestandsnaam van de brofoto (zonder extensie). Download gebeurt pas
  // via "Download alles", als je door alle diagrammen heen bent.
  el('[data-action="dump-crops"]').addEventListener("click", async () => {
    if (!lastRecognition) return;
    const dumpStatus = el('[data-role="dump-status"]');
    const naam = (currentFileName || "diagram").replace(/\.[^.]+$/, "");
    const stijl = prompt(
      "Uit welk boek of tijdschrift komt dit diagram? (laat leeg als je dat niet weet — vul het dan later zelf in labels.txt aan)",
      ""
    );
    dumpStatus.textContent = "Bezig met crops en controlebeeld maken...";
    await new Promise((r) => setTimeout(r, 0));
    try {
      const { board, warpedCanvas } = lastRecognition;
      const crops = buildRawFieldCrops(warpedCanvas);
      const cropEntries = [];
      for (const crop of crops) {
        const data = await canvasToPngBytes(crop.canvas);
        cropEntries.push({ name: `crops/${naam}/${String(crop.field).padStart(2, "0")}.png`, data });
      }

      const labelLine = boardToLabelLine(naam, board, stijl ? stijl.trim() : "");

      const checkCanvas = buildLabelCheckImage(warpedCanvas, board);
      const checkData = await canvasToPngBytes(checkCanvas);

      collected.push({ naam, cropEntries, labelLine, checkEntry: { name: `check/${naam}.png`, data: checkData } });
      updateCollectionButton();
      dumpStatus.textContent =
        `Toegevoegd aan de verzameling (${collected.length} foto's tot nu toe): ${naam}. ` +
        `Regel: ${labelLine}. Ga door met de volgende foto, of klik op "Download alles" als je klaar bent.`;
    } catch (err) {
      dumpStatus.textContent = "Exporteren is mislukt: " + err.message;
    }
  });

  // Bundelt de hele verzameling tot 1 zip: alle crops/<naam>/..., 1 gezamenlijke
  // labels.txt (alle labelregels achter elkaar) en alle check/<naam>.png's.
  el('[data-action="download-collection"]').addEventListener("click", () => {
    if (!collected.length) return;
    const dumpStatus = el('[data-role="dump-status"]');
    try {
      const entries = [];
      const labelLines = [];
      for (const item of collected) {
        entries.push(...item.cropEntries, item.checkEntry);
        labelLines.push(item.labelLine);
      }
      entries.push({ name: "labels.txt", data: new TextEncoder().encode(labelLines.join("\n") + "\n") });

      const zipBlob = buildZip(entries);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "labels-export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      dumpStatus.textContent = `Gedownload als labels-export.zip (${collected.length} foto's) — pak uit in je damscan-map.`;
      collected.length = 0;
      updateCollectionButton();
    } catch (err) {
      dumpStatus.textContent = "Downloaden is mislukt: " + err.message;
    }
  });
}
