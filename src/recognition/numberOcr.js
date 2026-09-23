// Het nummer boven een diagram lezen (bulk-import): "Диаграмма 570", "34", "580*)", ...
//
// Per gevonden bord wordt een strookje boven het bord uitgesneden en door Tesseract (tekstlezer,
// draait in de browser) gelezen. Gemeten op 24 diagrammen uit een echt boek: 21 goed; de rest
// valt meestal te herstellen doordat de nummers doorlopen (fillMissingNumbers).
//
// Tesseract.js wordt pas geladen (van een CDN, ~5 MB) zodra dit voor het eerst nodig is; zonder
// internet blijft alleen het automatisch lezen weg, handmatig invullen werkt gewoon.
//
// Sinds 2026-09-23: op scheef in beeld staande diagrammen (fotohoek, pagina niet recht) las de
// tekstlezer er vaak substantieel naast — zie CLAUDE.md ("nummerherkenning verbeterd"). Het
// strookje wordt nu, net als het bord zelf, rechtgetrokken vóór het lezen (`warpNumberStrip`,
// volgt de eigen scheefstand van dat diagram i.p.v. een assen-gelijk kader om de 4 hoekpunten);
// een lezing met een lage zekerheid van Tesseract zelf wordt genegeerd (`NUMBER_MIN_CONFIDENCE`);
// en `fillMissingNumbers` verwerpt nu ook een lezing die qua grootte duidelijk niet bij de rest
// van de import past, zelfs als hij zelf geen "gat" is (zie `findImplausible`).

import { computeHomography, warpPerspective } from "./homography.js?v=20260923a";

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

// ---------- het strookje boven het bord vinden ----------

// Hoeveel van de bordbreedte/-hoogte het strookje boven het bord beslaat, en hoeveel breder dan
// het bord het aan weerszijden uitsteekt (een nummer/onderschrift staat vaak net iets breder dan
// het bord zelf, en dit vangt ook een klein beetje scheefstand tussen bord en tekst op).
const STRIP_HEIGHT_FRACTION = 0.3;
const STRIP_SIDE_MARGIN = 0.05;
// Uitvoerbreedte van het rechtgetrokken strookje: ruim, zodat een klein brongebied (een dicht
// opeengepakte pagina met veel diagrammen) tóch genoeg pixels voor Tesseract oplevert.
const STRIP_OUTPUT_WIDTH = 640;

// Het strookje boven een bord als vierhoek in de coördinaten van de foto, MET de scheefstand van
// dat diagram zelf (dus geen assen-gelijk kader om de 4 hoekpunten — dat kader is bij een scheve
// foto altijd ruimer dan het diagram, en snijdt daardoor niet noodzakelijk het echte nummer uit).
// `corners` = [TL, TR, BR, BL] (zelfde volgorde als overal elders in dit onderdeel, zie
// homography.js). Geeft [boven-TL, boven-TR, TR, TL] terug, of null bij een ontaarde vierhoek.
export function stripQuad(corners, heightFraction = STRIP_HEIGHT_FRACTION, sideMargin = STRIP_SIDE_MARGIN) {
  const [TL, TR, BR, BL] = corners;
  const left = { x: TL.x - BL.x, y: TL.y - BL.y }; // wijst "omhoog" langs de linkerzijde
  const right = { x: TR.x - BR.x, y: TR.y - BR.y }; // wijst "omhoog" langs de rechterzijde
  const top = { x: TR.x - TL.x, y: TR.y - TL.y };
  const leftLen = Math.hypot(left.x, left.y);
  const rightLen = Math.hypot(right.x, right.y);
  const topLen = Math.hypot(top.x, top.y);
  if (leftLen < 1e-6 || rightLen < 1e-6 || topLen < 1e-6) return null;
  const along = (p, dir, len, amount) => ({ x: p.x + (dir.x / len) * amount, y: p.y + (dir.y / len) * amount });
  const margin = topLen * sideMargin;
  const topLeft = along(TL, { x: -top.x, y: -top.y }, topLen, margin);
  const topRight = along(TR, top, topLen, margin);
  const aboveLeft = along(topLeft, left, leftLen, leftLen * heightFraction);
  const aboveRight = along(topRight, right, rightLen, rightLen * heightFraction);
  return [aboveLeft, aboveRight, topRight, topLeft];
}

// Rechttrekken van `quad` (in de coördinaten van `drawable`) naar een canvas van
// `outWidth` x `outHeight`, met dezelfde homografie-aanpak als het bord zelf (homography.js).
// `clampEdges`: buiten de foto de rand herhalen in plaats van wit invullen (het strookje kan net
// buiten de foto vallen als het bord tegen de rand aan staat).
function warpQuadToCanvas(drawable, quad, outWidth, outHeight) {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = drawable.width ?? drawable.naturalWidth;
  srcCanvas.height = drawable.height ?? drawable.naturalHeight;
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.drawImage(drawable, 0, 0);
  const sourceImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const rectCorners = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const H = computeHomography(rectCorners, quad);
  const warped = warpPerspective(sourceImageData, H, outWidth, outHeight, true);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  outCanvas.getContext("2d").putImageData(warped, 0, 0);
  return outCanvas;
}

// Terugval: hetzelfde strookje, maar dan als een assen-gelijk kader om de 4 hoekpunten (de
// aanpak van vóór 2026-09-23) — gebruikt alleen als de scheefstand-versie hierboven om wat voor
// reden dan ook niet lukt (bv. een ontaarde vierhoek). Ook los bruikbaar/getest.
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
  const quad = stripQuad(corners);
  let canvas = null;
  if (quad) {
    try {
      canvas = warpQuadToCanvas(drawable, quad, STRIP_OUTPUT_WIDTH, Math.round(STRIP_OUTPUT_WIDTH * STRIP_HEIGHT_FRACTION));
    } catch {
      canvas = null;
    }
  }
  if (!canvas) {
    const rect = stripRect(corners, width, height);
    if (!rect) return null;
    canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.getContext("2d").drawImage(drawable, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  }
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

// Onder deze zekerheid (Tesseract's eigen inschatting, 0-100) wordt een lezing genegeerd — beter
// "niet gelezen" (en dus zelf in te vullen of uit de reeks af te leiden) dan een overtuigend
// ogend maar fout getal. Nog niet scherpgesteld op echte foto's; bijstellen zodra dat kan (zie
// CLAUDE.md).
export const NUMBER_MIN_CONFIDENCE = 35;

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
            if (data.confidence >= NUMBER_MIN_CONFIDENCE) number = parseDiagramNumber(data.text);
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

// Hoever een gelezen nummer minimaal van de rest van de import mag afliggen voordat het als
// "hoort hier niet bij" (dus vermoedelijk een leesfout) wordt behandeld. Ruim genomen: bij één
// pagina met bv. 4-12 diagrammen lopen de echte nummers meestal niet meer dan een paar tientallen
// uiteen; bij meerdere pagina's tegelijk (de gewone bulk-import) geeft dat des te meer houvast.
const MAX_DEVIATION_FROM_MEDIAN = 30;

// Nummers die, ongeacht hun plek in de reeks, sterk afwijken van de rest van de gelezen nummers in
// deze import (mediaan van alles wat wél gelezen is) — dit vangt een lezing die zelf geen "gat"
// slaat (bv. een op zichzelf keurig oplopend maar véél te laag reeksje "0, 1, 2" tussen verder
// correcte nummers van 150+) en die `findOutliers` hierboven daarom niet ziet. Bewust voorzichtig:
// bij te weinig gegevens (< 4 bekende nummers), of als het zoveel zou wegstrepen dat er niks van
// een referentie overblijft, gebeurt er niets — beter een gemiste fout dan een goed nummer kwijt.
function findImplausible(raw) {
  const known = raw.filter((v) => v != null);
  if (known.length < 4) return [];
  const sorted = [...known].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const out = [];
  raw.forEach((v, i) => {
    if (v != null && Math.abs(v - median) > MAX_DEVIATION_FROM_MEDIAN) out.push(i);
  });
  return out.length < known.length ? out : [];
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
  // einde van de reeks), of dat sterk afwijkt van de rest van de import (bv. "45" tussen verder
  // allemaal 150-achtige nummers), is bijna zeker een leesfout: dat wordt als "niet gelezen"
  // behandeld en zo mogelijk uit de reeks afgeleid.
  const suspect = new Set([...findOutliers(readingOrder, raw), ...findOutliers(colOrder, raw), ...findImplausible(raw)]);
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
