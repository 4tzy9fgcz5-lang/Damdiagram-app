// Poort van damscan/features.js naar de browser (ES module i.p.v. CommonJS), voor
// gebruik in de vergelijkweergave (tests/compare.html) en straks eventueel de app
// zelf. Logica ONGEWIJZIGD overgenomen — bij een aanpassing aan damscan/features.js
// dit bestand meenemen, anders lopen de twee uit elkaar.
//
// Alles is bewust LOKAAL: elk kenmerk vergelijkt het midden van het veld met de
// rand van datzelfde veld. Daardoor is er geen globaal lichtvlak nodig en kan een
// fout op veld A nooit de classificatie van veld B beïnvloeden.

// --- Geometrie, als fractie van de veldbreedte ---------------------------------
const CENTER_R = 0.22; // straal van het middengebied
const BG_BAND = 0.44; // achtergrond = buitenste band (Chebyshev-afstand > dit)
const RING_R = 0.36; // verwachte positie van de schijfrand
const RING_W = 0.07; // dikte van die ring
const RING_SECTORS = 16; // aantal hoeksectoren voor randdekking

const EPS = 1e-6;

/** RGBA (of RGB) pixels -> Float32Array grijswaarden. */
export function toGray(pixels, width, height, channels = 4) {
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

/** Sobel; geeft magnitude, oriëntatie (0..pi) en de losse componenten per pixel. */
function gradients(gray, w, h) {
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  const gxs = new Float32Array(w * h);
  const gys = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      mag[i] = Math.hypot(gx, gy);
      gxs[i] = gx;
      gys[i] = gy;
      let a = Math.atan2(gy, gx);
      if (a < 0) a += Math.PI; // richting, niet teken
      ang[i] = a;
    }
  }
  return { mag, ang, gxs, gys };
}

/**
 * Zoekt de schijfrand door alle plausibele stralen af te lopen.
 *
 * Het trucje zit in de uitlijning: op een echte cirkellijn staat de
 * helderheidsovergang RADIAAL, loodrecht op de cirkel. Een gestippelde of
 * gearceerde ondergrond geeft net zo sterke randjes, maar in willekeurige
 * richtingen. Door elke randje te wegen met hoe radiaal het staat, valt de
 * ondergrond weg en blijft alleen een echte schijfrand over.
 *
 * De straal wordt gezocht in plaats van aangenomen, omdat elk boek de schijf
 * anders groot drukt.
 */
function findDiscEdge(g, w, h, cx, cy, size, bgStd) {
  const ANGLES = 144;
  const norm = bgStd + 1;
  let best = { score: 0, mean: 0, coverage: 0, radius: 0 };

  for (let rf = 0.20; rf <= 0.48; rf += 0.01) {
    const R = rf * size;
    const vals = [];
    for (let a = 0; a < ANGLES; a++) {
      const th = (2 * Math.PI * a) / ANGLES;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      // Kleine speling in de straal: de schijf staat zelden exact gecentreerd.
      let bestHere = 0;
      for (const d of [-1, 0, 1]) {
        const ix = Math.round(cx + (R + d) * ct);
        const iy = Math.round(cy + (R + d) * st);
        if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) continue;
        const i = iy * w + ix;
        const m = g.mag[i];
        if (m < EPS) continue;
        const align = Math.abs((g.gxs[i] * ct + g.gys[i] * st) / m);
        const v = m * align;
        if (v > bestHere) bestHere = v;
      }
      vals.push(bestHere);
    }
    if (vals.length < ANGLES / 2) continue;

    const sorted = Float64Array.from(vals).sort();
    // Het ZWAKSTE deel van de cirkel, niet het gemiddelde. Een gedrukte cirkellijn
    // loopt helemaal rond; een gestippelde ondergrond geeft net zo sterke randjes,
    // maar laat gaten vallen. Het 20e percentiel meet precies dat verschil, en is
    // ongevoelig voor een enkele onderbreking door een rasterlijn of drukfout.
    const score = sorted[Math.floor(sorted.length * 0.2)] / norm;
    const meanV = vals.reduce((a, b) => a + b, 0) / vals.length / norm;
    const thr = 1.5 * norm;
    const coverage = vals.filter((v) => v > thr).length / vals.length;
    if (score > best.score) best = { score, mean: meanV, coverage, radius: rf };
  }
  return best;
}

/**
 * @param {Float32Array} gray grijswaarden van één veld
 * @param {number} w
 * @param {number} h
 * @returns {{vector:number[], named:Object}}
 */
export function extractFeatures(gray, w, h) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const size = Math.min(w, h);
  const rCenter = CENTER_R * size;
  const rRingLo = (RING_R - RING_W / 2) * size;
  const rRingHi = (RING_R + RING_W / 2) * size;
  const bgEdge = BG_BAND * size;

  const g = gradients(gray, w, h);
  const { mag, ang } = g;

  const centerVals = [];
  const centerMag = [];
  const centerAng = [];
  const bgVals = [];

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
      if (cheb > bgEdge) bgVals.push(gray[i]);
    }
  }

  const centerMean = mean(centerVals);
  const centerStd = std(centerVals);
  // Mediaan i.p.v. gemiddelde: bestand tegen een stukje buurschijf dat de crop in lekt.
  const bgMedian = median(bgVals);
  const bgStd = std(bgVals);

  // Zoek de schijfrand: straal, sterkte en hoeveel van de cirkel gedekt is.
  const edge = findDiscEdge(g, w, h, cx, cy, size, bgStd);

  // Meet binnen en buiten de GEVONDEN straal, niet op een aangenomen plek.
  // Bij een open ring (schijf als cirkellijn, ondergrond zichtbaar erbinnen) is
  // dit het enige verschil dat er is: binnen de ring is de ondergrond rustiger.
  const R = (edge.radius || RING_R) * size;
  const inVals = [];
  const outVals = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const rad = Math.hypot(x - cx, y - cy);
      const cheb = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (rad < 0.72 * R) inVals.push(gray[i]);
      else if (rad > 1.2 * R && cheb < 0.5 * size - 1) outVals.push(gray[i]);
    }
  }
  const inStd = std(inVals);
  const outStd = std(outVals);
  const inMean = mean(inVals);
  const outMean = mean(outVals);

  // 1. Relatieve helderheid t.o.v. het bord onder dezelfde belichting. Teken = kleur.
  const relBright = (centerMean - bgMedian) / (bgMedian + 1);
  // 2. Hetzelfde, maar uitgedrukt in eenheden bordtextuur.
  const contrastZ = (centerMean - bgMedian) / (bgStd + 1);
  // 3. Ongetekend: scheidt "iets" van "niets", ongeacht wit of zwart.
  const absBright = Math.abs(relBright);
  // 4. Textuurverhouding midden t.o.v. rand.
  const textureRatio = Math.log((centerStd + 1) / (bgStd + 1));
  // 5. Richtingsdiversiteit van de randjes in het midden.
  const diversity = orientationEntropy(centerMag, centerAng);
  // 6. Sterkte van het zwakste deel van de gevonden cirkel.
  const ringScore = edge.score;
  // 6b. Gemiddelde randsterkte op diezelfde cirkel.
  const ringMean = edge.mean;
  // 7. Hoeveel van de cirkel een echte rand heeft. Een schijf: bijna alles.
  const ringCoverage = edge.coverage;
  // 8. De gevonden straal zelf. Verschilt per boek en is dus informatief.
  const ringRadius = edge.radius;
  // 9. Textuur binnen de ring t.o.v. erbuiten. Het open-ring-onderscheid.
  const discTexture = Math.log((inStd + 1) / (outStd + 1));
  // 10. Helderheid binnen de ring t.o.v. erbuiten, in eenheden ondergrondruis.
  const discBright = (inMean - outMean) / (outStd + 1);

  const named = {
    relBright, contrastZ, absBright, textureRatio, diversity,
    ringScore, ringMean, ringCoverage, ringRadius, discTexture, discBright,
    // ruwe waarden, handig bij debuggen
    _centerMean: centerMean, _centerStd: centerStd, _bgMedian: bgMedian, _bgStd: bgStd,
  };
  return { vector: FEATURE_NAMES.map((k) => named[k]), named };
}

export const FEATURE_NAMES = [
  'relBright', 'contrastZ', 'absBright', 'textureRatio', 'diversity',
  'ringScore', 'ringMean', 'ringCoverage', 'ringRadius', 'discTexture', 'discBright',
];

/** Namen van de volledige vector: eerst de ruwe waarden, dan de bord-relatieve. */
export const FULL_FEATURE_NAMES = FEATURE_NAMES.concat(FEATURE_NAMES.map((n) => `${n}_rel`));

/**
 * Drukt elk kenmerk uit ten opzichte van de andere velden van HETZELFDE diagram.
 *
 * Dit is de kern van de aanpak. Een absolute waarde als "midden is 40% donkerder
 * dan de rand" betekent in het ene boek leeg en in het andere een witte schijf,
 * omdat het speelveld daar licht in plaats van donker gedrukt is. De positie
 * binnen het eigen bord betekent in élk boek hetzelfde.
 *
 * Mediaan en MAD, niet gemiddelde en standaarddeviatie: op een bord met veertig
 * schijven of juist drie mag een scheve verdeling de schaal niet meeslepen.
 *
 * @param {number[][]} rawVectors de ruwe kenmerken van alle 50 velden
 * @returns {number[][]} ruw + bord-relatief per veld
 */
export function boardRelative(rawVectors) {
  const d = rawVectors[0].length;
  const med = [];
  const scale = [];
  for (let j = 0; j < d; j++) {
    const col = rawVectors.map((v) => v[j]);
    const m = median(col);
    med.push(m);
    scale.push(1.4826 * median(col.map((v) => Math.abs(v - m))) + 1e-3);
  }
  return rawVectors.map((v) => v.concat(v.map((x, j) => (x - med[j]) / scale[j])));
}

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
