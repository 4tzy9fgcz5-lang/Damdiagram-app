import { computeHomography, applyHomography, warpPerspective } from "./homography.js?v=20260920e";

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
//      Zoekt de celbreedte + startpositie van het 10x10-raster die de
//      opgetelde randsterkte (Sobel-gradiënt) langs de 9 interne rasterlijnen
//      maximaliseert, per rij/kolom-projectieprofiel (zie `findGridAxis()`).
//      Bewust GEEN per-rij/kolom-variantie meer (eerdere versie, 2026-09-20
//      ochtend): een rand met wat drukstructuur of scancompressie-ruis werd
//      daarmee soms al als "patroon" herkend, waardoor er nog een zichtbare
//      rand overbleef. Een projectieprofiel telt de randsterkte op over de
//      HELE hoogte/breedte, dus een rasterlijn (die op bijna elke rij/kolom
//      bijdraagt) steekt daar veel duidelijker bovenuit dan zo'n losse
//      ruisplek. Werkt samen met de kleine na-correctie van `gridRefine.js`
//      (die daarna, na het rechttrekken, nog een laatste restfout — met name
//      een kleine restrotatie — wegpoetst).
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

// Zoekt, langs één as, de celbreedte + startpositie van de 9 interne rasterlijnen
// die samen de hoogste randsterkte oppikken uit het profiel — dat is het echte
// 10x10-raster, ongeacht waar de (eventuele) rand precies ophoudt. `offsetMax`
// begrenst niet alleen hoe ver de eerste lijn van de rand mag liggen, maar ook
// dat de 10e lijn (offset + 10*spacing) binnen het beeld blijft: zonder die eis
// kan een kandidaat toevallig goed scoren op de 9 gesamplede lijnen terwijl het
// hele raster in werkelijkheid een stuk buiten het beeld valt.
function findGridAxis(profile, size) {
  let best = null;
  let bestScore = -1;
  const spacingMin = (size / 10) * 0.72;
  const spacingMax = (size / 10) * 1.02;
  // Van groot naar klein: een rand kan het bord alleen maar kleiner laten lijken
  // dan het echt is, nooit groter. Bij twee kandidaten die het patroon ongeveer
  // even goed oppikken (denkbaar bij een erg regelmatig schaakbord: een té klein
  // gekozen raster kan toevallig ook aardig op randjes uitkomen) geeft dat de
  // voorkeur aan zo min mogelijk wegsnijden — een kleinere spacing wordt alleen
  // gekozen als die duidelijk (>3%) beter scoort dan de beste tot nu toe, niet
  // bij een marginaal verschil.
  for (let spacing = spacingMax; spacing >= spacingMin; spacing -= 0.5) {
    // offset mag ook (bijna) 0 zijn: als het patroon de gevonden buitenrand al
    // helemaal vult, is er geen rand om weg te snijden. Eerder stond hier een
    // ondergrens van 2% — die sloot precies dát geval per ongeluk uit, want
    // gecombineerd met de bovengrens (het hele raster moet binnen het beeld
    // passen) bleef er dan voor de grootste, kloppende spacing geen enkele
    // geldige offset over.
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

  const xAxis = findGridAxis(colProfile(mag, SIZE, SIZE), SIZE);
  const yAxis = findGridAxis(rowProfile(mag, SIZE, SIZE), SIZE);
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
