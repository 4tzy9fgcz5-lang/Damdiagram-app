import { FIELD_COUNT, fieldToCoord, PIECE_TYPES, createEmptyBoard } from "../core/board.js";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(values, med) {
  return median(values.map((v) => Math.abs(v - med)));
}

// robuuste schatting van de spreiding, vergelijkbaar met standaarddeviatie maar ongevoelig voor uitschieters
function robustSigma(values, med) {
  const m = mad(values, med);
  return Math.max(1.4826 * m, 1e-6);
}

// Deze twee drempels zijn empirisch getuned op ruis-simulaties (zie ontwikkelnotities):
// OCCUPIED_K=2.0 geeft vrijwel geen foutmeldingen op lege velden, zelfs bij dubbele ruis,
// en mist pas stukken bij zeer lage foto-contrast. KING_K=2.0 geeft ~3% vals-positief bij
// gewone stukken (dan lage betrouwbaarheid, geen foute classificatie) en 100% detectie van
// echte dammen in onze simulaties.
const OCCUPIED_K = 2.0;
const KING_K = 2.0;
const KING_CONFIDENCE_CAP = 0.4;

// features: array (index 1..50) van { mean, std } (grijswaarde-gemiddelde en textuur per veld)
export function classifyFromFeatures(features) {
  const means = [];
  const stds = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    means.push(features[f].mean);
    stds.push(features[f].std);
  }

  const medStd = median(stds);
  const sigmaStd = robustSigma(stds, medStd);
  const occupiedThreshold = medStd + OCCUPIED_K * sigmaStd;

  const occupiedFields = [];
  const emptyMeans = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    if (features[f].std > occupiedThreshold) occupiedFields.push(f);
    else emptyMeans.push(features[f].mean);
  }
  const emptyBaseline = emptyMeans.length ? median(emptyMeans) : median(means);
  const emptySigma = emptyMeans.length >= 2 ? robustSigma(emptyMeans, emptyBaseline) : robustSigma(means, emptyBaseline);

  const occupiedStds = occupiedFields.map((f) => features[f].std);
  const medOccupiedStd = occupiedStds.length ? median(occupiedStds) : medStd;
  const sigmaOccupiedStd = occupiedStds.length >= 2 ? robustSigma(occupiedStds, medOccupiedStd) : sigmaStd;
  const kingThreshold = medOccupiedStd + KING_K * sigmaOccupiedStd;

  const board = createEmptyBoard();
  const confidences = new Array(FIELD_COUNT + 1).fill(1);

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { mean, std } = features[f];
    const occupiedSignal = (std - occupiedThreshold) / sigmaStd;
    const occupiedConfidence = clamp01(0.5 + occupiedSignal * 0.25);

    if (!occupiedFields.includes(f)) {
      board[f] = null;
      confidences[f] = clamp01(1 - occupiedConfidence + 0.5);
      continue;
    }

    const delta = mean - emptyBaseline;
    const colorSignal = Math.abs(delta) / emptySigma;
    const colorConfidence = clamp01(0.5 + colorSignal * 0.2);
    const isWhite = delta > 0;

    const isKing = std > kingThreshold;
    let piece = isWhite ? PIECE_TYPES.WHITE_PIECE : PIECE_TYPES.BLACK_PIECE;
    let confidence = Math.min(occupiedConfidence, colorConfidence);
    if (isKing) {
      piece = isWhite ? PIECE_TYPES.WHITE_KING : PIECE_TYPES.BLACK_KING;
      confidence = Math.min(confidence, KING_CONFIDENCE_CAP);
    }

    board[f] = piece;
    confidences[f] = confidence;
  }

  return { board, confidences };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function toGray(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Leest per veld een ingekaderd stukje van het rechtgetrokken vierkante beeld uit
// (inset, om raster/randpixels te vermijden) en berekent gemiddelde en spreiding.
export function extractFeatures(imageData, outSize) {
  const squareSize = outSize / 10;
  const inset = squareSize * 0.22;
  const { data, width } = imageData;
  const features = new Array(FIELD_COUNT + 1).fill(null);

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { row, col } = fieldToCoord(f);
    const x0 = Math.round(col * squareSize + inset);
    const y0 = Math.round(row * squareSize + inset);
    const x1 = Math.round((col + 1) * squareSize - inset);
    const y1 = Math.round((row + 1) * squareSize - inset);

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        const gray = toGray(data[idx], data[idx + 1], data[idx + 2]);
        sum += gray;
        sumSq += gray * gray;
        count++;
      }
    }
    const mean = sum / count;
    const variance = Math.max(sumSq / count - mean * mean, 0);
    features[f] = { mean, std: Math.sqrt(variance) };
  }
  return features;
}

export function classifyBoard(imageData, outSize) {
  const features = extractFeatures(imageData, outSize);
  return classifyFromFeatures(features);
}

export const CONFIDENCE_THRESHOLD = 0.55;
