'use strict';

/**
 * Feature-extractie voor één veld-crop.
 *
 * Alles is bewust LOKAAL: elk kenmerk vergelijkt het midden van het veld met de
 * rand van datzelfde veld. Daardoor is er geen globaal lichtvlak nodig en kan een
 * fout op veld A nooit de classificatie van veld B beïnvloeden.
 */

// --- Geometrie, als fractie van de veldbreedte ---------------------------------
// Pas deze aan als je crops meer of minder marge om het veld hebben.
const CENTER_R = 0.22; // straal van het middengebied
const BG_BAND = 0.44; // achtergrond = buitenste band (Chebyshev-afstand > dit)
const RING_R = 0.36; // verwachte positie van de schijfrand
const RING_W = 0.07; // dikte van die ring
const RING_SECTORS = 16; // aantal hoeksectoren voor randdekking

const EPS = 1e-6;

/** RGBA (of RGB) pixels -> Float32Array grijswaarden. */
function toGray(pixels, width, height, channels = 4) {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += channels) {
    out[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }
  return out;
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

function median(arr) {
  if (!arr.length) return 0;
  const a = Float64Array.from(arr).sort();
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}

/** Sobel; geeft magnitude en oriëntatie (0..pi) per pixel. */
function gradients(gray, w, h) {
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      mag[i] = Math.hypot(gx, gy);
      let a = Math.atan2(gy, gx);
      if (a < 0) a += Math.PI; // richting, niet teken
      ang[i] = a;
    }
  }
  return { mag, ang };
}

/**
 * @param {Float32Array} gray grijswaarden van één veld
 * @param {number} w
 * @param {number} h
 * @returns {{vector:number[], named:Object}}
 */
function extractFeatures(gray, w, h) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const size = Math.min(w, h);
  const rCenter = CENTER_R * size;
  const rRingLo = (RING_R - RING_W / 2) * size;
  const rRingHi = (RING_R + RING_W / 2) * size;
  const bgEdge = BG_BAND * size;

  const { mag, ang } = gradients(gray, w, h);

  const centerVals = [];
  const centerMag = [];
  const centerAng = [];
  const bgVals = [];
  const ringBest = new Float64Array(RING_SECTORS); // sterkste rand per hoeksector
  const ringMag = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = x - cx;
      const dy = y - cy;
      const rad = Math.hypot(dx, dy);
      const cheb = Math.max(Math.abs(dx), Math.abs(dy));

      if (rad <= rCenter) {
        centerVals.push(gray[i]);
        centerMag.push(mag[i]);
        centerAng.push(ang[i]);
      }
      if (cheb > bgEdge) {
        bgVals.push(gray[i]);
      }
      if (rad >= rRingLo && rad <= rRingHi) {
        ringMag.push(mag[i]);
        let th = Math.atan2(dy, dx);
        if (th < 0) th += 2 * Math.PI;
        const s = Math.min(RING_SECTORS - 1, Math.floor((th / (2 * Math.PI)) * RING_SECTORS));
        if (mag[i] > ringBest[s]) ringBest[s] = mag[i];
      }
    }
  }

  const centerMean = mean(centerVals);
  const centerStd = std(centerVals);
  // Mediaan i.p.v. gemiddelde: bestand tegen een stukje buurschijf dat de crop in lekt.
  const bgMedian = median(bgVals);
  const bgStd = std(bgVals);

  // 1. Relatieve helderheid t.o.v. het bord onder dezelfde belichting. Teken = kleur.
  const relBright = (centerMean - bgMedian) / (bgMedian + 1);
  // 2. Hetzelfde, maar uitgedrukt in eenheden bordtextuur: hoe ver steekt het af
  //    boven de ruis die het bord zelf al heeft?
  const contrastZ = (centerMean - bgMedian) / (bgStd + 1);
  // 3. Ongetekend: scheidt "iets" van "niets", ongeacht wit of zwart.
  const absBright = Math.abs(relBright);
  // 4. Textuurverhouding. Leeg veld: midden heeft dezelfde weefselstructuur als de
  //    rand (~0). Schijf: glad of anders gestructureerd midden (negatief).
  const textureRatio = Math.log((centerStd + 1) / (bgStd + 1));
  // 5. Richtingsdiversiteit van de randjes in het midden (jouw 'diversity').
  //    Arcering = één richting = lage entropie. Schijfrand/print = alle richtingen.
  const diversity = orientationEntropy(centerMag, centerAng);
  // 6. Randsterkte op de plek waar de schijfrand hoort te zitten.
  const ringEdge = mean(ringMag) / (bgStd + 1);
  // 7. Dekking: bij een schijf loopt de rand rond, dus vrijwel elke hoeksector
  //    bevat een sterke rand. Bij arcering maar een deel.
  const thr = 2 * (bgStd + 1);
  let covered = 0;
  for (let s = 0; s < RING_SECTORS; s++) if (ringBest[s] > thr) covered++;
  const ringCoverage = covered / RING_SECTORS;

  const named = {
    relBright, contrastZ, absBright, textureRatio, diversity, ringEdge, ringCoverage,
    // ruwe waarden, handig bij debuggen
    _centerMean: centerMean, _centerStd: centerStd, _bgMedian: bgMedian, _bgStd: bgStd,
  };
  return { vector: FEATURE_NAMES.map((k) => named[k]), named };
}

const FEATURE_NAMES = [
  'relBright', 'contrastZ', 'absBright', 'textureRatio', 'diversity', 'ringEdge', 'ringCoverage',
];

/** Shannon-entropie van de magnitude-gewogen oriëntatiehistogram, genormaliseerd op 0..1. */
function orientationEntropy(mags, angs, bins = 8) {
  const hist = new Float64Array(bins);
  let total = 0;
  for (let i = 0; i < mags.length; i++) {
    const b = Math.min(bins - 1, Math.floor((angs[i] / Math.PI) * bins));
    hist[b] += mags[i];
    total += mags[i];
  }
  if (total < EPS) return 0;
  let e = 0;
  for (let b = 0; b < bins; b++) {
    const p = hist[b] / total;
    if (p > EPS) e -= p * Math.log(p);
  }
  return e / Math.log(bins);
}

module.exports = { extractFeatures, toGray, FEATURE_NAMES, CENTER_R, BG_BAND, RING_R };
