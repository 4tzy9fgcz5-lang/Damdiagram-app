import { computeHomography, applyHomography } from "./homography.js?v=20260925d";

// Zoekt de vier echte hoeken van een dambordpatroon rond een grove beginschatting.
// Bedoeld voor de bulk-import: daar levert `detectMultiBoard.js` een rechte
// rechthoek rond een "donkere vlek", die bij een schuin genomen foto te ruim is,
// en die een nummer of onderschrift vlak bij het bord meepakt (waardoor het raster
// een rij verschuift). Hier wordt niet uit de vlek afgeleid, maar direct gezocht
// naar de vier hoeken waarbij het 10x10-raster het best op het patroon past.
//
// Maat voor "past goed" (`patternContrast`): een dambord heeft licht en donker in
// een vaste afwisseling — het speelveld (donker) staat op de plekken waar rij+kolom
// oneven is (veld 1 = rij 0, kolom 1). Per raster-cel nemen we het gemiddelde van
// 5x5 punten die bijna de hele cel beslaan (zo wordt een verschuiving van een paar
// procent van een cel al zichtbaar: dan raakt een lichte randcel het donkere kader of
// de buurcel), en dan is de maat: afgeknot gemiddelde van de lichte cellen
// min dat van de donkere cellen. Afgeknot (10% weg aan beide kanten), want tot 40% van
// de donkere velden kan een schijf bevatten. Die maat is maximaal als het raster precies op de velden
// ligt, zakt naar 0 bij een halve cel verschuiving, wordt NEGATIEF bij een hele cel
// (dan valt licht op donker) — dus het verschuiven van het raster met een rij, wat
// bij randdetectie zo lastig te onderscheiden is, wordt hier direct afgestraft —
// en lager als een deel van het raster buiten het bord valt (papier, tekst).
//
// Daarna zoekt een patroonzoektocht (kleine stapjes, van grof naar fijn) de hoeken
// die de maat maximaliseren. Alleen de patroon-maat wordt gebruikt, geen
// randdetectie: daardoor maakt het niet uit of het bord een dikke, dunne of geen
// lijst heeft, en ook niet of er tekst vlak naast staat.

const CELL_SAMPLE_OFFSETS = [-0.4, -0.2, 0, 0.2, 0.4];
const UNIT_GRID = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

function sample(gray, w, h, x, y) {
  const xc = Math.min(w - 1.001, Math.max(0, x));
  const yc = Math.min(h - 1.001, Math.max(0, y));
  const x0 = Math.floor(xc);
  const y0 = Math.floor(yc);
  const fx = xc - x0;
  const fy = yc - y0;
  const i = y0 * w + x0;
  return (gray[i] * (1 - fx) + gray[i + 1] * fx) * (1 - fy) + (gray[i + w] * (1 - fx) + gray[i + w + 1] * fx) * fy;
}

// Gemiddelde na weglaten van de 10% laagste en 10% hoogste waarden: nog steeds bestand
// tegen een paar schijven (die een donkere cel licht maken), maar — anders dan een
// mediaan — merkbaar minder goed als 20% van het raster naast het bord valt.
function trimmedMean(values) {
  const sorted = Float64Array.from(values).sort();
  const cut = Math.floor(sorted.length * 0.1);
  let sum = 0;
  for (let i = cut; i < sorted.length - cut; i++) sum += sorted[i];
  return sum / (sorted.length - 2 * cut);
}

const light = new Float64Array(50);
const dark = new Float64Array(50);

// Gemiddelde van de 5x5 punten per cel voor alle 100 cellen; vult `light`/`dark`.
function cellMeans(gray, w, h, quad, offsets = CELL_SAMPLE_OFFSETS) {
  let H;
  try {
    H = computeHomography(UNIT_GRID, quad);
  } catch {
    return false;
  }
  let nl = 0;
  let nd = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      let sum = 0;
      for (const dy of offsets) {
        for (const dx of offsets) {
          const p = applyHomography(H, c + 0.5 + dx, r + 0.5 + dy);
          sum += sample(gray, w, h, p.x, p.y);
        }
      }
      const mean = sum / (offsets.length * offsets.length);
      if ((r + c) % 2 === 1) dark[nd++] = mean;
      else light[nl++] = mean;
    }
  }
  return true;
}

// Hoger = past beter. quad = [TL, TR, BR, BL] in pixels van `gray`.
export function patternContrast(gray, w, h, quad, offsets) {
  if (!cellMeans(gray, w, h, quad, offsets)) return -Infinity;
  return trimmedMean(light) - trimmedMean(dark);
}

// Schaalvrije tweede maat: de kans dat een willekeurige lichte cel lichter is dan een
// willekeurige donkere cel (0,5 = geen patroon, 1 = elke lichte cel is lichter dan
// elke donkere). Een echt bord, ook een vaag gedrukt, ligt ruim boven 0,9; een stuk
// tekst, een hand of een foto ruim eronder.
export function patternSeparation(gray, w, h, quad) {
  if (!cellMeans(gray, w, h, quad)) return 0;
  let wins = 0;
  for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) if (light[i] > dark[j]) wins++;
  return wins / 2500;
}

// Randsterkte (Sobel) van de foto.
function gradientMagnitude(gray, w, h) {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - (gray[i - w - 1] + 2 * gray[i - 1] + gray[i + w - 1]);
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1]);
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

// Gemiddelde randsterkte langs de vier zijden van de vierhoek (±1 pixel speling): het
// echte bord heeft daar een lijn (de rand of de overgang patroon-papier), een ten
// onrechte opgeschoven kader ligt op het papier of midden in het patroon.
function boundaryEnergy(mag, w, h, quad) {
  const STEPS = 60;
  let sum = 0;
  let count = 0;
  for (let e = 0; e < 4; e++) {
    const a = quad[e];
    const b = quad[(e + 1) % 4];
    for (let k = 1; k < STEPS; k++) {
      const x = a.x + ((b.x - a.x) * k) / STEPS;
      const y = a.y + ((b.y - a.y) * k) / STEPS;
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xi = Math.round(x) + dx;
          const yi = Math.round(y) + dy;
          if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
          const v = mag[yi * w + xi];
          if (v > best) best = v;
        }
      }
      sum += best;
      count++;
    }
  }
  return sum / count;
}

function quadArea(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// Een geldige vierhoek: convex (alle kruisproducten dezelfde kant op).
function isConvex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function shrunk(q, fraction) {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  return q.map((p) => ({ x: cx + (p.x - cx) * (1 - fraction), y: cy + (p.y - cy) * (1 - fraction) }));
}

const STEPS = [0.04, 0.02, 0.01, 0.005, 0.0025]; // als deel van de zijde van het bord
const TIE_FRACTION = 0.92; // oplossingen met minstens dit deel van de beste score doen mee
const MAX_PASSES = 14;
const MAX_DRIFT = 0.2; // een hoek mag niet verder dan dit deel van de zijde van zijn beginplek (standaard)
const MIN_AREA = 0.45;
const MAX_AREA = 1.6;

// Verplaatsingen: elke hoek los (8) en elke zijde als geheel (4).
const MOVES = [
  ...[0, 1, 2, 3].flatMap((i) => [[[i, 1, 0]], [[i, -1, 0]], [[i, 0, 1]], [[i, 0, -1]]]),
  [[0, 0, 1], [1, 0, 1]], [[0, 0, -1], [1, 0, -1]], // bovenrand omlaag/omhoog
  [[3, 0, 1], [2, 0, 1]], [[3, 0, -1], [2, 0, -1]], // onderrand
  [[0, 1, 0], [3, 1, 0]], [[0, -1, 0], [3, -1, 0]], // linkerrand
  [[1, 1, 0], [2, 1, 0]], [[1, -1, 0], [2, -1, 0]], // rechterrand
];

function climb(gray, w, h, start, initial, side, maxDrift, mag = null, edgeWeight = 0) {
  const objective = (q) => patternContrast(gray, w, h, q) + (edgeWeight ? edgeWeight * weakestSideEnergy(mag, w, h, q) : 0);
  let best = start;
  let bestScore = objective(best);
  const initialArea = quadArea(initial);
  for (const stepFraction of STEPS) {
    const step = stepFraction * side;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let improved = false;
      for (const move of MOVES) {
        const trial = best.map((p) => ({ ...p }));
        for (const [i, dx, dy] of move) {
          trial[i].x += dx * step;
          trial[i].y += dy * step;
        }
        let ok = true;
        for (let i = 0; i < 4 && ok; i++) {
          if (Math.hypot(trial[i].x - initial[i].x, trial[i].y - initial[i].y) > maxDrift * side) ok = false;
        }
        if (!ok || !isConvex(trial)) continue;
        const area = quadArea(trial) / initialArea;
        if (area < MIN_AREA || area > MAX_AREA) continue;
        const score = objective(trial);
        if (score > bestScore + 1e-6) {
          best = trial;
          bestScore = score;
          improved = true;
        }
      }
      if (!improved) break;
    }
  }
  return { corners: best, score: bestScore };
}

// Vervaagt een kaart met een gemiddelde over (2r+1)x(2r+1) (twee keer, dus een zachte
// klok). Voor de grove scan: de randsterkte van een dunne lijn is anders alleen zichtbaar
// als het venster op een paar pixels nauwkeurig ligt.
function boxBlur(src, w, h, r) {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / (2 * r + 1);
        sum += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    const out = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    a = out;
  }
  return a;
}

// Zoals boundaryEnergy, maar geeft de ZWAKSTE van de vier zijden terug: een kader dat aan
// één kant op het patroon (of het papier) ligt in plaats van op de rand van het bord,
// valt dan meteen op.
function weakestSideEnergy(mag, w, h, quad) {
  const STEPS = 50;
  let weakest = Infinity;
  for (let e = 0; e < 4; e++) {
    const a = quad[e];
    const b = quad[(e + 1) % 4];
    let sum = 0;
    for (let k = 1; k < STEPS; k++) {
      const x = a.x + ((b.x - a.x) * k) / STEPS;
      const y = a.y + ((b.y - a.y) * k) / STEPS;
      sum += neighbourhoodMax(mag, w, h, x, y);
    }
    weakest = Math.min(weakest, sum / (STEPS - 1));
  }
  return weakest;
}

// --- Fijnafstelling op de rasterlijnen ------------------------------------------------
// De patroonmaat (hierboven) is glad en vindt betrouwbaar het bord, maar is rond de
// juiste plek vrij vlak, zeker bij vaag gedrukte borden. Daarom een laatste, kleine
// afstelling op een scherpere maat: op de 11+11 rasterlijnen (rand meegeteld) moet
// veel randsterkte zitten, en halverwege twee lijnen (in het midden van de velden) niet.
// Alleen kleine verplaatsingen, en de patroonmaat mag er niet door zakken.

const LINE_SAMPLES = 40;

function neighbourhoodMax(mag, w, h, x, y) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  let best = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = yi + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = xi + dx;
      if (xx < 0 || xx >= w) continue;
      const v = mag[yy * w + xx];
      if (v > best) best = v;
    }
  }
  return best;
}

function gridLineScore(mag, w, h, quad) {
  let H;
  try {
    H = computeHomography(UNIT_GRID, quad);
  } catch {
    return -Infinity;
  }
  let onSum = 0;
  let onCount = 0;
  let offSum = 0;
  let offCount = 0;
  for (const vertical of [true, false]) {
    for (let k = 0; k <= 10; k++) {
      for (const half of [false, true]) {
        if (half && k === 10) continue;
        const pos = k + (half ? 0.5 : 0);
        let sum = 0;
        for (let i = 0; i < LINE_SAMPLES; i++) {
          const t = 0.5 + ((i + 0.5) * 9) / LINE_SAMPLES;
          const p = vertical ? applyHomography(H, pos, t) : applyHomography(H, t, pos);
          sum += neighbourhoodMax(mag, w, h, p.x, p.y);
        }
        if (half) {
          offSum += sum / LINE_SAMPLES;
          offCount++;
        } else {
          onSum += sum / LINE_SAMPLES;
          onCount++;
        }
      }
    }
  }
  return onSum / onCount / (offSum / offCount + 1e-6);
}

const POLISH_STEPS = [0.02, 0.01, 0.005, 0.0025];
const POLISH_MAX_DRIFT = 0.12; // van de zijde, t.o.v. het resultaat van de grove zoektocht
const POLISH_KEEP_CONTRAST = 0.85;

function polish(gray, mag, w, h, start, side) {
  const baseContrast = patternContrast(gray, w, h, start);
  let best = start;
  let bestScore = gridLineScore(mag, w, h, best);
  for (const stepFraction of POLISH_STEPS) {
    const step = stepFraction * side;
    for (let pass = 0; pass < 10; pass++) {
      let improved = false;
      for (const move of MOVES) {
        const trial = best.map((p) => ({ ...p }));
        for (const [i, dx, dy] of move) {
          trial[i].x += dx * step;
          trial[i].y += dy * step;
        }
        let ok = true;
        for (let i = 0; i < 4 && ok; i++) {
          if (Math.hypot(trial[i].x - start[i].x, trial[i].y - start[i].y) > POLISH_MAX_DRIFT * side) ok = false;
        }
        if (!ok || !isConvex(trial)) continue;
        const score = gridLineScore(mag, w, h, trial);
        if (score <= bestScore + 1e-4) continue;
        if (patternContrast(gray, w, h, trial) < POLISH_KEEP_CONTRAST * baseContrast) continue;
        best = trial;
        bestScore = score;
        improved = true;
      }
      if (!improved) break;
    }
  }
  return best;
}

// imageData: { data, width, height } (RGBA); initialQuad: [TL, TR, BR, BL] in dezelfde
// pixels. Geeft { corners, score, startScore, separation } terug; score is de
// patroon-maat in grijswaarden (hoger = duidelijker dambordpatroon), separation de
// schaalvrije tweede maat (zie patternSeparation).
// opties: drift = hoe ver een hoek van zijn beginplek mag komen (deel van de zijde);
// shifts = ook beginposities proberen die een stuk verschoven zijn (voor een grove
// beginschatting, bv. een zoekvenster in plaats van een gevonden vlek).
export function fitBoardQuad(imageData, initialQuad, { drift = MAX_DRIFT, shifts = false, edgeWeight = 0 } = {}) {
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const side = Math.sqrt(quadArea(initialQuad));
  const startScore = patternContrast(gray, w, h, initialQuad);
  const starts = [0, 0.04, 0.08, 0.12].map((inset) => (inset ? shrunk(initialQuad, inset) : initialQuad));
  if (shifts) {
    for (const dx of [-0.12, 0, 0.12]) {
      for (const dy of [-0.12, 0, 0.12]) {
        if (dx || dy) starts.push(initialQuad.map((p) => ({ x: p.x + dx * side, y: p.y + dy * side })));
      }
    }
  }
  const mag = gradientMagnitude(gray, w, h);
  const results = starts.map((start) => climb(gray, w, h, start, initialQuad, side, drift, mag, edgeWeight));
  const top = Math.max(...results.map((r) => r.score));
  // Van de bijna-even-goede oplossingen: die met het kader op een echte lijn.
  let best = null;
  let bestEdge = -1;
  for (const r of results) {
    if (r.score < TIE_FRACTION * top) continue;
    const edge = boundaryEnergy(mag, w, h, r.corners);
    if (edge > bestEdge) {
      bestEdge = edge;
      best = r;
    }
  }
  // De "geruitheid" wordt vóór de fijnafstelling gemeten: die zoekt de rasterlijnen op
  // en zou bij tekst of een foto de maat kunstmatig kunnen opkrikken.
  const separation = patternSeparation(gray, w, h, best.corners);
  const corners = polish(gray, mag, w, h, best.corners, side);
  return { corners, score: patternContrast(gray, w, h, corners), startScore, separation, edge: boundaryEnergy(mag, w, h, corners), weakSide: weakestSideEnergy(mag, w, h, corners) };
}

// --- Ontbrekende borden zoeken --------------------------------------------------------
// De gewone zoektocht (detectMultiBoard.js) mist soms een bord, bijvoorbeeld als het
// aan de donkere rug van het boek vastzit. Borden op een pagina staan in rijen en
// kolommen en zijn even groot: uit de gevonden borden bepalen we de kolommen en de
// rijen, en op elk leeg kruispunt proberen we een bord te passen (`fitBoardQuad`,
// met ruime speling). Alleen als het resultaat duidelijk een dambordpatroon is
// (`patternSeparation`) en even groot als de andere, wordt het toegevoegd.

// Lager dan bij een vrije zoektocht mag, want het kruispunt is al voorspeld door de rijen/
// kolommen van de andere borden; tekst en foto's scoorden hooguit 0,62, vaag gedrukte
// echte borden minstens 0,71.
const MISSING_MIN_SEPARATION = 0.68;
const MISSING_MIN_CONTRAST = 0.4; // van het gemiddelde contrast van de gevonden borden
const MISSING_SIZE_RANGE = [0.75, 1.35]; // t.o.v. de gebruikelijke zijde

function bbox(q) {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function overlapFraction(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
  return (w * h) / smaller;
}

// Groepeert getallen die dicht bij elkaar liggen; geeft per groep het gemiddelde.
function clusterCenters(values, tolerance) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups = [];
  for (const v of sorted) {
    const last = groups[groups.length - 1];
    if (last && v - last[last.length - 1] <= tolerance) last.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
}

const rectQuad = (cx, cy, size) => [
  { x: cx - size / 2, y: cy - size / 2 },
  { x: cx + size / 2, y: cy - size / 2 },
  { x: cx + size / 2, y: cy + size / 2 },
  { x: cx - size / 2, y: cy + size / 2 },
];

// imageData: de hele pagina (bij voorkeur op max. ~1000px); found: al gevonden vierhoeken
// in dezelfde pixels. Geeft nieuwe borden terug als [{ corners, score, separation }].
export function findMissingBoards(imageData, found, debug = null) {
  if (found.length < 2) return [];
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const sides = found.map((q) => Math.sqrt(quadArea(q))).sort((a, b) => a - b);
  const refSide = sides[Math.floor(sides.length / 2)];
  const contrasts = found.map((q) => patternContrast(gray, w, h, q));
  const minContrast = (MISSING_MIN_CONTRAST * contrasts.reduce((s, v) => s + v, 0)) / contrasts.length;
  if (!(minContrast > 0)) return [];

  const centers = found.map((q) => ({
    x: q.reduce((s, p) => s + p.x, 0) / 4,
    y: q.reduce((s, p) => s + p.y, 0) / 4,
  }));
  const columns = clusterCenters(centers.map((c) => c.x), 0.6 * refSide);
  const rows = clusterCenters(centers.map((c) => c.y), 0.6 * refSide);
  const taken = found.map(bbox);

  const result = [];
  for (const cy of rows) {
    for (const cx of columns) {
      if (centers.some((c) => Math.hypot(c.x - cx, c.y - cy) < 0.7 * refSide)) continue;
      const half = refSide / 2;
      if (cx - half < -0.1 * refSide || cy - half < -0.1 * refSide || cx + half > w + 0.1 * refSide || cy + half > h + 0.1 * refSide) continue;
      const fit = fitBoardQuad(imageData, rectQuad(cx, cy, refSide), { drift: 0.35, shifts: true });
      const fitSide = Math.sqrt(quadArea(fit.corners));
      debug?.push({ cx, cy, sep: fit.separation, score: fit.score, minContrast, sizeRatio: fitSide / refSide });
      if (fit.separation < MISSING_MIN_SEPARATION || fit.score < minContrast) continue;
      if (fitSide < MISSING_SIZE_RANGE[0] * refSide || fitSide > MISSING_SIZE_RANGE[1] * refSide) continue;
      const box = bbox(fit.corners);
      if (taken.some((t) => overlapFraction(box, t) > 0.25)) continue;
      result.push({ corners: fit.corners, score: fit.score, separation: fit.separation });
      taken.push(box);
    }
  }
  return result;
}

// --- Het bord in het midden van een losse foto zoeken --------------------------------
// Bij een foto van één diagram staat het bedoelde bord meestal in het midden, maar er
// kan een stuk van een ander diagram (of van meerdere) naast, boven of onder staan. De
// oude aanpak (de grootste donkere vlek) pakt dan al snel de verkeerde vlek of een
// stuk van twee borden samen. Hier: schuif vierkante vensters van verschillende grootte
// rond het midden van de foto, kijk welke het best op een dambordpatroon lijken (een
// venster dat half over twee borden ligt past niet: de afwisseling licht/donker klopt
// dan niet), maak de beste hoek voor hoek nauwkeurig met `fitBoardQuad`, en kies
// daarvan het bord dat het dichtst bij het midden ligt.

const CENTER_SIZES = Array.from({ length: 14 }, (_, i) => 0.35 + i * 0.05); // van de kortste zijde van de foto (0,35 t/m 1,0)
const CENTER_SHIFTS = Array.from({ length: 9 }, (_, i) => -0.25 + i * 0.0625); // van de kortste zijde
const CENTER_COARSE_CANDIDATES = 24; // krijgen een fijne scan
const CENTER_TOP_CANDIDATES = 8; // van de verfijnde krijgen de beste een nauwkeurige fit
// Randsterkte telt mee in de zoektocht (schaal: contrast in grijswaarden, randsterkte in
// Sobel-eenheden, ruim 3x zo groot): een schaduw over een deel van de foto trekt het
// contrast-optimum scheef, de rand van het bord niet.
const CENTER_EDGE_WEIGHT = 0.5;
const CENTER_MIN_SEPARATION = 0.7;
const CENTER_MIN_CONTRAST = 10;
const CENTER_CONTRAST_FRACTION = 0.6; // kandidaten met minstens dit deel van het beste contrast doen mee

// Geeft { corners, score, separation } terug, of null als er geen duidelijk bord is.
export function findCenterBoard(imageData, debug = null) {
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const mag = gradientMagnitude(gray, w, h);
  const softMag = boxBlur(mag, w, h, Math.max(3, Math.round(0.012 * Math.max(w, h))));
  // Grove scan: met de vervaagde randkaart (ruime marge); fijne scan en fit: de scherpe.
  const coarseObjective = (quad) =>
    patternContrast(gray, w, h, quad, [-0.3, 0, 0.3]) + CENTER_EDGE_WEIGHT * weakestSideEnergy(softMag, w, h, quad);
  const objective = (quad) =>
    patternContrast(gray, w, h, quad, [-0.3, 0, 0.3]) + CENTER_EDGE_WEIGHT * weakestSideEnergy(mag, w, h, quad);
  const m = Math.min(w, h);
  const hits = [];
  for (const f of CENTER_SIZES) {
    const size = f * m;
    for (const dx of CENTER_SHIFTS) {
      for (const dy of CENTER_SHIFTS) {
        const cx = w / 2 + dx * m;
        const cy = h / 2 + dy * m;
        if (cx - size / 2 < -0.03 * m || cy - size / 2 < -0.03 * m || cx + size / 2 > w + 0.03 * m || cy + size / 2 > h + 0.03 * m) continue;
        hits.push({ cx, cy, size, score: coarseObjective(rectQuad(cx, cy, size)) });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const hit of hits) {
    if (picked.length >= CENTER_COARSE_CANDIDATES) break;
    if (picked.some((p) => Math.hypot(p.cx - hit.cx, p.cy - hit.cy) < 0.2 * hit.size && Math.abs(p.size - hit.size) < 0.2 * hit.size)) continue;
    picked.push(hit);
  }
  // Het patroon-contrast piekt binnen een halve cel van de juiste plek, dus de grove scan
  // (stappen van 6% van de foto) mist het echte bord makkelijk op net te veel afstand.
  // Rond elke kandidaat daarom een fijne scan (stappen van 1,25% van het venster).
  const refined = picked.map((hit) => {
    let best = { ...hit, score: objective(rectQuad(hit.cx, hit.cy, hit.size)) };
    for (const zoom of [0.94, 1, 1.06]) {
      const size = hit.size * zoom;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const cx = hit.cx + i * 0.0125 * hit.size;
          const cy = hit.cy + j * 0.0125 * hit.size;
          const score = objective(rectQuad(cx, cy, size));
          if (score > best.score) best = { cx, cy, size, score };
        }
      }
    }
    return best;
  });
  refined.sort((a, b) => b.score - a.score);
  const finalists = [];
  for (const hit of refined) {
    if (finalists.length >= CENTER_TOP_CANDIDATES) break;
    if (finalists.some((p) => Math.hypot(p.cx - hit.cx, p.cy - hit.cy) < 0.1 * hit.size && Math.abs(p.size - hit.size) < 0.1 * hit.size)) continue;
    finalists.push(hit);
  }
  const fits = [];
  for (const hit of finalists) {
    const fit = fitBoardQuad(imageData, rectQuad(hit.cx, hit.cy, hit.size), { drift: 0.25, edgeWeight: CENTER_EDGE_WEIGHT });
    if (fit.separation < CENTER_MIN_SEPARATION || fit.score < CENTER_MIN_CONTRAST) continue;
    fits.push(fit);
  }
  debug?.push({ picked: finalists, fits: fits.map((f) => ({ corners: f.corners.map((p) => [Math.round(p.x), Math.round(p.y)]), score: f.score, sep: f.separation, edge: f.edge, weakSide: f.weakSide })) });
  if (!fits.length) return null;
  // Een bord dat twee of vier velden verschoven ligt (of half over het buurdiagram) heeft
  // bijna hetzelfde patroon-contrast als het echte, omdat de buren "in de pas" liggen.
  // Wat het echte bord onderscheidt: er zit een lijn (de rand) om het kader heen, en
  // het patroon klopt over het hele kader. Daarom kiezen op randsterkte x geruitheid.
  const best = Math.max(...fits.map((f) => f.score));
  const contenders = fits.filter((f) => f.score >= CENTER_CONTRAST_FRACTION * best);
  const chosen = contenders.reduce((a, b) => (b.weakSide * b.separation > a.weakSide * a.separation ? b : a));
  return { corners: chosen.corners, score: chosen.score, separation: chosen.separation };
}

// Meetwaarden van één vierhoek op een foto (voor onderzoek/afstemmen): patroonmaat,
// geruitheid en gemiddelde randsterkte langs het kader.
export function quadDiagnostics(imageData, quad) {
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const mag = gradientMagnitude(gray, w, h);
  return {
    score: patternContrast(gray, w, h, quad),
    separation: patternSeparation(gray, w, h, quad),
    edge: boundaryEnergy(mag, w, h, quad),
    weakSide: weakestSideEnergy(mag, w, h, quad),
    lineScore: gridLineScore(mag, w, h, quad),
  };
}
