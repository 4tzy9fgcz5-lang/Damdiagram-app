import { FIELD_COUNT, fieldToCoord, PIECE_TYPES, createEmptyBoard } from "../core/board.js?v=20260923g";

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

// Fit een achtergrond-vlak op `fitFields` en geef de afwijking t.o.v. dat vlak
// terug voor elk veld in `evalFields` (kunnen dezelfde of verschillende
// verzamelingen zijn).
function backgroundResiduals(features, evalFields, fitFields) {
  const [a, b, c] = fitPlane(fitFields.map((f) => [features[f].cx, features[f].cy, features[f].centerMean]));
  const residuals = {};
  for (const f of evalFields) residuals[f] = features[f].centerMean - (a * features[f].cx + b * features[f].cy + c);
  return residuals;
}

// Onder deze kloof vertrouwen we een geredde laag-textuur-kleur niet — dit is een
// tweede, onzekerdere poging dan de hoofdsplitsing hierboven, dus een iets
// strengere grens dan MIN_STD_GAP.
const MIN_RESCUE_GAP = 1.5;

// Arcering (diagonaal gestreepte donkere velden — een veelvoorkomende boekstijl,
// zie ontwikkelnotities) heeft overal dezelfde randrichting; een echte schijfrand
// heeft juist randen RONDOM (alle richtingen). Op Jans eigen arcering-foto's bleek
// dit onderscheid vrijwel zonder overlap: lege (gearceerde) velden zaten ruim onder
// 0.2, bezette velden ruim erboven.
const DIVERSITY_THRESHOLD = 0.2;

// features: array (index 1..50) van { mean, std, centerMean, cx, cy }
// diversity (optioneel): array (index 1..50) van randrichting-diversiteit per veld,
// zie computeOrientationDiversity — als dit ontbreekt (bijvoorbeeld in tests die met
// handgemaakte features werken, zonder echt beeld) wordt er niet op gefilterd.
//
// Let op: er wordt hier NIET geprobeerd een dam te onderscheiden van een gewone schijf.
// Dat is geprobeerd via een tweede clustering op textuur, maar bleek onbetrouwbaar: op
// zowel echte foto's als op de eigen diagramtekenaar wees die net zo vaak een gewone
// schijf als een echte dam aan (geen enkel verband met de werkelijke dam-status). Beter
// eerlijk niets gokken dan stelselmatig fout gokken — elk bezet veld wordt dus een
// gewone schijf; Jan tikt een veld met een dam er zelf nog een keer op om te wisselen.
function classifyStandard(features, diversity) {
  const fields = [];
  for (let f = 1; f <= FIELD_COUNT; f++) fields.push(f);
  const stds = fields.map((f) => features[f].std);

  const board = createEmptyBoard();
  const confidences = new Array(FIELD_COUNT + 1).fill(1);

  // Stage 1: bezet/leeg per veld, in twee fasen.
  //
  // Fase 1a: venster-textuur (std) — bewezen betrouwbaar, ook bij drukke standen
  // met veel stukken. De HOGE groep (duidelijk texturige velden) staat vast als
  // "bezet". Vindt dit geen betrouwbare knik (bv. gearceerde achtergrond met een
  // geleidelijke, niet-tweedelige textuur), dan is de hele foto voorlopig "ambigu".
  const { low, high, highGroup, gap } = kmeans1d2(stds);
  let confidentOccupied = [];
  let ambiguous = fields;
  let stdSplitFound = false;
  if (gap >= MIN_STD_GAP && highGroup.length > 0) {
    stdSplitFound = true;
    const threshold = (low + high) / 2;
    confidentOccupied = fields.filter((f) => features[f].std > threshold);
    ambiguous = fields.filter((f) => features[f].std <= threshold);
  }

  // Arcering-filter: een "confident occupied" veld met te weinig randrichting-
  // spreiding is waarschijnlijk arcering, geen schijf — terug naar de ambigue pot,
  // zodat de lichthelling-redding hieronder er alsnog eerlijk naar kan kijken.
  if (diversity) {
    const demoted = confidentOccupied.filter((f) => diversity[f] < DIVERSITY_THRESHOLD);
    confidentOccupied = confidentOccupied.filter((f) => diversity[f] >= DIVERSITY_THRESHOLD);
    ambiguous = ambiguous.concat(demoted);
  }

  // Fase 1b: probeer binnen de ambigue rest een kleur met weinig interne textuur
  // te "redden" van leeg (ontdekt met echte foto's van Jan: een effen zwarte
  // schijf kan een veel lagere std hebben dan een wit schijfje met een duidelijke
  // rand, waardoor fase 1a die kleur helemaal mist). Voorzichtig: fit de
  // achtergrond alleen op de onderste helft van de ambigue groep — een veilige
  // "vrijwel zeker leeg"-deelverzameling — en kijk of de rest daar met een
  // duidelijke knik van afwijkt in helderheid.
  //
  // Die "onderste helft" wordt normaal op std gekozen (Fase 1a werkte tenslotte
  // net op std). Maar als Fase 1a HELEMAAL geen splitsing vond (hele bord bleef
  // "ambigu"), is dat precies een teken dat std op déze foto onbetrouwbaar is
  // (bijvoorbeeld een boekstijl waar een effen gevulde schijf minder textuur heeft
  // dan het arceringspatroon zelf — gezien op een foto van Jan, waarbij dat de hele
  // lichthelling-schatting liet ontsporen en zwart/leeg stelselmatig verwisselde).
  // In dat geval op randrichting-diversiteit kiezen: arcering scoort daar laag, een
  // schijf van elke kleur hoog, ongeacht textuur.
  let rescued = [];
  let trueEmpty = ambiguous;
  if (ambiguous.length >= 12) {
    const byKey = diversity && !stdSplitFound
      ? [...ambiguous].sort((x, y) => diversity[x] - diversity[y])
      : [...ambiguous].sort((x, y) => features[x].std - features[y].std);
    const seedEmpty = byKey.slice(0, Math.floor(byKey.length / 2));
    if (seedEmpty.length >= 6) {
      const residualsSeed = backgroundResiduals(features, ambiguous, seedEmpty);
      const absSeed = ambiguous.map((f) => Math.abs(residualsSeed[f]));
      const splitR = kmeans1d2(absSeed);
      if (splitR.gap >= MIN_RESCUE_GAP && splitR.highGroup.length > 0) {
        const thresholdR = (splitR.low + splitR.high) / 2;
        const candidateRescue = ambiguous.filter((f) => Math.abs(residualsSeed[f]) > thresholdR);
        rescued = diversity ? candidateRescue.filter((f) => diversity[f] >= DIVERSITY_THRESHOLD) : candidateRescue;
        trueEmpty = ambiguous.filter((f) => !rescued.includes(f));
      }
    }
  }

  const occupiedFields = confidentOccupied.concat(rescued);
  const emptyFields = trueEmpty;
  const occupiedConfidenceFor = (f) => (confidentOccupied.includes(f) ? 0.75 : 0.6);

  if (occupiedFields.length === 0) {
    // Geen betrouwbare knik gevonden, in geen van beide fasen: waarschijnlijk een
    // leeg bord.
    return { board, confidences };
  }
  for (const f of emptyFields) confidences[f] = 0.75;

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

    const colorSignal = Math.abs(d - colorThreshold) / colorGapHalf;
    const colorConfidence = clamp01(0.5 + colorSignal * 0.2);
    confidences[f] = Math.min(occupiedConfidenceFor(f), colorConfidence);
  }

  flagImpossiblePieces(board, confidences);

  return { board, confidences };
}

// Spelregel-controle: een witte schijf op veld 1-5 of een zwarte op veld 46-50
// kan niet (zou een dam moeten zijn, en de opgaves die hiermee gemaakt worden
// bevatten nooit dammen) — dit nooit stilzwijgend aanpassen (in 22 echte
// controlegevallen was dit altijd fout, maar 3x bleek een andere aanname niet
// te kloppen), maar wel altijd als onzeker markeren zodat het opvalt.
function flagImpossiblePieces(board, confidences) {
  for (let f = 1; f <= 5; f++) {
    if (board[f] === PIECE_TYPES.WHITE_PIECE) confidences[f] = Math.min(confidences[f], 0.2);
  }
  for (let f = 46; f <= FIELD_COUNT; f++) {
    if (board[f] === PIECE_TYPES.BLACK_PIECE) confidences[f] = Math.min(confidences[f], 0.2);
  }
}

// Effen zwarte schijven zijn véél donkerder dan de rest van het bord — ook dan
// gearceerde lege velden (een veelvoorkomende boekstijl). Een veld telt als "effen
// zwart" als zijn midden onder dit deel van de mediaan-helderheid van alle velden zit.
const SOLID_DARK_RATIO = 0.4;

// Minimaal aantal effen-zwarte velden voordat de omgekeerd-controle hieronder iets
// durft te concluderen (een paar donkere velden kan ook gewoon schaduw zijn).
const MIN_SOLID_DARK = 4;

// Zo groot moet de sprong in helderheid tussen lege velden en witte schijven zijn,
// als deel van de mediaan-helderheid, om witte schijven daarop te herkennen.
const MIN_WHITE_GAP_RATIO = 0.2;

// Vangnet voor de hoofdherkenning hierboven. Die kiest "zeker lege" velden op basis van
// weinig textuur. Een effen zwarte schijf heeft nog minder textuur dan een gearceerd leeg
// veld — op zo'n foto werden de schijven als achtergrond gezien en de gearceerde lege
// velden als schijven (zwart en leeg precies omgedraaid, gemeld door Jan, 2026-09-20).
//
// Herkent dat aan één ondubbelzinnig teken: velden die veel donkerder zijn dan het bord
// als geheel (effen zwart) noemt de hoofdherkenning voor het grootste deel "leeg". Alleen
// dan wordt het opnieuw gedaan op de eenvoudigste manier die hier klopt: die donkere
// velden zijn zwarte schijven; van de rest is alles wat duidelijk lichter is dan de
// lege velden een witte schijf. Geeft null als dat niet duidelijk genoeg te bepalen is —
// dan blijft het resultaat van de hoofdherkenning staan.
function reclassifyWhenBlackIsInverted(features, diversity, standard) {
  const fields = [];
  for (let f = 1; f <= FIELD_COUNT; f++) fields.push(f);
  const boardMedian = median(fields.map((f) => features[f].centerMean));
  const solidDark = fields.filter(
    (f) => features[f].centerMean < SOLID_DARK_RATIO * boardMedian && (!diversity || diversity[f] >= DIVERSITY_THRESHOLD)
  );
  if (solidDark.length < MIN_SOLID_DARK) return null;
  const calledEmpty = solidDark.filter((f) => !standard.board[f]).length;
  if (calledEmpty < solidDark.length * 0.6) return null;

  const rest = fields.filter((f) => !solidDark.includes(f));
  const split = kmeans1d2(rest.map((f) => features[f].centerMean));
  const whiteThreshold = (split.low + split.high) / 2;
  const hasWhites = split.highGroup.length > 0 && split.gap >= MIN_WHITE_GAP_RATIO * boardMedian;

  const board = createEmptyBoard();
  const confidences = new Array(FIELD_COUNT + 1).fill(0.75);
  for (const f of solidDark) board[f] = PIECE_TYPES.BLACK_PIECE;
  if (hasWhites) {
    for (const f of rest) {
      if (features[f].centerMean <= whiteThreshold) continue;
      board[f] = PIECE_TYPES.WHITE_PIECE;
      const margin = (features[f].centerMean - whiteThreshold) / (split.gap / 2 + 1e-6);
      confidences[f] = clamp01(0.5 + margin * 0.15);
    }
  }
  return { board, confidences };
}

export function classifyFromFeatures(features, diversity = null) {
  const standard = classifyStandard(features, diversity);
  const result = reclassifyWhenBlackIsInverted(features, diversity, standard) || standard;
  flagImpossiblePieces(result.board, result.confidences);
  return result;
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

// Sobel-gradiënt (x- en y-richting) over het hele rechtgetrokken beeld, één keer
// berekend als grijswaarden-raster, voor computeOrientationDiversity hieronder.
function sobelGxy(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y * width + x] = toGray(data[idx], data[idx + 1], data[idx + 2]);
    }
  }
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    const rowOff = y * width;
    const rowUp = (y - 1) * width;
    const rowDn = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      gx[rowOff + x] =
        gray[rowUp + x + 1] + 2 * gray[rowOff + x + 1] + gray[rowDn + x + 1] -
        (gray[rowUp + x - 1] + 2 * gray[rowOff + x - 1] + gray[rowDn + x - 1]);
      gy[rowOff + x] =
        gray[rowDn + x - 1] + 2 * gray[rowDn + x] + gray[rowDn + x + 1] -
        (gray[rowUp + x - 1] + 2 * gray[rowUp + x] + gray[rowUp + x + 1]);
    }
  }
  return { gx, gy };
}

// Meet, voor een venster, hoe verspreid de randrichtingen zijn (gewogen naar
// randsterkte). Richting wordt verdubbeld om de 180°-dubbelzinnigheid van een rand
// op te heffen (een rand en zijn tegenovergestelde kant zien er voor Sobel gelijk
// uit). 0 = alle randen wijzen (ongeveer) dezelfde kant op — kenmerkend voor
// arcering; 1 = randen wijzen alle kanten op — kenmerkend voor een ronde schijfrand.
function orientationDiversity(gx, gy, width, x0, y0, x1, y1, magThreshold = 8) {
  let sumCos = 0;
  let sumSin = 0;
  let sumW = 0;
  for (let y = y0; y < y1; y++) {
    const rowOff = y * width;
    for (let x = x0; x < x1; x++) {
      const idx = rowOff + x;
      const m = Math.hypot(gx[idx], gy[idx]);
      if (m < magThreshold) continue;
      const theta = Math.atan2(gy[idx], gx[idx]) * 2;
      sumCos += m * Math.cos(theta);
      sumSin += m * Math.sin(theta);
      sumW += m;
    }
  }
  if (sumW < 1e-6) return 0;
  const r = Math.hypot(sumCos, sumSin) / sumW;
  return 1 - r;
}

// Randrichting-diversiteit per veld (zie classifyFromFeatures voor waarom dit
// arcering van een echte schijf onderscheidt). Gebruikt een ruimere inset dan
// extractFeatures: hier gaat het juist om de rand rondom een schijf, dus de rand
// van het veld zelf mag niet te veel worden weggesneden.
export function computeOrientationDiversity(imageData, outSize) {
  const squareSize = outSize / 10;
  const inset = squareSize * 0.15;
  const { width } = imageData;
  const { gx, gy } = sobelGxy(imageData);
  const diversity = new Array(FIELD_COUNT + 1).fill(0);

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { row, col } = fieldToCoord(f);
    // Math.trunc (afkappen), niet Math.round — moet exact overeenkomen met de
    // Python-diagnosetooling waarmee de 0.2-drempel hierboven is bepaald.
    const x0 = Math.trunc(col * squareSize + inset);
    const y0 = Math.trunc(row * squareSize + inset);
    const x1 = Math.trunc((col + 1) * squareSize - inset);
    const y1 = Math.trunc((row + 1) * squareSize - inset);
    diversity[f] = orientationDiversity(gx, gy, width, x0, y0, x1, y1);
  }
  return diversity;
}

export function classifyBoard(imageData, outSize) {
  const features = extractFeatures(imageData, outSize);
  const diversity = computeOrientationDiversity(imageData, outSize);
  return classifyFromFeatures(features, diversity);
}

// Wordt meegelogd bij elke correctie (zie herkenningLog.js), zodat later — als het
// logboek groter is geworden — precies te zien is welke versie van de herkenning
// welke resultaten gaf. Ophogen bij een inhoudelijke wijziging aan classifyFromFeatures
// of extractFeatures.
export const RECOGNITION_VERSION = "fase11-confidence-2026-09-14";

// Herijkt (Fase 11 uit het instructieplan) op Jans eigen 22 echte foto's: bij de
// oude drempel van 0.55 bleven velden met 0.55-0.65 confidence ongemarkeerd
// terwijl die in de praktijk maar ~66% van de tijd klopten (net zo onbetrouwbaar
// als de al wél gemarkeerde velden eronder). Vanaf 0.65 lag de nauwkeurigheid
// duidelijk hoger en stabieler (~90%). Naarmate het correctielogboek groeit, kan
// deze drempel opnieuw tegen het licht gehouden worden.
export const CONFIDENCE_THRESHOLD = 0.65;
