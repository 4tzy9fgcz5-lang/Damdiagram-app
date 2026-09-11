import { fieldToCoord, FIELD_COUNT } from "../core/board.js";
import { CONFIDENCE_THRESHOLD } from "./classify.js";

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

// Voor elk van de 50 donkere velden: een kleine uitsnede uit het rechtgetrokken beeld,
// met het herkende resultaat en de betrouwbaarheid als bijschrift.
export function buildFieldCrops(warpedCanvas, board, confidences) {
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

    const piece = board[f];
    const confidence = confidences[f];
    const label = piece ? PIECE_LABELS[piece] ?? piece : "leeg";
    crops.push({
      field: f,
      canvas: cropCanvas,
      label,
      confidence,
      uncertain: confidence < CONFIDENCE_THRESHOLD,
    });
  }
  return crops;
}
