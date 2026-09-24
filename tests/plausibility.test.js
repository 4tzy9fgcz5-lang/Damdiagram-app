import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260925d";
import { checkPlausibility, warningFields, enforceRules } from "../src/recognition/plausibility.js?v=20260925d";
import { createEmptyBoard, PIECE_TYPES } from "../src/core/board.js?v=20260925d";

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

// Kansen die precies bij het bord passen: elk veld is voor 98% wat er staat.
function probsFor(board) {
  return board.map((piece) =>
    piece === "wp" || piece === "wk"
      ? { empty: 0.01, white: 0.98, black: 0.01 }
      : piece === "bp" || piece === "bk"
      ? { empty: 0.01, white: 0.01, black: 0.98 }
      : { empty: 0.98, white: 0.01, black: 0.01 }
  );
}

describe("plausibiliteit: stand aanpassen naar de materiaalbalans", () => {
  it("laat een stand die al klopt ongemoeid", () => {
    const board = boardWith(range(31, 39), range(12, 20));
    const { board: out, changes } = enforceRules(board, probsFor(board));
    assertEqual(changes, []);
    assertEqual(out, board);
  });

  it("zet de lege velden om waar de herkenner een stuk van de andere kleur het meest mogelijk vond", () => {
    const board = boardWith(range(31, 40), range(12, 17)); // 10 wit, 6 zwart
    const probs = probsFor(board);
    for (const f of [27, 28, 29]) probs[f] = { empty: 0.6, white: 0.05, black: 0.35 };
    probs[30] = { empty: 0.9, white: 0.01, black: 0.09 };
    const { board: out, changes } = enforceRules(board, probs);
    assertEqual(changes.map((c) => c.square).sort((a, b) => a - b), [27, 28, 29]);
    assertTrue(changes.every((c) => c.from === "empty" && c.to === "black"));
    assertEqual(out[27], "bp");
    assertEqual(out[30], null);
  });

  it("kiest een stuk van de teveel-kleur omzetten als dat goedkoper is dan een nieuw stuk zetten", () => {
    const board = boardWith(range(31, 38), range(12, 17)); // 8 wit, 6 zwart
    const probs = probsFor(board);
    probs[33] = { empty: 0.05, white: 0.5, black: 0.45 };
    const { board: out, changes } = enforceRules(board, probs);
    assertEqual(changes.length, 1);
    assertEqual(changes[0], { square: 33, from: "white", to: "black" });
    assertEqual(out[33], "bp");
  });

  it("maakt nooit een gewone schijf op de eigen damrij (wit op 1-5, zwart op 46-50)", () => {
    const board = boardWith(range(31, 34), []);
    const probs = probsFor(board);
    probs[3] = { empty: 0.05, white: 0.05, black: 0.9 }; // veld 3: zwart mag wel
    probs[48] = { empty: 0.05, white: 0.05, black: 0.9 }; // veld 48: zwart NIET toegestaan
    probs[20] = { empty: 0.5, white: 0.01, black: 0.49 };
    const { changes } = enforceRules(board, probs);
    assertTrue(!changes.some((c) => c.square === 48), "veld 48 hoort ongemoeid te blijven");
  });

  it("laat dammen ongemoeid", () => {
    const board = boardWith([31, 32, 33, 34], []);
    board[31] = PIECE_TYPES.WHITE_KING;
    const probs = probsFor(board);
    probs[31] = { empty: 0.01, white: 0.01, black: 0.98 };
    const { board: out } = enforceRules(board, probs);
    assertEqual(out[31], PIECE_TYPES.WHITE_KING);
  });
});
