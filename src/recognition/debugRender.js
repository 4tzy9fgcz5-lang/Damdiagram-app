import { fieldToCoord, FIELD_COUNT } from "../core/board.js?v=20260924f";

// Foto met de 4 aangewezen hoeken en verbindingslijnen erover getekend, geschaald naar
// een handige weergavebreedte.
export function buildCornersOverlay(drawable, corners, scaleUp, displayWidth) {
  const fullWidth = drawable.width ?? drawable.naturalWidth;
  const fullHeight = drawable.height ?? drawable.naturalHeight;
  const displayHeight = Math.round((fullHeight / fullWidth) * displayWidth);

  const canvas = document.createElement("canvas");
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(drawable, 0, 0, displayWidth, displayHeight);

  const displayScale = displayWidth / fullWidth;
  const points = corners.map((p) => ({ x: p.x * scaleUp * displayScale, y: p.y * scaleUp * displayScale }));

  ctx.strokeStyle = "#e0a800";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#e0a800";
    ctx.fill();
  });

  return canvas;
}

// Rechtgetrokken beeld met een 10x10-lijnraster erover, zodat je de veldindeling ziet.
export function buildGridOverlay(warpedCanvas) {
  const size = warpedCanvas.width;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(warpedCanvas, 0, 0);

  ctx.strokeStyle = "rgba(224, 168, 0, 0.8)";
  ctx.lineWidth = Math.max(1, size * 0.003);
  const step = size / 10;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  return canvas;
}

const PIECE_LABELS = {
  wp: "witte schijf",
  bp: "zwarte schijf",
  wk: "witte dam",
  bk: "zwarte dam",
};

// Voor elk van de 50 donkere velden: een kleine (60x60) uitsnede uit het
// rechtgetrokken beeld, zonder verdere interpretatie — de grondstof voor zowel
// buildFieldCrops hieronder als voor het voeden van een classifier per veld.
export function buildRawFieldCrops(warpedCanvas) {
  const size = warpedCanvas.width;
  const squareSize = size / 10;
  const crops = [];

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { row, col } = fieldToCoord(f);
    const cropCanvas = document.createElement("canvas");
    const cropSize = 60;
    cropCanvas.width = cropSize;
    cropCanvas.height = cropSize;
    const ctx = cropCanvas.getContext("2d");
    ctx.drawImage(
      warpedCanvas,
      col * squareSize,
      row * squareSize,
      squareSize,
      squareSize,
      0,
      0,
      cropSize,
      cropSize
    );
    crops.push({ field: f, canvas: cropCanvas });
  }
  return crops;
}

// Voor elk van de 50 donkere velden: dezelfde uitsnede, met het herkende resultaat
// en de betrouwbaarheid als bijschrift. `uncertainFields` (een Set of array met
// veldnummers) bepaalt de gele rand — welke drempel daarvoor geldt hangt af van
// wélke classifier de herkenning deed, dus dat bepaalt de aanroeper, niet dit
// bestand.
export function buildFieldCrops(warpedCanvas, board, confidences, uncertainFields = []) {
  const uncertainSet = uncertainFields instanceof Set ? uncertainFields : new Set(uncertainFields);
  return buildRawFieldCrops(warpedCanvas).map(({ field, canvas }) => {
    const piece = board[field];
    const confidence = confidences[field];
    const label = piece ? PIECE_LABELS[piece] ?? piece : "leeg";
    return {
      field,
      canvas,
      label,
      confidence,
      uncertain: uncertainSet.has(field),
    };
  });
}

// Voor damscan/OPDRACHT.md stap 2 ("controlebeeld"): het rechtgetrokken diagram
// met over elk speelveld het veldnummer en een markering van wat de classificatie
// daar denkt te zien, zodat je labels.txt zonder telwerk kunt controleren — het
// veldnummer op het beeld is dezelfde nummering als in labels.txt.
export function buildLabelCheckImage(warpedCanvas, board) {
  const size = warpedCanvas.width;
  const squareSize = size / 10;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(warpedCanvas, 0, 0);

  ctx.font = `${Math.round(squareSize * 0.22)}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.lineWidth = Math.max(2, squareSize * 0.05);

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { row, col } = fieldToCoord(f);
    const x0 = col * squareSize;
    const y0 = row * squareSize;
    const cx = x0 + squareSize / 2;
    const cy = y0 + squareSize / 2;

    const piece = board[f];
    if (piece === "wp" || piece === "wk") {
      ctx.beginPath();
      ctx.arc(cx, cy, squareSize * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#111111";
      ctx.stroke();
    } else if (piece === "bp" || piece === "bk") {
      ctx.beginPath();
      ctx.arc(cx, cy, squareSize * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = "#111111";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
    // Leeg: geen markering — dat veld toont dan gewoon de kale foto.

    const text = String(f);
    ctx.lineWidth = Math.max(2, squareSize * 0.045);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(text, x0 + 2, y0 + 1);
    ctx.fillStyle = "#c62839";
    ctx.fillText(text, x0 + 2, y0 + 1);
  }
  return canvas;
}
