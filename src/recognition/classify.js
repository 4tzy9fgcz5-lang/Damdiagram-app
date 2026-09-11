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

// features: array (index 1..50) van { mean, std } (grijswaarde-gemiddelde en textuur per veld)
//
// Let op: er wordt hier NIET geprobeerd een dam te onderscheiden van een gewone schijf.
// Dat is geprobeerd via een tweede clustering op textuur, maar bleek onbetrouwbaar: op
// zowel echte foto's als op de eigen diagramtekenaar wees die net zo vaak een gewone
// schijf als een echte dam aan (geen enkel verband met de werkelijke dam-status). Beter
// eerlijk niets gokken dan stelselmatig fout gokken — elk bezet veld wordt dus een
// gewone schijf; Jan tikt een veld met een dam er zelf nog een keer op om te wisselen.
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
  // Voor de kleur wordt niet het venster-gemiddelde gebruikt, maar het gemiddelde van
  // alleen het middelste stukje van elk veld (zie centerMean in extractFeatures). Bij
  // een open ringetje (zoals sommige boeken voor wit gebruiken) trekt de rand van de
  // ring het venster-gemiddelde soms net onder de achtergrondwaarde, waardoor wit voor
  // zwart werd aangezien. Het midden van een open ring blijft achtergrondkleurig/licht,
  // het midden van een gevulde zwarte schijf niet — dat scheidt veel scherper
  // (geverifieerd tegen 6 echte testfoto's: 88,3% -> 89,7% correct, minder wit/zwart-
  // verwisselingen, geen enkele foto ging erop achteruit).
  const emptyCenters = fields.filter((f) => features[f].std <= threshold).map((f) => features[f].centerMean);
  const baseline = emptyCenters.length ? median(emptyCenters) : median(fields.map((f) => features[f].centerMean));
  const emptySigma = robustSigma(
    emptyCenters.length >= 2 ? emptyCenters : fields.map((f) => features[f].centerMean),
    baseline
  );

  const stdGapHalf = Math.max((high - low) / 2, 1e-6);

  for (const f of fields) {
    const { std, centerMean } = features[f];

    if (std <= threshold) {
      board[f] = null;
      const distance = (threshold - std) / stdGapHalf;
      confidences[f] = clamp01(0.6 + distance * 0.3);
      continue;
    }

    const delta = centerMean - baseline;
    const colorSignal = Math.abs(delta) / emptySigma;
    const colorConfidence = clamp01(0.5 + colorSignal * 0.2);
    const occupiedSignal = (std - threshold) / stdGapHalf;
    const occupiedConfidence = clamp01(0.5 + occupiedSignal * 0.25);
    const isWhite = delta > 0;

    board[f] = isWhite ? PIECE_TYPES.WHITE_PIECE : PIECE_TYPES.BLACK_PIECE;
    confidences[f] = Math.min(occupiedConfidence, colorConfidence);
  }

  return { board, confidences };
}

function toGray(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function regionMean(data, width, x0, y0, x1, y1) {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      sum += toGray(data[idx], data[idx + 1], data[idx + 2]);
      count++;
    }
  }
  return sum / count;
}

// Leest per veld een ingekaderd stukje van het rechtgetrokken vierkante beeld uit
// (inset, om raster/randpixels te vermijden) en berekent gemiddelde en spreiding, plus
// een klein centrumstukje (zie classifyFromFeatures voor waarom dat apart wordt gehouden).
export function extractFeatures(imageData, outSize) {
  const squareSize = outSize / 10;
  // 0.22 leek eerst genoeg, maar op de eigen (scherpe, niet-foto-achtige) diagramstijl
  // viel de achtergrond van het vakje nog gedeeltelijk binnen het venster, wat het
  // gemiddelde vervuilde. 0.26 blijft ruim binnen een schijf, op zowel foto's als
  // schone screenshots (geverifieerd tegen 2 echte testfoto's + de eigen tekenaar).
  const inset = squareSize * 0.26;
  const centerHalf = squareSize * 0.1;
  const { data, width } = imageData;
  const features = new Array(FIELD_COUNT + 1).fill(null);

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { row, col } = fieldToCoord(f);
    const cx = col * squareSize + squareSize / 2;
    const cy = row * squareSize + squareSize / 2;

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
    const centerMean = regionMean(
      data,
      width,
      Math.round(cx - centerHalf),
      Math.round(cy - centerHalf),
      Math.round(cx + centerHalf),
      Math.round(cy + centerHalf)
    );
    features[f] = { mean, std: Math.sqrt(variance), centerMean };
  }
  return features;
}

export function classifyBoard(imageData, outSize) {
  const features = extractFeatures(imageData, outSize);
  return classifyFromFeatures(features);
}

export const CONFIDENCE_THRESHOLD = 0.55;
