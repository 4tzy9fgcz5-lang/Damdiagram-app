import { FIELD_COUNT, fieldToCoord, PIECE_TYPES, createEmptyBoard } from "../core/board.js";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(values, med) {
  return median(values.map((v) => Math.abs(v - med)));
}

function robustSigma(values, med) {
  return Math.max(1.4826 * mad(values, med), 1e-6);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Verdeelt een lijst getallen in twee groepen (1D k-means, k=2, deterministisch
// gestart vanaf het kleinste/grootste getal). Boekstijlen verschillen te veel om een
// vaste drempel te gebruiken (zie ontwikkelnotities: op echte foto's gaf een vaste
// mediaan+marge-drempel bijna nergens een "bezet" veld); deze aanpak vindt zelf de
// natuurlijke knik in de verdeling voor elke foto apart.
function kmeans1d2(values) {
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  if (lo0 === hi0) {
    return { low: lo0, high: hi0, lowGroup: values.slice(), highGroup: [], gap: 0 };
  }

  let centroids = [lo0, hi0];
  let groups = [[], values.slice()];
  for (let iter = 0; iter < 50; iter++) {
    const next = [[], []];
    for (const v of values) {
      const d0 = Math.abs(v - centroids[0]);
      const d1 = Math.abs(v - centroids[1]);
      next[d0 <= d1 ? 0 : 1].push(v);
    }
    if (next[0].length === 0 || next[1].length === 0) break;
    groups = next;
    const nextCentroids = [
      groups[0].reduce((a, b) => a + b, 0) / groups[0].length,
      groups[1].reduce((a, b) => a + b, 0) / groups[1].length,
    ];
    if (nextCentroids[0] === centroids[0] && nextCentroids[1] === centroids[1]) break;
    centroids = nextCentroids;
  }

  const lowIdx = centroids[0] <= centroids[1] ? 0 : 1;
  const highIdx = 1 - lowIdx;
  const lowGroup = groups[lowIdx];
  const highGroup = groups[highIdx];
  const gap = highGroup.length && lowGroup.length ? Math.min(...highGroup) - Math.max(...lowGroup) : 0;

  return { low: centroids[lowIdx], high: centroids[highIdx], lowGroup, highGroup, gap };
}

// Onder deze absolute kloof (in grijswaarde-eenheden) vertrouwen we de splitsing niet en
// nemen we aan dat het bord leeg is — puur fotoruis levert typisch een kloof < 1 op,
// echte foto's met stukken erop gaven in onze tests altijd een kloof > 2.
const MIN_STD_GAP = 1.2;
const KING_MIN_GAP = 2;
const KING_CONFIDENCE_CAP = 0.4;

// features: array (index 1..50) van { mean, std } (grijswaarde-gemiddelde en textuur per veld)
export function classifyFromFeatures(features) {
  const fields = [];
  for (let f = 1; f <= FIELD_COUNT; f++) fields.push(f);
  const stds = fields.map((f) => features[f].std);

  const board = createEmptyBoard();
  const confidences = new Array(FIELD_COUNT + 1).fill(1);

  const { low, high, lowGroup, highGroup, gap } = kmeans1d2(stds);
  if (gap < MIN_STD_GAP || highGroup.length === 0) {
    // Geen betrouwbaar te onderscheiden groep gevonden: waarschijnlijk een leeg bord.
    return { board, confidences };
  }

  const threshold = (low + high) / 2;
  const emptyMeans = fields.filter((f) => features[f].std <= threshold).map((f) => features[f].mean);
  const baseline = emptyMeans.length ? median(emptyMeans) : median(fields.map((f) => features[f].mean));
  const emptySigma = robustSigma(emptyMeans.length >= 2 ? emptyMeans : fields.map((f) => features[f].mean), baseline);

  const stdGapHalf = Math.max((high - low) / 2, 1e-6);

  const occupiedStds = fields.filter((f) => features[f].std > threshold).map((f) => features[f].std);
  const kingSplit = occupiedStds.length >= 2 ? kmeans1d2(occupiedStds) : null;
  const kingThreshold =
    kingSplit && kingSplit.gap >= KING_MIN_GAP && kingSplit.highGroup.length > 0
      ? (kingSplit.low + kingSplit.high) / 2
      : null;

  for (const f of fields) {
    const { mean, std } = features[f];

    if (std <= threshold) {
      board[f] = null;
      const distance = (threshold - std) / stdGapHalf;
      confidences[f] = clamp01(0.6 + distance * 0.3);
      continue;
    }

    const delta = mean - baseline;
    const colorSignal = Math.abs(delta) / emptySigma;
    const colorConfidence = clamp01(0.5 + colorSignal * 0.2);
    const occupiedSignal = (std - threshold) / stdGapHalf;
    const occupiedConfidence = clamp01(0.5 + occupiedSignal * 0.25);
    const isWhite = delta > 0;

    const isKing = kingThreshold !== null && std > kingThreshold;
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
