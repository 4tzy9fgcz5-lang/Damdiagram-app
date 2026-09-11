import { describe, it, assertEqual, assertTrue } from "./test-runner.js";
import { classifyFromFeatures, CONFIDENCE_THRESHOLD } from "../src/recognition/classify.js";
import { PIECE_TYPES, FIELD_COUNT } from "../src/core/board.js";

function makeFeatures(occupiedMap, noiseScale = 1, rng = Math.random) {
  const features = new Array(51).fill(null);
  const rand = (a, b) => a + rng() * (b - a);
  for (let f = 1; f <= 50; f++) {
    const kind = occupiedMap[f];
    if (!kind) {
      const mean = 180 + rand(-6 * noiseScale, 6 * noiseScale);
      features[f] = { mean, std: 8 + rand(-2 * noiseScale, 2 * noiseScale), centerMean: mean };
    } else if (kind === "w") {
      const mean = 235 + rand(-5, 5);
      features[f] = { mean, std: 34 + rand(-3, 3), centerMean: mean };
    } else if (kind === "b") {
      const mean = 55 + rand(-5, 5);
      features[f] = { mean, std: 34 + rand(-3, 3), centerMean: mean };
    } else if (kind === "wk") {
      const mean = 235 + rand(-5, 5);
      features[f] = { mean, std: 55 + rand(-4, 4), centerMean: mean };
    } else if (kind === "bk") {
      const mean = 55 + rand(-5, 5);
      features[f] = { mean, std: 55 + rand(-4, 4), centerMean: mean };
    } else if (kind === "ring") {
      // Simuleert een open ringetje voor wit (zoals sommige boeken tekenen): het
      // venster-gemiddelde ligt door de rand van de ring net onder de achtergrond,
      // maar het midden van de ring blijft achtergrondkleurig (hol).
      features[f] = { mean: 178 + rand(-3, 3), std: 30 + rand(-3, 3), centerMean: 182 + rand(-3, 3) };
    }
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

  it("een volledig leeg bord blijft leeg, ook met ruis (veiligheidsklep bij ontbrekende splitsing)", () => {
    const { board } = classifyFromFeatures(makeFeatures({}, 1.5, mulberry32(7)));
    for (let f = 1; f <= 50; f++) assertEqual(board[f], null);
  });

  it("een schaarse stand (maar 2 stukken) wordt nog steeds herkend", () => {
    const occ = { 40: "w", 10: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(5)));
    assertEqual(board[40], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[10], PIECE_TYPES.BLACK_PIECE);
  });

  it("een drukke stand (44 van de 50 velden bezet) wordt grotendeels correct herkend", () => {
    const occ = {};
    for (let f = 1; f <= 22; f++) occ[f] = "b";
    for (let f = 29; f <= 50; f++) occ[f] = "w";
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(6)));
    let correct = 0;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      const expected = occ[f] ? (occ[f] === "w" ? PIECE_TYPES.WHITE_PIECE : PIECE_TYPES.BLACK_PIECE) : null;
      if (board[f] === expected) correct++;
    }
    assertTrue(correct >= 45, `slechts ${correct}/50 correct`);
  });

  it("herkent geen dammen automatisch (bleek onbetrouwbaar) — elk bezet veld wordt de gewone kleur", () => {
    // "wk"/"bk" hier simuleert een veld met extra textuur (zoals een echte dam eruit kan
    // zien), maar de app mag dit nooit als dam classificeren — alleen als gewone schijf,
    // met de juiste kleur. Dammen wijst Jan zelf aan in de editor.
    const occ = { 13: "w", 33: "wk", 1: "b", 30: "bk" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(3)));
    assertEqual(board[13], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[33], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[30], PIECE_TYPES.BLACK_PIECE);
  });

  it("herkent een open ringetje (hol, wit) correct ondanks een donkerder venster-gemiddelde", () => {
    // Regressietest voor een echt gemelde fout: bij sommige boekstijlen (open ringetje
    // voor wit op een gearceerde achtergrond) trekt de ringrand het hele-venster-
    // gemiddelde net onder de achtergrond, waardoor wit eerder als zwart werd gelezen.
    // De classificatie moet daarom het midden van het veld gebruiken (dat blijft
    // achtergrondkleurig bij een holle ring), niet het venster-gemiddelde.
    const occ = { 15: "ring", 20: "ring", 1: "b", 5: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(23)));
    assertEqual(board[15], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[20], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[5], PIECE_TYPES.BLACK_PIECE);
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
