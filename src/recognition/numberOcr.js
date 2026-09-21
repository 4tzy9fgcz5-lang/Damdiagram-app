// Het nummer boven een diagram lezen (bulk-import): "Диаграмма 570", "34", "580*)", ...
//
// Per gevonden bord wordt een strookje boven het bord uitgesneden en door Tesseract (tekstlezer,
// draait in de browser) gelezen. Gemeten op 24 diagrammen uit een echt boek: 21 goed; de rest
// valt meestal te herstellen doordat de nummers doorlopen (fillMissingNumbers).
//
// Tesseract.js wordt pas geladen (van een CDN, ~5 MB) zodra dit voor het eerst nodig is; zonder
// internet blijft alleen het automatisch lezen weg, handmatig invullen werkt gewoon.

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js";

let tesseractPromise = null;

export function loadTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_URL;
      script.onload = () => resolve(globalThis.Tesseract);
      script.onerror = () => {
        tesseractPromise = null;
        script.remove();
        reject(new Error("Kon de tekstlezer niet laden (geen internet?)."));
      };
      document.head.appendChild(script);
    });
  }
  return tesseractPromise;
}

// Het strookje boven een bord, in de coördinaten van de foto: de breedte van het bord (plus 5%
// per kant) en van 0,30 x die breedte boven de bovenrand tot vlak eronder. null als er geen
// ruimte boven het bord is (bord tegen de bovenrand van de foto).
export function stripRect(corners, imageWidth, imageHeight) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const w = right - left;
  const x0 = Math.max(0, Math.floor(left - 0.05 * w));
  const x1 = Math.min(imageWidth, Math.ceil(right + 0.05 * w));
  const y0 = Math.max(0, Math.floor(top - 0.3 * w));
  const y1 = Math.min(imageHeight, Math.ceil(top + 0.02 * w));
  if (y1 - y0 < 0.1 * w || x1 - x0 < 20) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// Grijs maken en het contrast oprekken (1% van de donkerste en lichtste pixels negeren): dat
// maakt het lezen bij schaduw en vale afdrukken merkbaar betrouwbaarder.
function toGrayAutoContrast(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
  }
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && acc + hist[lo] < total * 0.01; lo++) acc += hist[lo];
  for (let acc = 0; hi > 0 && acc + hist[hi] < total * 0.01; hi--) acc += hist[hi];
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(((d[i] - lo) * 255) / span)));
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function cropStrip(drawable, corners) {
  const width = drawable.width ?? drawable.naturalWidth;
  const height = drawable.height ?? drawable.naturalHeight;
  const rect = stripRect(corners, width, height);
  if (!rect) return null;
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.getContext("2d").drawImage(drawable, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return toGrayAutoContrast(canvas);
}

// Uit de gelezen tekst het nummer halen: het langste cijfergroepje van 1 tot 4 cijfers (bij
// gelijke lengte het laatste, want in "Диаграмма 570" staat het nummer achteraan). null als er
// geen cijfers staan.
export function parseDiagramNumber(text) {
  const tokens = String(text ?? "").match(/\d+/g) ?? [];
  let best = null;
  for (const t of tokens) {
    if (t.length > 4) continue;
    if (best === null || t.length >= best.length) best = t;
  }
  return best === null ? null : Number(best);
}

// Een tekstlezer die je voor meerdere pagina's achter elkaar kunt gebruiken (het opstarten kost
// enkele seconden, dus niet per foto opnieuw). `read(drawable, cornersList, { onProgress })`
// geeft per bord het nummer (getal) of null; `close()` ruimt op. Gooit een fout als de tekstlezer
// niet te laden is.
export async function createNumberReader() {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker("eng");
  await worker.setParameters({ tessedit_pageseg_mode: "6" });
  return {
    async read(drawable, cornersList, { onProgress } = {}) {
      const results = [];
      for (let i = 0; i < cornersList.length; i++) {
        onProgress?.(i, cornersList.length);
        let number = null;
        try {
          const strip = cropStrip(drawable, cornersList[i]);
          if (strip) {
            const { data } = await worker.recognize(strip);
            number = parseDiagramNumber(data.text);
          }
        } catch {
          number = null;
        }
        results.push(number);
      }
      onProgress?.(cornersList.length, cornersList.length);
      return results;
    },
    close: () => worker.terminate(),
  };
}

// Leest het nummer boven elk bord van één foto. `cornersList` = [[{x,y} x4]] in de coördinaten van
// `drawable`. Geeft per bord het nummer (getal) of null.
export async function readDiagramNumbers(drawable, cornersList, opties = {}) {
  const reader = await createNumberReader();
  try {
    return await reader.read(drawable, cornersList, opties);
  } finally {
    await reader.close();
  }
}

// ---------- ontbrekende nummers aanvullen uit de doorlopende reeks ----------

// `order`: indexen in de volgorde waarin de nummers oplopen; `values`: nummer of null per index.
function fillAlong(order, values) {
  const seq = order.map((i) => values[i]);
  const filled = new Map();
  const known = seq.map((v, k) => (v != null ? k : -1)).filter((k) => k >= 0);
  // tussen twee bekende nummers: alleen als het verschil precies past
  for (let a = 0; a + 1 < known.length; a++) {
    const k0 = known[a];
    const k1 = known[a + 1];
    if (k1 - k0 > 1 && seq[k1] - seq[k0] === k1 - k0) {
      for (let k = k0 + 1; k < k1; k++) filled.set(order[k], seq[k0] + (k - k0));
    }
  }
  // achter het laatste bekende nummer, als de reeks daarvoor doorloopt
  if (known.length >= 2) {
    const kLast = known[known.length - 1];
    if (known[known.length - 2] === kLast - 1 && seq[kLast] - seq[kLast - 1] === 1) {
      for (let k = kLast + 1; k < seq.length; k++) filled.set(order[k], seq[kLast] + (k - kLast));
    }
    const kFirst = known[0];
    if (known[1] === kFirst + 1 && seq[kFirst + 1] - seq[kFirst] === 1) {
      for (let k = kFirst - 1; k >= 0; k--) {
        const value = seq[kFirst] - (kFirst - k);
        if (value >= 1) filled.set(order[k], value);
      }
    }
  }
  return filled;
}

// Indexen van gelezen nummers die niet in de doorlopende reeks eromheen passen: tussen twee
// buren die precies twee uit elkaar liggen, of aan het begin/einde terwijl de twee buren ernaast
// een doorlopend paar vormen.
function findOutliers(order, values) {
  const seq = order.map((i) => values[i]);
  const out = [];
  for (let k = 0; k < seq.length; k++) {
    const v = seq[k];
    if (v == null) continue;
    const prev = seq[k - 1];
    const next = seq[k + 1];
    const prev2 = seq[k - 2];
    const next2 = seq[k + 2];
    if (prev != null && next != null && next - prev === 2 && v !== prev + 1) out.push(order[k]);
    else if (prev != null && prev2 != null && prev - prev2 === 1 && (k === seq.length - 1 || next == null) && v !== prev + 1 && next == null) out.push(order[k]);
    else if (next != null && next2 != null && next2 - next === 1 && (k === 0 || prev == null) && v !== next - 1 && prev == null) out.push(order[k]);
  }
  return out;
}

// Diagrammen in kolom-volgorde: van boven naar beneden, kolom voor kolom (sommige boeken tellen zo).
function columnOrder(items) {
  const widths = items.map((it) => it.breedte).sort((a, b) => a - b);
  const tolerance = 0.5 * (widths[Math.floor(widths.length / 2)] || 1);
  const sorted = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.cx - b.cx);
  const columns = [];
  for (const it of sorted) {
    const col = columns.find((c) => Math.abs(c.cx - it.cx) <= tolerance);
    if (col) {
      col.items.push(it);
      col.cx = col.items.reduce((s, x) => s + x.cx, 0) / col.items.length;
    } else columns.push({ cx: it.cx, items: [it] });
  }
  columns.sort((a, b) => a.cx - b.cx);
  return columns.flatMap((c) => c.items.sort((a, b) => a.cy - b.cy).map((it) => it.i));
}

/**
 * Vult nummers aan die niet gelezen zijn, als de reeks ervoor en erna doorloopt.
 * @param {{ nummer: number|null, cx: number, cy: number, breedte: number }[]} items in leesvolgorde
 *   (rij voor rij); cx/cy = midden van het bord, breedte = breedte van het bord.
 * @returns {{ nummer: number|null, afgeleid: boolean }[]}
 *   Alleen ingevuld waar de leesvolgorde en de kolomvolgorde elkaar niet tegenspreken.
 */
export function fillMissingNumbers(items) {
  const raw = items.map((it) => it.nummer ?? null);
  const readingOrder = items.map((_, i) => i);
  const colOrder = columnOrder(items);
  // Een gelezen nummer dat midden in een doorlopende reeks niet past (bv. "3" tussen 592 en het
  // einde van de reeks) is bijna zeker een leesfout: dat wordt als "niet gelezen" behandeld en
  // uit de reeks afgeleid.
  const suspect = new Set([...findOutliers(readingOrder, raw), ...findOutliers(colOrder, raw)]);
  const values = raw.map((v, i) => (suspect.has(i) ? null : v));
  const a = fillAlong(readingOrder, values);
  const b = fillAlong(colOrder, values);
  return items.map((it, i) => {
    if (values[i] != null) return { nummer: values[i], afgeleid: false };
    const va = a.get(i);
    const vb = b.get(i);
    if (va != null && vb != null && va !== vb) return { nummer: null, afgeleid: false };
    const v = va ?? vb ?? null;
    return { nummer: v, afgeleid: v !== null };
  });
}
