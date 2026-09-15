// Meerdere dambord-diagrammen op één paginafoto vinden (voor bulk-import).
// Zelfde basisaanpak als detectBoard.js (donkere vlek -> convex hull -> kleinst
// omvattende rechthoek), maar met twee verschillen, beide bevestigd met echte
// testfoto's van verschillende boekstijlen (zie testdata/, lokaal bij Jan):
//
//  1. Er wordt niet gestopt bij de grootste vlek — alle vlekken die op een bord
//     lijken (vorm + hoeveelheid "inkt") worden verzameld.
//  2. De licht/donker-drempel wordt lokaal bepaald (per omgeving), niet één keer
//     voor de hele pagina. Bij een foto van een opengeslagen boek valt er vaak
//     meer licht op de ene kant dan de andere (schaduw bij de rug); één vaste
//     drempel voor de hele pagina laat de lichtjes gearceerde velden dan aan de
//     schaduwkant onterecht als "niet donker genoeg" wegvallen. Getest: dit
//     verdubbelde de trefkans bij dichtbedrukte pagina's (twee testfoto's met
//     12-20 kleine diagrammen per pagina), zonder dat aparte diagrammen
//     onterecht samengevoegd werden.
//
// Geeft nooit alles feilloos: de aanroeper moet de gebruiker gevonden vlekken
// laten verwijderen en zelf ontbrekende diagrammen laten toevoegen/verslepen.

const WORKING_SIZE = 1600;
const MIN_ASPECT = 0.65;
const MAX_ASPECT = 1.55;
const MIN_AREA_FRACTION = 0.008;
const MAX_AREA_FRACTION = 0.45;
const MIN_FILL = 0.35;
const DILATE_ITERATIONS = 2;
const ADAPTIVE_OFFSET = 10;

function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

// Integraalbeeld voor een snel lokaal gemiddelde (vensom in constante tijd).
function localMean(gray, width, height, radius) {
  const sum = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      sum[(y + 1) * (width + 1) + (x + 1)] = sum[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const mean = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const total =
        sum[(y1 + 1) * (width + 1) + (x1 + 1)] -
        sum[y0 * (width + 1) + (x1 + 1)] -
        sum[(y1 + 1) * (width + 1) + x0] +
        sum[y0 * (width + 1) + x0];
      mean[y * width + x] = total / area;
    }
  }
  return mean;
}

function adaptiveMask(gray, width, height) {
  const radius = Math.round(width * 0.06);
  const mean = localMean(gray, width, height, radius);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < mean[i] - ADAPTIVE_OFFSET ? 1 : 0;
  return mask;
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

// Alle samenhangende vlekken die op een dambord lijken (i.p.v. alleen de grootste).
function allBoardLikeComponents(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const imgArea = width * height;
  const minPixels = Math.max(30, Math.round(imgArea * MIN_AREA_FRACTION * 0.5));
  const results = [];
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

        const neighbors = [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]];
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
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
      const bboxArea = bboxW * bboxH;
      const areaFrac = bboxArea / imgArea;
      if (areaFrac < MIN_AREA_FRACTION || areaFrac > MAX_AREA_FRACTION) continue;
      const fill = count / bboxArea;
      if (fill < MIN_FILL) continue;

      points.push([minx, miny], [maxx, miny], [minx, maxy], [maxx, maxy]);
      results.push({ points, areaFrac });
    }
  }
  return results;
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
      const corners = [[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy]];
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

// Zuivere rekenkern, los van canvas/DOM — zelfde opzet als detectCornersFromImageData
// in detectBoard.js. Geeft een lijst van kandidaten terug, gesorteerd in
// leesvolgorde (boven naar beneden, links naar rechts), elk als [{x,y} x4] in
// dezelfde (mogelijk verkleinde) pixel-coördinaten als het meegegeven beeld.
export function detectMultipleCornersFromImageData(imageData, width, height) {
  const gray = toGrayscale(imageData);
  const mask = dilate(adaptiveMask(gray, width, height), width, height, DILATE_ITERATIONS);
  const components = allBoardLikeComponents(mask, width, height);

  const candidates = components
    .map(({ points }) => {
      const hull = convexHull(points);
      if (hull.length < 3) return null;
      const rect = minAreaRect(hull);
      if (!rect) return null;
      return orderCorners(rect).map(([x, y]) => ({ x, y }));
    })
    .filter(Boolean);

  const rowHeight = Math.sqrt(
    candidates.reduce((sum, c) => sum + Math.hypot(c[3].y - c[0].y, c[3].x - c[0].x), 0) /
      Math.max(1, candidates.length)
  );
  candidates.sort((a, b) => {
    const centerA = { x: (a[0].x + a[2].x) / 2, y: (a[0].y + a[2].y) / 2 };
    const centerB = { x: (b[0].x + b[2].x) / 2, y: (b[0].y + b[2].y) / 2 };
    const rowA = Math.round(centerA.y / Math.max(1, rowHeight));
    const rowB = Math.round(centerB.y / Math.max(1, rowHeight));
    if (rowA !== rowB) return rowA - rowB;
    return centerA.x - centerB.x;
  });

  return candidates;
}

// drawable: canvas/bitmap/image met .width/.height, tekenbaar via drawImage.
// Geeft een lijst kandidaten terug (elk [{x,y} x4]) in de coördinaten van
// `drawable`, of een lege lijst als er niets bruikbaars gevonden is.
export function detectMultipleBoardCorners(drawable) {
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

  const candidates = detectMultipleCornersFromImageData(imageData, workWidth, workHeight);
  return candidates.map((corners) => corners.map(({ x, y }) => ({ x: x / scale, y: y / scale })));
}
