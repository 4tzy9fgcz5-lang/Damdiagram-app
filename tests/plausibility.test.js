import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260920m";
import { checkPlausibility, warningFields } from "../src/recognition/plausibility.js?v=20260920m";
import { createEmptyBoard, PIECE_TYPES } from "../src/core/board.js?v=20260920m";

function boardWith(whites, blacks) {
  const b = createEmptyBoard();
  for (const f of whites) b[f] = PIECE_TYPES.WHITE_PIECE;
  for (const f of blacks) b[f] = PIECE_TYPES.BLACK_PIECE;
  return b;
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("plausibiliteit: damlogica op de herkenning", () => {
  it("geeft geen waarschuwing bij een gelijke, normale stand", () => {
    const board = boardWith(range(31, 39), range(12, 20));
    assertEqual(checkPlausibility(board), []);
  });

  it("accepteert precies 1 stuk verschil in materiaal", () => {
    const board = boardWith(range(31, 40), range(12, 20));
    assertEqual(checkPlausibility(board), []);
  });

  it("waarschuwt bij 2 of meer stukken verschil en wijst de minst zekere lege velden aan", () => {
    const board = boardWith(range(31, 40), range(12, 17)); // 10 wit, 6 zwart: verschil 4
    const conf = new Array(51).fill(1);
    conf[27] = 0.4;
    conf[28] = 0.5;
    conf[29] = 0.6;
    conf[30] = 0.99;
    const warnings = checkPlausibility(board, conf);
    const balance = warnings.find((w) => w.type === "balance");
    assertTrue(!!balance, "verwachtte een materiaalbalans-waarschuwing");
    // verschil 4, 1 mag: minstens 3 velden om na te kijken, de minst zekere lege
    assertEqual(balance.squares, [27, 28, 29]);
    assertTrue(balance.text.includes("10") && balance.text.includes("6"), "aantallen horen in de tekst");
  });

  it("waarschuwt niet bij een verschil van 1 dat groter had kunnen zijn", () => {
    const board = boardWith(range(31, 38), range(12, 18)); // 8 vs 7
    assertTrue(!checkPlausibility(board).some((w) => w.type === "balance"));
  });

  it("meldt dat er geen enkel stuk herkend is (waarschijnlijk foute hoeken)", () => {
    const warnings = checkPlausibility(createEmptyBoard());
    assertEqual(warnings.length, 1);
    assertEqual(warnings[0].type, "none");
  });

  it("markeert een witte schijf op veld 1-5 en een zwarte op 46-50 als 'dam?'", () => {
    const board = boardWith([3, 31, 32], [48, 12, 13]);
    const promos = checkPlausibility(board).filter((w) => w.type === "promotion");
    assertEqual(promos.map((w) => w.square).sort((a, b) => a - b), [3, 48]);
  });

  it("waarschuwt bij meer dan 20 stukken van één kleur", () => {
    const board = boardWith(range(26, 46), range(1, 20).filter((f) => f > 5));
    assertTrue(checkPlausibility(board).some((w) => w.type === "count"));
  });

  it("warningFields verzamelt zowel enkele velden als lijsten van velden", () => {
    const fields = warningFields([
      { type: "promotion", square: 3, text: "" },
      { type: "balance", squares: [27, 28], text: "" },
      { type: "count", text: "" },
    ]);
    assertEqual(fields.sort((a, b) => a - b), [3, 27, 28]);
  });
});
