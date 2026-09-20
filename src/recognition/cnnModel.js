// Klein neuraal netwerkje (convolutioneel) dat per veld bepaalt: leeg / wit / zwart.
// Zuiver rekenwerk zonder DOM of bibliotheken, zodat exact dezelfde code draait in
// de browser (de app) en in Node (`tools/cnn/train.mjs`, waar het getraind wordt).
//
// Werkwijze, net als de eerdere per-bord-herkenner (`newClassify.js`): het bord wordt
// als geheel klaargezet. Elk veld (60x60 grijs) wordt verkleind naar 30x30 en
// genormaliseerd t.o.v. alle 50 velden van HETZELFDE diagram (gemiddelde en
// spreiding over het hele bord), zodat de drukstijl (licht/donker, gearceerd, foto-
// belichting) er niet meer toe doet. Het netwerk krijgt daarvan een centraal
// uitsnede van 26x26 met twee lagen ("kanalen"):
//   0: de bord-genormaliseerde helderheid (zegt hoe donker/licht dit veld is
//      vergeleken met de rest van het bord);
//   1: dezelfde uitsnede genormaliseerd binnen het veld zelf (zegt hoe de vorm eruit
//      ziet — schijf, ring, arcering — los van het contrast).
//
// Netwerk: conv3x3(2->8) -> ReLU -> maxpool2 -> conv3x3(8->16) -> ReLU -> maxpool2
//          -> dicht(400->32) -> ReLU -> dicht(32->3) -> softmax.

export const CLASSES = ["empty", "white", "black"];
export const CROP_SIZE = 60; // zie buildRawFieldCrops in debugRender.js
export const BASE = 30; // verkleind veld
export const INPUT = 26; // uitsnede die het netwerk ziet
export const MARGIN = (BASE - INPUT) / 2;

const C0 = 2;
const C1 = 8;
const C2 = 16;
const K = 3;
const H1 = INPUT - K + 1; // 24
const P1 = H1 / 2; // 12
const H2 = P1 - K + 1; // 10
const P2 = H2 / 2; // 5
export const FLAT = C2 * P2 * P2; // 400
export const HIDDEN = 32;
export const NUM_CLASSES = 3;

export const SHAPES = {
  conv1w: C1 * C0 * K * K,
  conv1b: C1,
  conv2w: C2 * C1 * K * K,
  conv2b: C2,
  fc1w: HIDDEN * FLAT,
  fc1b: HIDDEN,
  fc2w: NUM_CLASSES * HIDDEN,
  fc2b: NUM_CLASSES,
};

// Grijswaarde (0..255) per pixel uit een crop: {gray} of {data (RGBA), width, height}.
function cropToGray(crop) {
  if (crop.gray) return crop.gray;
  const { data, width, height } = crop;
  const channels = crop.channels || 4;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; p < gray.length; i += channels, p++) {
    gray[p] = channels >= 3 ? 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] : data[i];
  }
  return gray;
}

// 60x60 -> 30x30 door 2x2 gemiddelden.
function shrink(gray, width, height) {
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  if (w !== BASE || h !== BASE) throw new Error(`Verwacht een crop van ${CROP_SIZE}x${CROP_SIZE}, kreeg ${width}x${height}`);
  const out = new Float32Array(BASE * BASE);
  for (let y = 0; y < BASE; y++) {
    for (let x = 0; x < BASE; x++) {
      const i = y * 2 * width + x * 2;
      out[y * BASE + x] = (gray[i] + gray[i + 1] + gray[i + width] + gray[i + width + 1]) / 4;
    }
  }
  return out;
}

// crops: 50 stuks (veld 1..50), elk {gray|data,width,height}. Geeft 50 bord-
// genormaliseerde 30x30-beelden terug (Float32Array van 900).
export function boardToBases(crops) {
  if (crops.length !== 50) throw new Error(`Verwacht 50 velden, kreeg ${crops.length}`);
  const bases = crops.map((c) => shrink(cropToGray(c), c.width, c.height));
  let sum = 0;
  let count = 0;
  for (const b of bases) for (let i = 0; i < b.length; i++) { sum += b[i]; count++; }
  const mean = sum / count;
  let varSum = 0;
  for (const b of bases) for (let i = 0; i < b.length; i++) varSum += (b[i] - mean) ** 2;
  const std = Math.sqrt(varSum / count) || 1;
  for (const b of bases) for (let i = 0; i < b.length; i++) b[i] = (b[i] - mean) / std;
  return bases;
}

// Uit een 30x30-basis de invoer (2 x 26 x 26) van het netwerk maken. ox/oy: verschuiving
// van de uitsnede (0..2*MARGIN, midden = MARGIN), flipX/flipY: spiegelen (alleen bij
// trainen), gain/offset: contrast/helderheid-variatie op het eerste kanaal (alleen bij
// trainen). Bij gebruik in de app: alle standaardwaarden.
export function baseToInput(base, ox = MARGIN, oy = MARGIN, flipX = false, flipY = false, gain = 1, offset = 0, out = null) {
  const input = out || new Float32Array(C0 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  let sum = 0;
  for (let y = 0; y < INPUT; y++) {
    const sy = flipY ? oy + INPUT - 1 - y : oy + y;
    for (let x = 0; x < INPUT; x++) {
      const sx = flipX ? ox + INPUT - 1 - x : ox + x;
      const v = base[sy * BASE + sx] * gain + offset;
      input[y * INPUT + x] = v;
      sum += v;
    }
  }
  const mean = sum / plane;
  let varSum = 0;
  for (let i = 0; i < plane; i++) varSum += (input[i] - mean) ** 2;
  const std = Math.sqrt(varSum / plane) || 1;
  for (let i = 0; i < plane; i++) input[plane + i] = (input[i] - mean) / std;
  return input;
}

// Gewichten: { conv1w, conv1b, conv2w, conv2b, fc1w, fc1b, fc2w, fc2b } als (Float32)Arrays.
export function forward(weights, input, cache = null) {
  const { conv1w, conv1b, conv2w, conv2b, fc1w, fc1b, fc2w, fc2b } = weights;

  // conv1 + ReLU
  const a1 = cache?.a1 || new Float32Array(C1 * H1 * H1);
  for (let co = 0; co < C1; co++) {
    const bias = conv1b[co];
    for (let y = 0; y < H1; y++) {
      for (let x = 0; x < H1; x++) {
        let s = bias;
        for (let ci = 0; ci < C0; ci++) {
          const wBase = (co * C0 + ci) * K * K;
          const iBase = ci * INPUT * INPUT;
          for (let ky = 0; ky < K; ky++) {
            const row = iBase + (y + ky) * INPUT + x;
            const wRow = wBase + ky * K;
            s += conv1w[wRow] * input[row] + conv1w[wRow + 1] * input[row + 1] + conv1w[wRow + 2] * input[row + 2];
          }
        }
        a1[(co * H1 + y) * H1 + x] = s > 0 ? s : 0;
      }
    }
  }

  // pool 2x2 (bewaar de plek van het maximum voor de terugweg)
  const p1 = cache?.p1 || new Float32Array(C1 * P1 * P1);
  const p1i = cache?.p1i || new Uint16Array(C1 * P1 * P1);
  for (let c = 0; c < C1; c++) {
    for (let y = 0; y < P1; y++) {
      for (let x = 0; x < P1; x++) {
        const base = (c * H1 + y * 2) * H1 + x * 2;
        let best = a1[base];
        let idx = base;
        if (a1[base + 1] > best) { best = a1[base + 1]; idx = base + 1; }
        if (a1[base + H1] > best) { best = a1[base + H1]; idx = base + H1; }
        if (a1[base + H1 + 1] > best) { best = a1[base + H1 + 1]; idx = base + H1 + 1; }
        p1[(c * P1 + y) * P1 + x] = best;
        p1i[(c * P1 + y) * P1 + x] = idx;
      }
    }
  }

  // conv2 + ReLU
  const a2 = cache?.a2 || new Float32Array(C2 * H2 * H2);
  for (let co = 0; co < C2; co++) {
    const bias = conv2b[co];
    for (let y = 0; y < H2; y++) {
      for (let x = 0; x < H2; x++) {
        let s = bias;
        for (let ci = 0; ci < C1; ci++) {
          const wBase = (co * C1 + ci) * K * K;
          const iBase = ci * P1 * P1;
          for (let ky = 0; ky < K; ky++) {
            const row = iBase + (y + ky) * P1 + x;
            const wRow = wBase + ky * K;
            s += conv2w[wRow] * p1[row] + conv2w[wRow + 1] * p1[row + 1] + conv2w[wRow + 2] * p1[row + 2];
          }
        }
        a2[(co * H2 + y) * H2 + x] = s > 0 ? s : 0;
      }
    }
  }

  // pool 2x2
  const p2 = cache?.p2 || new Float32Array(FLAT);
  const p2i = cache?.p2i || new Uint16Array(FLAT);
  for (let c = 0; c < C2; c++) {
    for (let y = 0; y < P2; y++) {
      for (let x = 0; x < P2; x++) {
        const base = (c * H2 + y * 2) * H2 + x * 2;
        let best = a2[base];
        let idx = base;
        if (a2[base + 1] > best) { best = a2[base + 1]; idx = base + 1; }
        if (a2[base + H2] > best) { best = a2[base + H2]; idx = base + H2; }
        if (a2[base + H2 + 1] > best) { best = a2[base + H2 + 1]; idx = base + H2 + 1; }
        p2[(c * P2 + y) * P2 + x] = best;
        p2i[(c * P2 + y) * P2 + x] = idx;
      }
    }
  }

  // dicht 1 + ReLU
  const h = cache?.h || new Float32Array(HIDDEN);
  for (let j = 0; j < HIDDEN; j++) {
    let s = fc1b[j];
    const wBase = j * FLAT;
    for (let i = 0; i < FLAT; i++) s += fc1w[wBase + i] * p2[i];
    h[j] = s > 0 ? s : 0;
  }

  // dicht 2 + softmax
  const logits = cache?.logits || new Float32Array(NUM_CLASSES);
  for (let k = 0; k < NUM_CLASSES; k++) {
    let s = fc2b[k];
    const wBase = k * HIDDEN;
    for (let j = 0; j < HIDDEN; j++) s += fc2w[wBase + j] * h[j];
    logits[k] = s;
  }
  let max = -Infinity;
  for (let k = 0; k < NUM_CLASSES; k++) if (logits[k] > max) max = logits[k];
  let total = 0;
  const probs = cache?.probs || new Float32Array(NUM_CLASSES);
  for (let k = 0; k < NUM_CLASSES; k++) {
    probs[k] = Math.exp(logits[k] - max);
    total += probs[k];
  }
  for (let k = 0; k < NUM_CLASSES; k++) probs[k] /= total;
  return probs;
}

// Voorspelt alle 50 velden van één bord. `weights` mag één gewichtenset zijn of een
// lijst (ensemble: de kansen worden gemiddeld). `tta`: ook gespiegelde uitsnedes
// meenemen (iets nauwkeuriger, 4x zoveel rekenwerk — nog steeds ruim onder een
// halve seconde per bord).
export function classifyBoardCnn(weightSets, crops, { tta = true } = {}) {
  const sets = Array.isArray(weightSets) ? weightSets : [weightSets];
  const bases = boardToBases(crops);
  const flips = tta ? [[false, false], [true, false], [false, true], [true, true]] : [[false, false]];
  const buffer = new Float32Array(C0 * INPUT * INPUT);
  return bases.map((base, i) => {
    const probs = [0, 0, 0];
    let n = 0;
    for (const w of sets) {
      for (const [fx, fy] of flips) {
        const p = forward(w, baseToInput(base, MARGIN, MARGIN, fx, fy, 1, 0, buffer));
        for (let k = 0; k < NUM_CLASSES; k++) probs[k] += p[k];
        n++;
      }
    }
    for (let k = 0; k < NUM_CLASSES; k++) probs[k] /= n;
    let best = 0;
    for (let k = 1; k < NUM_CLASSES; k++) if (probs[k] > probs[best]) best = k;
    return {
      square: i + 1,
      label: CLASSES[best],
      confidence: probs[best],
      probs: { empty: probs[0], white: probs[1], black: probs[2] },
    };
  });
}

// JSON (getallenlijsten) <-> Float32Array-gewichten.
export function weightsFromJson(json) {
  const out = {};
  for (const [name, size] of Object.entries(SHAPES)) {
    const arr = json[name];
    if (!arr || arr.length !== size) throw new Error(`Gewichten "${name}" hebben ${arr?.length} waarden, verwacht ${size}`);
    out[name] = Float32Array.from(arr);
  }
  return out;
}

export function weightsToJson(weights, digits = 5) {
  const out = {};
  const f = 10 ** digits;
  for (const name of Object.keys(SHAPES)) out[name] = Array.from(weights[name], (v) => Math.round(v * f) / f);
  return out;
}
