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
  // Ondergrens van 1 grijswaarde-eenheid (i.p.v. bijna 0): bij een heel vlak/
  // ruisloos beeld (bijvoorbeeld een schone screenshot zonder foto-ruis) kan de
  // spreiding anders bijna nul worden, waardoor de erop gedeelde signalen
  // (delta, confidence) absurd groot/instabiel worden. Voor echte foto's met normale
  // ruis verandert deze grens niets.
  return Math.max(1.4826 * mad(values, med), 1.0);
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

// Zelfde soort veiligheidsklep, maar dan voor de kleursplitsing hieronder.
const MIN_COLOR_GAP = 0.9;

// Lost een 3x3-stelsel op via Cramer's regel — alleen gebruikt voor het lichthelling-
// vlak hieronder (3 onbekenden: a, b, c). Bij (bijna) samenvallende veldposities
// (zou hier niet moeten voorkomen, maar voor de zekerheid) valt dit terug op een plat
// vlak in plaats van te crashen.
function solve3x3(A, b) {
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(A);
  if (Math.abs(D) < 1e-9) return [0, 0, b[2] / 3];
  const withCol = (col, vals) => A.map((row, i) => row.map((v, j) => (j === col ? vals[i] : v)));
  return [det3(withCol(0, b)) / D, det3(withCol(1, b)) / D, det3(withCol(2, b)) / D];
}

// Fit een lichthelling z = a*x + b*y + c (kleinste kwadraten) door de opgegeven
// [x, y, z]-punten, zodat we per veldpositie een verwachte achtergrondhelderheid
// kunnen voorspellen in plaats van één vast getal voor het hele bord.
function fitPlane(points) {
  let Sxx = 0,
    Sxy = 0,
    Sx = 0,
    Syy = 0,
    Sy = 0,
    Sn = 0,
    Sxz = 0,
    Syz = 0,
    Sz = 0;
  for (const [x, y, z] of points) {
    Sxx += x * x;
    Sxy += x * y;
    Sx += x;
    Syy += y * y;
    Sy += y;
    Sn += 1;
    Sxz += x * z;
    Syz += y * z;
    Sz += z;
  }
  const A = [
    [Sxx, Sxy, Sx],
    [Sxy, Syy, Sy],
    [Sx, Sy, Sn],
  ];
  return solve3x3(A, [Sxz, Syz, Sz]);
}

// features: array (index 1..50) van { mean, std, centerMean, cx, cy }
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

  // Stage 1: bezet/leeg per veld (ongewijzigd — dit bleek bij diagnose niet de bron
  // van de "ten onrechte zwart"-fout).
  const { low, high, highGroup, gap } = kmeans1d2(stds);
  if (gap < MIN_STD_GAP || highGroup.length === 0) {
    // Geen betrouwbaar te onderscheiden groep gevonden: waarschijnlijk een leeg bord.
    return { board, confidences };
  }

  const threshold = (low + high) / 2;
  const stdGapHalf = Math.max((high - low) / 2, 1e-6);
  const emptyFields = fields.filter((f) => features[f].std <= threshold);
  const occupiedFields = fields.filter((f) => features[f].std > threshold);

  for (const f of emptyFields) {
    const distance = (threshold - features[f].std) / stdGapHalf;
    confidences[f] = clamp01(0.6 + distance * 0.3);
  }
  if (occupiedFields.length === 0) {
    return { board, confidences };
  }

  // Stage 2: kleur. Diagnose (zie ontwikkelnotities) liet zien dat foto's zelden
  // gelijkmatig belicht zijn (schaduw van een hand, een niet-platliggende bladzijde) —
  // één vast gemiddelde voor het hele bord duwde de donkerste kant van de foto te vaak
  // richting "zwart", ook als het veld leeg of wit was. In plaats daarvan fitten we een
  // lichthelling op de centerMean van alle LEGE velden (typisch 20-40 metingen, over
  // het hele bord verspreid) en vergelijken elk bezet veld met de verwachte
  // achtergrondhelderheid op precies die positie, niet met één plat gemiddelde.
  let a = 0;
  let b = 0;
  let c;
  if (emptyFields.length >= 6) {
    [a, b, c] = fitPlane(emptyFields.map((f) => [features[f].cx, features[f].cy, features[f].centerMean]));
  } else {
    // Te weinig lege velden om een vlak betrouwbaar te fitten: terugvallen op één
    // vast gemiddelde, zoals voorheen.
    c = emptyFields.length
      ? median(emptyFields.map((f) => features[f].centerMean))
      : median(fields.map((f) => features[f].centerMean));
  }
  const predictedAt = (f) => a * features[f].cx + b * features[f].cy + c;
  const emptyResiduals = emptyFields.map((f) => features[f].centerMean - predictedAt(f));
  const noiseFloor = robustSigma(
    emptyResiduals.length >= 2 ? emptyResiduals : fields.map((f) => features[f].centerMean),
    median(emptyResiduals.length ? emptyResiduals : [0])
  );

  const deltas = {};
  for (const f of occupiedFields) {
    deltas[f] = (features[f].centerMean - predictedAt(f)) / noiseFloor;
  }

  // De grens tussen wit en zwart wordt, net als bij bezet/leeg, per foto bepaald
  // (i.p.v. vooraf vastgelegd op nul) — met een terugval op een eenvoudige
  // teken-drempel als er te weinig scheiding is (bijvoorbeeld een bord met maar 1
  // kleur schijven erop).
  const colorSplit = kmeans1d2(occupiedFields.map((f) => deltas[f]));
  let colorThreshold = 0;
  let colorGapHalf = 1;
  if (colorSplit.gap >= MIN_COLOR_GAP && colorSplit.lowGroup.length && colorSplit.highGroup.length) {
    colorThreshold = (colorSplit.low + colorSplit.high) / 2;
    colorGapHalf = Math.max((colorSplit.high - colorSplit.low) / 2, 1e-6);
  }

  for (const f of occupiedFields) {
    const d = deltas[f];
    const isWhite = d > colorThreshold;
    board[f] = isWhite ? PIECE_TYPES.WHITE_PIECE : PIECE_TYPES.BLACK_PIECE;

    const occupiedSignal = (features[f].std - threshold) / stdGapHalf;
    const occupiedConfidence = clamp01(0.5 + occupiedSignal * 0.25);
    const colorSignal = Math.abs(d - colorThreshold) / colorGapHalf;
    const colorConfidence = clamp01(0.5 + colorSignal * 0.2);
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
    features[f] = { mean, std: Math.sqrt(variance), centerMean, cx, cy };
  }
  return features;
}

export function classifyBoard(imageData, outSize) {
  const features = extractFeatures(imageData, outSize);
  return classifyFromFeatures(features);
}

export const CONFIDENCE_THRESHOLD = 0.55;
