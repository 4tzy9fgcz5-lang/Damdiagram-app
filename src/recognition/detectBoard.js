import { computeHomography, applyHomography, warpPerspective } from "./homography.js?v=20260920t";

// Automatische hoekdetectie van het dambord op een foto — zonder externe
// bibliotheken (de app blijft een platte, server-loze website). Gevalideerd
// buiten de app (Python-prototype op 81 echte testfoto's, ~80-90% raak) vóór
// deze overzetting.
//
// Twee stappen:
//   1. De buitenrand vinden: het bord heeft in vrijwel elke boekstijl een
//      opvallende, dikke zwarte buitenrand. Die rand is de grootste
//      samenhangende "donkere" vorm op de foto (groter dan een los stuk),
//      gevonden via: grijswaarden -> Otsu-drempel (donker/licht) -> dilatatie
//      (randjes verbinden) -> samenhangende vlekken zoeken -> de vlek met de
//      grootste bounding-box -> convex hull van die vlek -> kleinst
//      omvattende (eventueel scheve) rechthoek (rotating calipers) als de 4
//      hoeken.
//   2. Die rand (indien aanwezig) wegsnijden tot het echte dambordpatroon
//      erbinnen (`stripBorderToPlayfield()`) — bij boeken met een dikke rand
//      is "de grootste donkere vlek" uit stap 1 namelijk de rand zelf, niet
//      het patroon erbinnen. Dat gaf in de praktijk een verkeerd afgesteld
//      raster en foute schijfherkenning, vooral op de buitenste velden.
//      Primair: de zwarte rand is een egaal donkere band langs de rand van het
//      rechtgetrokken beeld; de gemiddelde helderheid per rij/kolom springt
//      aan de binnenkant ervan steil omhoog (`findDarkBandInnerEdge()`) — dat
//      werkt ook op donkere/vage foto's. Terugval (geen duidelijk donkere band,
//      bijvoorbeeld een dunne of lichte lijst): een grove gekoppelde schatting
//      van celbreedte + startpositie uit het randsterkte-projectieprofiel
//      (`findGridAxisRough()`), per kant gepreciseerd naar de dichtstbijzijnde
//      echte rand-naar-patroon-piek (`refineEdge()`).
//      Mislukte eerdere pogingen (2026-09-20): per-rij/kolom-variantie (ruis in de
//      rand telde als patroon), en een breed zoekende gridRefine-achtige zoektocht
//      (periodieke aliasing). Ook bleek puur de sterkste randpiek kiezen niet te
//      werken: de buitenkant van de rand (papier -> rand) is vaak sterker dan de
//      binnenkant (rand -> patroon).
//      Werkt samen met de kleine na-correctie van `gridRefine.js` (die daarna, na
//      het rechttrekken, nog een laatste restfout — met name een kleine
//      restrotatie — wegpoetst).
//
// Geeft null terug als er niets overtuigends gevonden wordt — de aanroeper valt
// dan terug op de bestaande, vaste standaardhoeken (12% marge).

const WORKING_SIZE = 700;

function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

function otsuThreshold(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[Math.min(255, Math.max(0, gray[i] | 0))]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumBg = 0;
  let weightBg = 0;
  let bestThreshold = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    weightBg += hist[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const betweenVariance = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (betweenVariance > bestVariance) {
      bestVariance = betweenVariance;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

function dilate(mask, width, height, iterations) {
  let current = mask;
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (current[idx]) {
          next[idx] = 1;
          continue;
        }
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (current[ny * width + nx]) {
              hit = 1;
              break;
            }
          }
        }
        next[idx] = hit;
      }
    }
    current = next;
  }
  return current;
}

// Zoekt de samenhangende "donkere" vlek die het best op de buitenrand van een
// bord lijkt: een grote bounding-box, min-of-meer vierkant, en niet de (bijna)
// hele foto beslaand.
function largestComponentByBBox(mask, width, height, minPixels) {
  const visited = new Uint8Array(width * height);
  const imgArea = width * height;
  let best = null;
  let bestScore = -1;

  const stackX = new Int32Array(imgArea);
  const stackY = new Int32Array(imgArea);

  for (let y0 = 0; y0 < height; y0++) {
    for (let x0 = 0; x0 < width; x0++) {
      const start = y0 * width + x0;
      if (!mask[start] || visited[start]) continue;

      let sp = 0;
      stackX[sp] = x0;
      stackY[sp] = y0;
      sp++;
      visited[start] = 1;

      let minx = x0, maxx = x0, miny = y0, maxy = y0, count = 0;
      const points = [];

      while (sp > 0) {
        sp--;
        const x = stackX[sp];
        const y = stackY[sp];
        count++;
        if (count % 7 === 0) points.push([x, y]);
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;

        const neighbors = [
          [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1],
        ];
        for (const [ny, nx] of neighbors) {
          if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            stackX[sp] = nx;
            stackY[sp] = ny;
            sp++;
          }
        }
      }

      if (count < minPixels) continue;
      const bboxW = maxx - minx;
      const bboxH = maxy - miny;
      if (bboxW < 1 || bboxH < 1) continue;
      const aspect = bboxW / bboxH;
      if (aspect < 0.55 || aspect > 1.8) continue;
      const bboxArea = bboxW * bboxH;
      if (bboxArea > imgArea * 0.98 || bboxArea < imgArea * 0.1) continue;

      if (bboxArea > bestScore) {
        bestScore = bboxArea;
        points.push([minx, miny], [maxx, miny], [minx, maxy], [maxx, maxy]);
        best = points;
      }
    }
  }
  return best;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points) {
  const unique = Array.from(new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values());
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length <= 2) return unique;

  const lower = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Kleinst omvattende (eventueel scheve) rechthoek om een convexe veelhoek heen
// ("rotating calipers"): voor elke rand van de hull, de bounding box uitgelijnd
// met die rand — de kleinste van die bounding boxes wint.
function minAreaRect(hull) {
  const n = hull.length;
  if (n < 3) return null;
  let bestArea = Infinity;
  let bestCorners = null;

  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of hull) {
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      if (rx < minx) minx = rx;
      if (rx > maxx) maxx = rx;
      if (ry < miny) miny = ry;
      if (ry > maxy) maxy = ry;
    }
    const area = (maxx - minx) * (maxy - miny);
    if (area < bestArea) {
      bestArea = area;
      const cs = Math.cos(angle);
      const ss = Math.sin(angle);
      const corners = [
        [minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy],
      ];
      bestCorners = corners.map(([x, y]) => [x * cs - y * ss, x * ss + y * cs]);
    }
  }
  return bestCorners;
}

function orderCorners(pts) {
  const byY = [...pts].sort((a, b) => a[1] - b[1]);
  const top2 = byY.slice(0, 2).sort((a, b) => a[0] - b[0]);
  const bot2 = byY.slice(2).sort((a, b) => a[0] - b[0]);
  return [top2[0], top2[1], bot2[1], bot2[0]]; // TL, TR, BR, BL
}

// Zuivere rekenkern, los van canvas/DOM — neemt gewoon een { data, width,
// height }-achtig object (net als ImageData) en geeft de 4 hoeken terug in
// diezelfde (mogelijk verkleinde) pixel-coördinaten, of null. Apart gehouden van
// detectBoardCorners() zodat dit los te testen is (bijvoorbeeld met een
// Python-nabouwsel, zonder dat daar een browser/canvas voor nodig is).
export function detectCornersFromImageData(imageData, width, height) {
  const gray = toGrayscale(imageData);
  const threshold = otsuThreshold(gray);
  let mask = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < threshold ? 1 : 0;
  mask = dilate(mask, width, height, 2);

  const minPixels = Math.max(50, Math.round(width * height * 0.002));
  const points = largestComponentByBBox(mask, width, height, minPixels);
  if (!points || points.length < 3) return null;

  const hull = convexHull(points);
  if (hull.length < 3) return null;

  const rect = minAreaRect(hull);
  if (!rect) return null;

  const ordered = orderCorners(rect);
  return ordered.map(([x, y]) => ({ x, y }));
}

// Sobel-gradiëntsterkte — zelfde kern als gridRefine.js (bewust gedupliceerd,
// niet gedeeld: dit bestand kent geen afhankelijkheid van gridRefine.js, en dat
// is hier ook niet nodig, het gaat om exact dezelfde, kleine berekening).
function gradientMagnitude(gray, w, h) {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

// Randsterkte opgeteld per kolom/rij ("projectieprofiel"): een echte rasterlijn
// van het schaakbordpatroon geeft op praktisch elke rij (resp. kolom) een randje,
// dus die kolom/rij krijgt een hoge som — veel hoger dan het toevallige randje van
// één stuk of wat drukruis in de rand, die maar op een klein stukje van de
// kolom/rij bijdraagt. Dat maakt dit ongevoeliger voor ruis dan per-rij/kolom-
// variantie (de eerdere aanpak, die bij een niet-effen rand — bijvoorbeeld met wat
// drukstructuur — de rand ten onrechte al als "patroon" herkende).
function colProfile(mag, w, h) {
  const out = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < h; y++) sum += mag[y * w + x];
    out[x] = sum;
  }
  return out;
}
function rowProfile(mag, w, h) {
  const out = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const base = y * w;
    for (let x = 0; x < w; x++) sum += mag[base + x];
    out[y] = sum;
  }
  return out;
}
function sampleProfile(profile, size, x) {
  const xi = Math.round(x);
  if (xi < 0 || xi >= size) return 0;
  return profile[xi];
}

// Zoekt langs één as, gekoppeld, de celbreedte + startpositie die de 9 interne
// rasterlijnen samen het best laat samenvallen met randen — een grove, maar
// betrouwbare schatting van waar het patroon ongeveer begint en hoe breed een cel
// is. Dient als anker voor `refineEdge()` hierna, die per kant apart de exacte
// randpositie preciseert — deze gekoppelde schatting alleen is namelijk niet
// nauwkeurig genoeg: bij bijna gelijk scorende posities (denk aan een rand die
// net zo goed op de 9 lijnen scoort als het echte patroon) kiest deze simpelweg
// de eerst gevonden beste, zonder voorkeur voor de kant die het dichtst op het
// patroon zelf zit.
function findGridAxisRough(profile, size) {
  let best = null;
  let bestScore = -1;
  const spacingMin = (size / 10) * 0.72;
  const spacingMax = (size / 10) * 1.02;
  // Van groot naar klein: een rand kan het bord alleen maar kleiner laten lijken
  // dan het echt is, nooit groter. Bij twee kandidaten die het patroon ongeveer
  // even goed oppikken geeft dat de voorkeur aan de grootste spacing (zo min
  // mogelijk wegsnijden) — een kleinere spacing wordt alleen gekozen als die
  // duidelijk (>3%) beter scoort, niet bij een marginaal verschil (voorkomt
  // toevalstreffers op een erg regelmatig bord).
  for (let spacing = spacingMax; spacing >= spacingMin; spacing -= 0.5) {
    const offsetMax = Math.min(size * 0.2, size - spacing * 10);
    let bestForSpacing = null;
    let bestScoreForSpacing = -1;
    for (let offset = 0; offset <= offsetMax; offset += 1) {
      let score = 0;
      for (let k = 1; k <= 9; k++) score += sampleProfile(profile, size, offset + k * spacing);
      if (score > bestScoreForSpacing) {
        bestScoreForSpacing = score;
        bestForSpacing = { offset, spacing };
      }
    }
    if (bestForSpacing && bestScoreForSpacing > bestScore * 1.03) {
      bestScore = bestScoreForSpacing;
      best = bestForSpacing;
    }
  }
  return best;
}

// Verfijnt één rand (start of eind) rond de grove schatting: zoekt in een kleine
// marge daaromheen (`REFINE_RADIUS`) naar de positie met de sterkste ENKELVOUDIGE
// randsterkte — niet de opgetelde score van meerdere lijnen. De rand van het
// dambordpatroon (bordlijst-naar-patroon-overgang) is namelijk zelf al een
// opvallend sterke, geïsoleerde piek in het profiel (vaak sterker dan een gewone
// interne rasterlijn), dus die springt er in een kleine omgeving zo uit. Een
// kleine marge (in plaats van het hele profiel) voorkomt twee eerder geprobeerde
// mislukkingen: te ver wegzoeken naar een toevallig sterke piek ergens anders op
// de foto (zoals de rand aan de overkant, op dezelfde periodieke afstand), én de
// vervorming van de foto-rand zelf vlak bij x/y=0 of size (een sterk vervormingseffect
// van het rechttrekken zelf, geen echte bordrand). De marge is een deel van de
// celbreedte zelf (niet een vast deel van het beeld): bij een bord zonder rand
// (het patroon vult de buitenkant al) mag de zoektocht nooit zo ver komen dat hij
// per ongeluk een hele cel verderop, op een gewone interne rasterlijn, uitkomt.
const REFINE_RADIUS_CELL_FRACTION = 0.4;
// Op alle 4 kanten kan, als de hoeken uit stap 1 al vlak tegen de bordrand
// aanzaten, een extra, nóg sterkere randpiek vlak bij de uiterste rand van het
// (rechtgetrokken) beeld zitten: de papier-naar-rand-overgang, niet de
// rand-naar-patroon-overgang die we zoeken. `CANVAS_EDGE_MARGIN` houdt de
// uiterste paar pixels bij 0 én size daarom altijd buiten beschouwing.
const CANVAS_EDGE_MARGIN_FRACTION = 0.015;
// Is er in het zoekvenster geen echte piek (alles is ongeveer even vlak), dan is
// er niets om naartoe te verfijnen en blijft de grove schatting staan — dat
// gebeurt bij een bord zonder noemenswaardige rand, waar de patroonrand zelf al
// vlak tegen 0/size aan ligt, binnen de weggelaten marge.
const MIN_PEAK_OVER_BASELINE = 1.5;
// Alleen pieken van minstens dit deel van de sterkste piek in het venster tellen
// mee (het vlakke, zwarte binnenste van een rand heeft ook kleine ruispiekjes).
const MIN_PEAK_FRACTION = 0.25;
// Twee pieken gelden als gescheiden door een echte "vallei" (het vlakke, egale
// binnenste van de bordrand zelf) als het laagste punt ertussen onder dit deel
// van de zwakste van de twee blijft.
const VALLEY_RATIO = 0.55;

// Lokale pieken (hoogste punt binnen ±1) in [from, to], gelopen van `outer`
// (kant van het beeld) naar `inner` (richting het bord).
function findPeaks(profile, size, from, to, step) {
  const peaks = [];
  const at = (pos) => Math.max(
    sampleProfile(profile, size, pos - 1),
    sampleProfile(profile, size, pos),
    sampleProfile(profile, size, pos + 1),
  );
  for (let pos = from; step > 0 ? pos <= to : pos >= to; pos += step) {
    const val = at(pos);
    if (val >= at(pos - step) && val > at(pos + step)) peaks.push({ pos, val });
  }
  return peaks;
}

// Verfijnt één rand (start of eind) rond de grove schatting. Bij een rand om
// het bord zijn er langs de weg naar binnen twee overgangen: papier -> rand
// (buitenkant, vaak zelfs de sterkste piek) en rand -> patroon (wat we zoeken),
// met daartussen het vlakke, egale binnenste van de rand (lage randsterkte).
// Loopt daarom van buiten naar binnen: pieken die door zo'n lage vallei
// gescheiden zijn tellen als aparte overgangen (de binnenste wint); pieken zonder
// echte vallei ertussen horen bij dezelfde overgang (de sterkste wint). Zonder
// rand is er maar één overgang en verandert er niets.
function refineEdge(profile, size, roughPos, cellSpacing, fromStart) {
  const radius = cellSpacing * REFINE_RADIUS_CELL_FRACTION;
  const canvasEdgeMargin = size * CANVAS_EDGE_MARGIN_FRACTION;
  const from = Math.max(canvasEdgeMargin, roughPos - radius);
  const to = Math.min(size - canvasEdgeMargin, roughPos + radius);
  if (from > to) return roughPos;

  const step = fromStart ? 1 : -1;
  const outer = fromStart ? from : to;
  const inner = fromStart ? to : from;

  let minVal = Infinity;
  for (let pos = from; pos <= to; pos += 1) minVal = Math.min(minVal, sampleProfile(profile, size, pos));
  let peaks = findPeaks(profile, size, outer, inner, step);
  if (peaks.length === 0) return roughPos;
  const maxVal = Math.max(...peaks.map((p) => p.val));
  if (maxVal <= minVal * MIN_PEAK_OVER_BASELINE) return roughPos;
  peaks = peaks.filter((p) => p.val >= MIN_PEAK_FRACTION * maxVal);

  let current = peaks[0];
  for (let i = 1; i < peaks.length; i++) {
    const next = peaks[i];
    let valley = Infinity;
    for (let pos = current.pos; step > 0 ? pos <= next.pos : pos >= next.pos; pos += step) {
      valley = Math.min(valley, sampleProfile(profile, size, pos));
    }
    const separated = valley < VALLEY_RATIO * Math.min(current.val, next.val);
    if (separated || next.val > current.val) current = next;
  }
  return current.pos;
}

// Gemiddelde helderheid per kolom/rij van het rechtgetrokken beeld. Een dikke
// zwarte bordrand is een egaal donkere band langs de rand: veel donkerder dan het
// gemiddelde van een rij/kolom met schaakbordvelden (licht en donker afwisselend,
// plus stukken). Werkt dus ook op donkere/vage foto's, waar de rand-naar-patroon-
// overgang zelf maar een zwakke randpiek geeft.
function colMeans(gray, w, h) {
  const out = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < h; y++) sum += gray[y * w + x];
    out[x] = sum / h;
  }
  return out;
}
function rowMeans(gray, w, h) {
  const out = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += gray[y * w + x];
    out[y] = sum / w;
  }
  return out;
}

// Zoekt de binnenkant van een egaal donkere randband vanaf één kant: de plek
// waar de gemiddelde helderheid van "rand-donker" omhoog springt richting de
// helderheid van het bordpatroon. Geeft null als er aan die kant geen duidelijk
// donkere band is (geen rand, of een rand die niet donker genoeg afsteekt).
const DARK_BAND_MAX_FRACTION = 0.2;
const DARK_BAND_RATIO = 0.6;
const DARK_BAND_MIN_RISE = 0.25;
function findDarkBandInnerEdge(means, size, fromStart) {
  const at = (pos) => means[fromStart ? pos : size - 1 - pos];
  const smooth = (pos) => (at(pos - 1) + at(pos) + at(pos + 1)) / 3;
  const zone = Math.floor(size * DARK_BAND_MAX_FRACTION);
  let minPos = -1;
  let minVal = Infinity;
  for (let pos = 2; pos < zone; pos++) {
    const val = smooth(pos);
    if (val < minVal) {
      minVal = val;
      minPos = pos;
    }
  }
  const central = [];
  for (let pos = Math.floor(size * 0.3); pos < Math.floor(size * 0.7); pos++) central.push(at(pos));
  central.sort((a, b) => a - b);
  const centerLevel = central[Math.floor(central.length / 2)];
  if (minPos < 0 || minVal > DARK_BAND_RATIO * centerLevel) return null;
  // De binnenkant van de band is de plek waar de helderheid het steilst
  // omhoog springt (de echte rand-naar-patroon-overgang), niet een vaste
  // drempel: een eerste rij/kolom met veel donkere velden of stukken blijft
  // anders te lang onder zo'n drempel en snijdt dan een deel van het patroon af.
  const searchEnd = Math.min(Math.floor(size * 0.3), minPos + Math.floor(size * 0.15));
  let bestPos = -1;
  let bestRise = 0;
  for (let pos = minPos; pos < searchEnd; pos++) {
    const rise = at(pos + 2) - at(pos - 2);
    if (rise > bestRise) {
      bestRise = rise;
      bestPos = pos;
    }
  }
  if (bestPos >= 0 && bestRise >= DARK_BAND_MIN_RISE * (centerLevel - minVal)) {
    return fromStart ? bestPos : size - 1 - bestPos;
  }
  return null;
}

function findGridAxis(profile, means, size) {
  const rough = findGridAxisRough(profile, size);
  if (!rough) return null;
  const roughEnd = rough.offset + 10 * rough.spacing;
  const maxShift = rough.spacing * 1.2;
  // De donkere-band-methode is leidend; ligt zijn uitkomst onbegrijpelijk ver van
  // de grove schatting, dan vertrouwen we hem niet en vallen we terug op de
  // piekmethode.
  const dark = (edge, roughPos) => (edge != null && Math.abs(edge - roughPos) <= maxShift ? edge : null);
  const start = dark(findDarkBandInnerEdge(means, size, true), rough.offset)
    ?? refineEdge(profile, size, rough.offset, rough.spacing, true);
  const end = dark(findDarkBandInnerEdge(means, size, false), roughEnd)
    ?? refineEdge(profile, size, roughEnd, rough.spacing, false);
  if (end - start < size * 0.5) return null;
  return { offset: start, spacing: (end - start) / 10 };
}

// outerCorners: de 4 hoeken van de gevonden buitenrand (mogelijk incl. lijst),
// in dezelfde coördinaten als `imageData`. Geeft de (mogelijk) naar binnen
// bijgestelde 4 hoeken terug die het dambordpatroon zelf volgen, of
// `outerCorners` ongewijzigd terug als er geen patroon te vinden was.
function stripBorderToPlayfield(imageData, outerCorners) {
  const SIZE = 500;
  const squareCorners = [
    { x: 0, y: 0 },
    { x: SIZE, y: 0 },
    { x: SIZE, y: SIZE },
    { x: 0, y: SIZE },
  ];
  const H = computeHomography(squareCorners, outerCorners);
  const warped = warpPerspective(imageData, H, SIZE, SIZE);
  const gray = toGrayscale(warped);
  const mag = gradientMagnitude(gray, SIZE, SIZE);

  const xAxis = findGridAxis(colProfile(mag, SIZE, SIZE), colMeans(gray, SIZE, SIZE), SIZE);
  const yAxis = findGridAxis(rowProfile(mag, SIZE, SIZE), rowMeans(gray, SIZE, SIZE), SIZE);
  if (!xAxis || !yAxis) return outerCorners;

  const left = xAxis.offset;
  const right = xAxis.offset + 10 * xAxis.spacing;
  const top = yAxis.offset;
  const bottom = yAxis.offset + 10 * yAxis.spacing;

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ].map(({ x, y }) => applyHomography(H, x, y));
}

// drawable: een canvas/bitmap/image met .width/.height, tekenbaar via drawImage.
// Geeft [{x,y} x4] terug in de coördinaten van `drawable`, of null.
export function detectBoardCorners(drawable) {
  const fullWidth = drawable.width ?? drawable.naturalWidth;
  const fullHeight = drawable.height ?? drawable.naturalHeight;
  const scale = Math.min(1, WORKING_SIZE / Math.max(fullWidth, fullHeight));
  const workWidth = Math.max(1, Math.round(fullWidth * scale));
  const workHeight = Math.max(1, Math.round(fullHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = workWidth;
  canvas.height = workHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(drawable, 0, 0, workWidth, workHeight);
  const imageData = ctx.getImageData(0, 0, workWidth, workHeight);

  const outerCorners = detectCornersFromImageData(imageData, workWidth, workHeight);
  if (!outerCorners) return null;

  const corners = stripBorderToPlayfield(imageData, outerCorners);
  return corners.map(({ x, y }) => ({ x: x / scale, y: y / scale }));
}
