import { describe, it, assertEqual, assertTrue } from "./test-runner.js";
import { classifyFromFeatures, CONFIDENCE_THRESHOLD } from "../src/recognition/classify.js";
import { PIECE_TYPES } from "../src/core/board.js";

function makeFeatures(occupiedMap, noiseScale = 1, rng = Math.random) {
  const features = new Array(51).fill(null);
  const rand = (a, b) => a + rng() * (b - a);
  for (let f = 1; f <= 50; f++) {
    const kind = occupiedMap[f];
    if (!kind) features[f] = { mean: 180 + rand(-6 * noiseScale, 6 * noiseScale), std: 8 + rand(-2 * noiseScale, 2 * noiseScale) };
    else if (kind === "w") features[f] = { mean: 235 + rand(-5, 5), std: 34 + rand(-3, 3) };
    else if (kind === "b") features[f] = { mean: 55 + rand(-5, 5), std: 34 + rand(-3, 3) };
    else if (kind === "wk") features[f] = { mean: 235 + rand(-5, 5), std: 55 + rand(-4, 4) };
    else if (kind === "bk") features[f] = { mean: 55 + rand(-5, 5), std: 55 + rand(-4, 4) };
  }
  return features;
}

describe("fotoherkenning: classificatie", () => {
  it("herkent de voorbeeldstand uit de opdracht correct (leeg/wit/zwart)", () => {
    const occ = { 13: "w", 15: "w", 33: "w", 1: "b", 5: "b", 30: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(42)));
    assertEqual(board[13], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[15], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[33], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[5], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[30], PIECE_TYPES.BLACK_PIECE);
    for (const f of [2, 3, 4, 6, 7, 20, 40]) assertEqual(board[f], null);
  });

  it("een volledig leeg bord blijft leeg, ook met ruis", () => {
    const { board } = classifyFromFeatures(makeFeatures({}, 1.5, mulberry32(7)));
    for (let f = 1; f <= 50; f++) assertEqual(board[f], null);
  });

  it("geeft dammen een lage betrouwbaarheid (best-effort)", () => {
    const occ = { 13: "w", 33: "wk", 1: "b", 30: "bk" };
    const { board, confidences } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(3)));
    if (board[33] === PIECE_TYPES.WHITE_KING) assertTrue(confidences[33] <= 0.41);
    if (board[30] === PIECE_TYPES.BLACK_KING) assertTrue(confidences[30] <= 0.41);
  });

  it("duidelijke velden krijgen betrouwbaarheid boven de onzeker-drempel", () => {
    const occ = { 13: "w", 1: "b" };
    const { confidences } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(11)));
    assertTrue(confidences[13] > CONFIDENCE_THRESHOLD);
    assertTrue(confidences[1] > CONFIDENCE_THRESHOLD);
    assertTrue(confidences[25] > CONFIDENCE_THRESHOLD);
  });
});

// kleine deterministische pseudo-random generator, zodat deze tests niet toevallig eens falen
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
