// Traint het kleine neurale netwerkje van src/recognition/cnnModel.js in Node.
//
// Gebruik (vanuit de project-root):
//   node tools/cnn/train.mjs gradcheck labels.txt crops uitvoermap     (controle op programmeerfouten in de terugweg)
//   node tools/cnn/train.mjs cv    labels.txt crops uitvoermap <fold>  (één meetronde)
//   node tools/cnn/train.mjs final labels.txt crops uitvoermap <seed>  (model op ALLE data)
//   node tools/cnn/report.mjs uitvoermap                               (cijfers van alle meetrondes)
//   of alles in één keer, parallel:  tools/cnn/run-all.sh labels.txt crops uitvoermap
//
// Eerlijk meten: `cv` laat steeds een groep boekstijlen buiten de training en meet
// daarop (zie FOLDS). Diagrammen zonder boekstijl ("onbekend") worden diagram voor
// diagram over de rondes verdeeld — daar is het cijfer dus iets optimistischer.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  boardToBases, baseToInput, forward, weightsToJson, SHAPES,
  INPUT, MARGIN, FLAT, HIDDEN, NUM_CLASSES, CLASSES,
} from "../../src/recognition/cnnModel.js";

const require = createRequire(import.meta.url);
const { PNG } = require("../../node_modules/pngjs");
const { parseLabelFile } = require("../../damscan/labels.js");

const [, , mode, labelFile, cropsDir, outDir, arg] = process.argv;
if (!mode || !labelFile || !cropsDir || !outDir) {
  console.error("Gebruik: node tools/cnn/train.mjs cv|final labels.txt crops uitvoermap <fold|seed>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// --- data -----------------------------------------------------------------------

// Twee spellingen van dezelfde stijl samenvoegen.
const STYLE_ALIAS = { kovrizkin: "kovrizjkin" };
const normStyle = (s) => STYLE_ALIAS[s.toLowerCase()] ?? s.toLowerCase();

function loadBoards() {
  const parsed = parseLabelFile(fs.readFileSync(labelFile, "utf8"));
  return parsed.map(({ photo, style, labels }) => {
    const crops = [];
    for (let sq = 1; sq <= 50; sq++) {
      const dir = path.join(cropsDir, photo);
      const file = [`${String(sq).padStart(2, "0")}.png`, `${sq}.png`].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
      if (!file) throw new Error(`Crop ontbreekt: ${dir} veld ${sq}`);
      const png = PNG.sync.read(fs.readFileSync(file));
      crops.push({ data: png.data, width: png.width, height: png.height });
    }
    return {
      photo,
      style: normStyle(style),
      bases: boardToBases(crops),
      y: labels.map((l) => CLASSES.indexOf(l)),
    };
  });
}

// Groepen boekstijlen per meetronde. Kleine stijlen zijn samengenomen; "onbekend"
// wordt per diagram verdeeld (zie foldOf).
const STYLE_FOLD = {
  jermakov: 0,
  boezjinski: 1,
  kovrizjkin: 2, watutin: 2, boelat: 2, bezvershenko: 2, plat: 2, stenciltje: 2, ringeltje: 2,
  koeperman: 3, "damspel_kleingoed": 3,
};
const FOLDS = 6;
function foldOf(board, indexInUnknown) {
  const f = STYLE_FOLD[board.style];
  if (f !== undefined) return f;
  // onbekende stijl: over de rondes 3, 4 en 5 verdelen
  return 3 + (indexInUnknown % 3);
}

// --- willekeur (herhaalbaar) ------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- netwerk: gewichten, terugweg, Adam --------------------------------------------

const C0 = 2, C1 = 8, C2 = 16, K = 3;
const H1 = INPUT - K + 1, P1 = H1 / 2, H2 = P1 - K + 1, P2 = H2 / 2;

function initWeights(rand) {
  const w = {};
  const he = (fanIn) => Math.sqrt(2 / fanIn);
  const fill = (name, fanIn) => {
    w[name] = new Float32Array(SHAPES[name]);
    for (let i = 0; i < w[name].length; i++) w[name][i] = gaussian(rand) * he(fanIn);
  };
  fill("conv1w", C0 * K * K); w.conv1b = new Float32Array(SHAPES.conv1b);
  fill("conv2w", C1 * K * K); w.conv2b = new Float32Array(SHAPES.conv2b);
  fill("fc1w", FLAT); w.fc1b = new Float32Array(SHAPES.fc1b);
  fill("fc2w", HIDDEN); w.fc2b = new Float32Array(SHAPES.fc2b);
  return w;
}
const zeroGrads = () => Object.fromEntries(Object.entries(SHAPES).map(([k, n]) => [k, new Float32Array(n)]));

function newCache() {
  return {
    a1: new Float32Array(C1 * H1 * H1), p1: new Float32Array(C1 * P1 * P1), p1i: new Uint16Array(C1 * P1 * P1),
    a2: new Float32Array(C2 * H2 * H2), p2: new Float32Array(FLAT), p2i: new Uint16Array(FLAT),
    h: new Float32Array(HIDDEN), logits: new Float32Array(NUM_CLASSES), probs: new Float32Array(NUM_CLASSES),
  };
}
const back = {
  da1: new Float32Array(C1 * H1 * H1), dp1: new Float32Array(C1 * P1 * P1),
  da2: new Float32Array(C2 * H2 * H2), dp2: new Float32Array(FLAT), dh: new Float32Array(HIDDEN),
};

// Voegt de gradiënten van één voorbeeld toe aan `g` (schaal = 1/batchgrootte).
function backward(w, g, input, cache, target, scale) {
  const { a1, p1, p1i, a2, p2, p2i, h, probs } = cache;
  const { da1, dp1, da2, dp2, dh } = back;
  da1.fill(0); dp1.fill(0); da2.fill(0); dp2.fill(0); dh.fill(0);

  // uitvoerlaag
  for (let k = 0; k < NUM_CLASSES; k++) {
    const dl = (probs[k] - (k === target ? 1 : 0)) * scale;
    g.fc2b[k] += dl;
    const wBase = k * HIDDEN;
    for (let j = 0; j < HIDDEN; j++) {
      g.fc2w[wBase + j] += dl * h[j];
      dh[j] += w.fc2w[wBase + j] * dl;
    }
  }
  // dicht 1 (ReLU)
  for (let j = 0; j < HIDDEN; j++) {
    if (h[j] <= 0) continue;
    const d = dh[j];
    g.fc1b[j] += d;
    const wBase = j * FLAT;
    for (let i = 0; i < FLAT; i++) {
      g.fc1w[wBase + i] += d * p2[i];
      dp2[i] += w.fc1w[wBase + i] * d;
    }
  }
  // pool 2 -> conv 2 (ReLU)
  for (let i = 0; i < FLAT; i++) da2[p2i[i]] += dp2[i];
  for (let co = 0; co < C2; co++) {
    for (let y = 0; y < H2; y++) {
      for (let x = 0; x < H2; x++) {
        const at = (co * H2 + y) * H2 + x;
        if (a2[at] <= 0) continue;
        const d = da2[at];
        if (d === 0) continue;
        g.conv2b[co] += d;
        for (let ci = 0; ci < C1; ci++) {
          const wBase = (co * C1 + ci) * K * K;
          const iBase = ci * P1 * P1;
          for (let ky = 0; ky < K; ky++) {
            const row = iBase + (y + ky) * P1 + x;
            const wRow = wBase + ky * K;
            for (let kx = 0; kx < K; kx++) {
              g.conv2w[wRow + kx] += d * p1[row + kx];
              dp1[row + kx] += d * w.conv2w[wRow + kx];
            }
          }
        }
      }
    }
  }
  // pool 1 -> conv 1 (ReLU)
  for (let i = 0; i < C1 * P1 * P1; i++) da1[p1i[i]] += dp1[i];
  for (let co = 0; co < C1; co++) {
    for (let y = 0; y < H1; y++) {
      for (let x = 0; x < H1; x++) {
        const at = (co * H1 + y) * H1 + x;
        if (a1[at] <= 0) continue;
        const d = da1[at];
        if (d === 0) continue;
        g.conv1b[co] += d;
        for (let ci = 0; ci < C0; ci++) {
          const wBase = (co * C0 + ci) * K * K;
          const iBase = ci * INPUT * INPUT;
          for (let ky = 0; ky < K; ky++) {
            const row = iBase + (y + ky) * INPUT + x;
            const wRow = wBase + ky * K;
            for (let kx = 0; kx < K; kx++) g.conv1w[wRow + kx] += d * input[row + kx];
          }
        }
      }
    }
  }
}

class Adam {
  constructor(weights) {
    this.m = zeroGrads();
    this.v = zeroGrads();
    this.t = 0;
    this.weights = weights;
  }
  step(g, lr, decay) {
    this.t++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - b1 ** this.t, c2 = 1 - b2 ** this.t;
    for (const name of Object.keys(SHAPES)) {
      const w = this.weights[name], gr = g[name], m = this.m[name], v = this.v[name];
      const isWeight = name.endsWith("w");
      for (let i = 0; i < w.length; i++) {
        m[i] = b1 * m[i] + (1 - b1) * gr[i];
        v[i] = b2 * v[i] + (1 - b2) * gr[i] * gr[i];
        w[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
        if (isWeight) w[i] -= lr * decay * w[i];
      }
    }
  }
}

// --- trainen ------------------------------------------------------------------------

const EPOCHS = Number(process.env.EPOCHS || 24);
const BATCH = 32;
const LR_START = 3e-3;
const LR_END = 3e-4;
const DECAY = 1e-3;

function train(samples, seed, log) {
  const rand = mulberry32(seed);
  const w = initWeights(rand);
  const opt = new Adam(w);
  const cache = newCache();
  const input = new Float32Array(C0 * INPUT * INPUT);
  const order = Array.from({ length: samples.length }, (_, i) => i);
  const g = zeroGrads();
  const steps = EPOCHS * Math.ceil(samples.length / BATCH);
  let step = 0;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let loss = 0, ok = 0;
    for (let b = 0; b < order.length; b += BATCH) {
      for (const k of Object.keys(g)) g[k].fill(0);
      const end = Math.min(order.length, b + BATCH);
      const scale = 1 / (end - b);
      for (let n = b; n < end; n++) {
        const s = samples[order[n]];
        // willekeurige verstoringen: verschuiven, spiegelen, contrast/helderheid
        const ox = Math.floor(rand() * (2 * MARGIN + 1));
        const oy = Math.floor(rand() * (2 * MARGIN + 1));
        const gain = 0.75 + rand() * 0.55;
        const offset = gaussian(rand) * 0.25;
        baseToInput(s.base, ox, oy, rand() < 0.5, rand() < 0.5, gain, offset, input);
        forward(w, input, cache);
        backward(w, g, input, cache, s.y, scale);
        loss -= Math.log(Math.max(cache.probs[s.y], 1e-7));
        let best = 0;
        for (let k = 1; k < NUM_CLASSES; k++) if (cache.probs[k] > cache.probs[best]) best = k;
        if (best === s.y) ok++;
      }
      const lr = LR_END + 0.5 * (LR_START - LR_END) * (1 + Math.cos((Math.PI * step) / steps));
      opt.step(g, lr, DECAY);
      step++;
    }
    log(`  ronde ${String(epoch + 1).padStart(2)}/${EPOCHS}  verlies ${(loss / order.length).toFixed(4)}  goed ${(100 * ok / order.length).toFixed(1)}%`);
  }
  return w;
}

// Voorspelt met terugspiegelen (zelfde als in de app: classifyBoardCnn met tta).
function predictAll(w, boards) {
  const flips = [[false, false], [true, false], [false, true], [true, true]];
  const input = new Float32Array(C0 * INPUT * INPUT);
  const out = [];
  for (const bd of boards) {
    for (let sq = 0; sq < 50; sq++) {
      const probs = [0, 0, 0];
      for (const [fx, fy] of flips) {
        const p = forward(w, baseToInput(bd.bases[sq], MARGIN, MARGIN, fx, fy, 1, 0, input));
        for (let k = 0; k < 3; k++) probs[k] += p[k] / flips.length;
      }
      out.push({ photo: bd.photo, style: bd.style, square: sq + 1, y: bd.y[sq], probs });
    }
  }
  return out;
}

const flatSamples = (boards) => boards.flatMap((bd) => bd.bases.map((base, i) => ({ base, y: bd.y[i] })));

// --- hoofdprogramma -----------------------------------------------------------------

const boards = loadBoards();
console.log(`${boards.length} diagrammen ingelezen.`);
let unknownIndex = 0;
boards.forEach((bd) => { bd.fold = foldOf(bd, bd.style === "onbekend" ? unknownIndex++ : 0); });

if (mode === "cv") {
  const fold = Number(arg);
  const trainBoards = boards.filter((b) => b.fold !== fold);
  const testBoards = boards.filter((b) => b.fold === fold);
  console.log(`Meetronde ${fold}: trainen op ${trainBoards.length} diagrammen, meten op ${testBoards.length} (${[...new Set(testBoards.map((b) => b.style))].join(", ")})`);
  const t0 = Date.now();
  const w = train(flatSamples(trainBoards), 1000 + fold, (l) => console.log(l));
  const preds = predictAll(w, testBoards);
  const correct = preds.filter((p) => p.probs.indexOf(Math.max(...p.probs)) === p.y).length;
  console.log(`Meetronde ${fold}: ${(100 * correct / preds.length).toFixed(2)}% goed (${preds.length - correct} fout op ${preds.length}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  fs.writeFileSync(path.join(outDir, `cv_${fold}.json`), JSON.stringify(preds.map((p) => ({ ...p, probs: p.probs.map((v) => +v.toFixed(4)) }))));
} else if (mode === "final") {
  const seed = Number(arg || 1);
  console.log(`Eindmodel (seed ${seed}) op alle ${boards.length} diagrammen`);
  const w = train(flatSamples(boards), seed, (l) => console.log(l));
  const file = path.join(outDir, `cnn_weights_seed${seed}.json`);
  fs.writeFileSync(file, JSON.stringify(weightsToJson(w)));
  console.log(`Gewichten weggeschreven naar ${file}`);
} else if (mode === "gradcheck") {
  // Vergelijkt de terugweg met een numerieke schatting (controle op programmeerfouten).
  const rand = mulberry32(7);
  const w = initWeights(rand);
  const cache = newCache();
  const input = baseToInput(boards[0].bases[3]);
  const target = 1;
  const lossOf = () => { forward(w, input, cache); return -Math.log(cache.probs[target]); };
  forward(w, input, cache);
  const g = zeroGrads();
  backward(w, g, input, cache, target, 1);
  let worst = 0, bad = 0;
  for (const name of Object.keys(SHAPES)) {
    for (let t = 0; t < 12; t++) {
      const i = Math.floor(rand() * w[name].length);
      const orig = w[name][i];
      const e = Number(process.env.EPS || 1e-3);
      w[name][i] = orig + e; const lp = lossOf();
      w[name][i] = orig - e; const lm = lossOf();
      w[name][i] = orig;
      const num = (lp - lm) / (2 * e);
      const ana = g[name][i];
      const rel = Math.abs(num - ana) / Math.max(1e-3, Math.abs(num) + Math.abs(ana));
      worst = Math.max(worst, rel);
      if (rel > 0.05) bad++, console.log(`  AFWIJKING ${name}[${i}] numeriek ${num.toFixed(5)} terugweg ${ana.toFixed(5)}`);
    }
  }
  console.log(`Gradiënt-controle klaar: ${bad} van ${12 * Object.keys(SHAPES).length} afwijkend; grootste relatieve afwijking ${worst.toFixed(4)}`);
}
