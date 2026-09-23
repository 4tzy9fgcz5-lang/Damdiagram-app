import { describe, it, assertTrue, assertEqual } from "./test-runner.js?v=20260923j";
import {
  forward, boardToBases, baseToInput, classifyBoardCnn, weightsFromJson, SHAPES, INPUT, BASE, CLASSES,
} from "../src/recognition/cnnModel.js?v=20260923j";
import { createCnnClassifier } from "../src/recognition/cnnClassify.js?v=20260923j";

function zeroWeights() {
  return Object.fromEntries(Object.entries(SHAPES).map(([k, n]) => [k, new Float32Array(n)]));
}

// Een nagemaakt veld van 60x60: donkergrijs veld met eventueel een schijf erop.
function fakeCrop(kind, fieldGray = 110) {
  const size = 60;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - 29.5, y - 29.5);
      let v = fieldGray;
      if (kind === "white" && dist < 21) v = dist > 18 ? 40 : 235; // lichte schijf met donkere rand
      if (kind === "black" && dist < 21) v = dist > 18 ? 240 : 25; // donkere schijf met lichte rand
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

describe("neuraal netwerkje: rekenkern", () => {
  it("geeft met alleen nullen als gewichten drie gelijke kansen (1/3 elk)", () => {
    const input = new Float32Array(2 * INPUT * INPUT).fill(0.5);
    const probs = forward(zeroWeights(), input);
    for (let k = 0; k < 3; k++) assertTrue(Math.abs(probs[k] - 1 / 3) < 1e-6, `kans ${k} = ${probs[k]}`);
  });

  it("normaliseert een bord: gemiddelde 0 en spreiding 1 over alle 50 velden samen", () => {
    const crops = Array.from({ length: 50 }, (_, i) => fakeCrop(i % 3 === 0 ? "white" : i % 3 === 1 ? "black" : "empty"));
    const bases = boardToBases(crops);
    let sum = 0, sq = 0, n = 0;
    for (const b of bases) for (const v of b) { sum += v; sq += v * v; n++; }
    assertTrue(Math.abs(sum / n) < 1e-3, `gemiddelde ${sum / n}`);
    assertTrue(Math.abs(Math.sqrt(sq / n) - 1) < 1e-3, `spreiding ${Math.sqrt(sq / n)}`);
    assertEqual(bases.length, 50);
    assertEqual(bases[0].length, BASE * BASE);
  });

  it("is ongevoelig voor de helderheid van de hele foto (donkere of lichte foto geeft hetzelfde bord)", () => {
    const boardAt = (gray) => Array.from({ length: 50 }, (_, i) => fakeCrop(i % 2 ? "white" : "empty", gray));
    const a = boardToBases(boardAt(100));
    const b = boardToBases(boardAt(100));
    const c = boardToBases(boardAt(100).map((crop) => ({ ...crop, data: crop.data.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v * 0.6))) })));
    for (let i = 0; i < a[0].length; i += 37) assertTrue(Math.abs(a[0][i] - b[0][i]) < 1e-6 && Math.abs(a[1][i] - c[1][i]) < 0.02, `pixel ${i}`);
  });

  it("weigert gewichten met een verkeerd aantal getallen", () => {
    let failed = false;
    try {
      weightsFromJson({ conv1w: [1, 2, 3] });
    } catch {
      failed = true;
    }
    assertTrue(failed, "verwachtte een fout");
  });
});

describe("neuraal netwerkje: echte gewichten (damscan/cnn_weights.json)", () => {
  it("herkent een nagemaakt bord (lege, witte en zwarte velden) grotendeels goed en geeft geldige kansen", async () => {
    const weights = await (await fetch("../damscan/cnn_weights.json")).json();
    const clf = createCnnClassifier(weights);
    const truth = Array.from({ length: 50 }, (_, i) => (i % 5 === 0 ? "white" : i % 5 === 1 ? "black" : "empty"));
    const { squares } = clf.classifyBoard(truth.map((k) => fakeCrop(k)));
    assertEqual(squares.length, 50);
    let right = 0;
    for (const sq of squares) {
      const sum = sq.probs.empty + sq.probs.white + sq.probs.black;
      assertTrue(Math.abs(sum - 1) < 1e-4, `kansen tellen op tot ${sum}`);
      if (sq.label === truth[sq.square - 1]) right++;
    }
    assertTrue(right >= 40, `slechts ${right} van 50 goed op een nagemaakt bord`);
  });

  it("geeft dezelfde uitslag met en zonder terugspiegelen op een duidelijk bord", async () => {
    const weights = await (await fetch("../damscan/cnn_weights.json")).json();
    const models = weights.models.map(weightsFromJson);
    const crops = Array.from({ length: 50 }, (_, i) => fakeCrop(i % 3 === 0 ? "white" : "empty"));
    const withTta = classifyBoardCnn(models, crops, { tta: true });
    const without = classifyBoardCnn(models, crops, { tta: false });
    let same = 0;
    for (let i = 0; i < 50; i++) if (withTta[i].label === without[i].label) same++;
    assertTrue(same >= 45, `slechts ${same} van 50 gelijk`);
    assertTrue(CLASSES.includes(withTta[0].label), "onbekend label");
  });
});
