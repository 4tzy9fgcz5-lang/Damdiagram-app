import { describe, it, assertEqual, assertThrows, assertTrue } from "./test-runner.js";
import {
  fieldToCoord,
  coordToField,
  mirrorField,
  mirrorBoard,
  createEmptyBoard,
  createStartBoard,
  boardsEqual,
  PIECE_TYPES,
} from "../src/core/board.js";
import { parseFen, boardToFen, FenParseError } from "../src/core/fen.js";
import { parseQuickText, QuickTextParseError } from "../src/core/quicktext.js";
import { validateBoard } from "../src/core/validate.js";

describe("veldnummering", () => {
  it("veld 1 staat rechtsboven-tweede kolom (rij0, kolom1)", () => {
    assertEqual(fieldToCoord(1), { row: 0, col: 1 });
  });
  it("veld 5 staat rechtsboven (rij0, kolom9)", () => {
    assertEqual(fieldToCoord(5), { row: 0, col: 9 });
  });
  it("veld 46 is de donkere hoek linksonder (rij9, kolom0)", () => {
    assertEqual(fieldToCoord(46), { row: 9, col: 0 });
  });
  it("veld 50 zit rechtsonder (rij9, kolom8)", () => {
    assertEqual(fieldToCoord(50), { row: 9, col: 8 });
  });
  it("linksboven (rij0,kolom0) is licht en heeft geen veldnummer", () => {
    assertEqual(coordToField(0, 0), null);
  });
  it("coordToField en fieldToCoord zijn elkaars inverse voor alle 50 velden", () => {
    for (let f = 1; f <= 50; f++) {
      const { row, col } = fieldToCoord(f);
      assertEqual(coordToField(row, col), f, `veld ${f}`);
    }
  });
});

describe("spiegelen", () => {
  it("spiegelt de hoeken van rij 0 naar elkaar (1 <-> 5)", () => {
    assertEqual(mirrorField(1), 5);
    assertEqual(mirrorField(5), 1);
  });
  it("middelste veld van een rij blijft op zichzelf staan (veld 3)", () => {
    assertEqual(mirrorField(3), 3);
  });
  it("spiegelt de onderste rij (46 <-> 50)", () => {
    assertEqual(mirrorField(46), 50);
    assertEqual(mirrorField(50), 46);
  });
  it("spiegelen van een stand en terugspiegelen geeft de oorspronkelijke stand terug", () => {
    const board = createStartBoard();
    const twice = mirrorBoard(mirrorBoard(board));
    assertTrue(boardsEqual(board, twice));
  });
});

describe("FEN parsen en schrijven", () => {
  it("parseert een leeg bord", () => {
    const { board, turn } = parseFen("W:W:B");
    assertEqual(turn, "white");
    for (let f = 1; f <= 50; f++) assertEqual(board[f], null, `veld ${f}`);
  });
  it("parseert de voorbeeldstand uit de opdracht", () => {
    const { board, turn } = parseFen("W:W13,15,33:B1,5,30");
    assertEqual(turn, "white");
    assertEqual(board[13], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[15], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[33], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[5], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[30], PIECE_TYPES.BLACK_PIECE);
  });
  it("parseert dammen met de K-prefix", () => {
    const { board } = parseFen("W:W31,32,33,K45:B1,2,3,K7");
    assertEqual(board[45], PIECE_TYPES.WHITE_KING);
    assertEqual(board[7], PIECE_TYPES.BLACK_KING);
    assertEqual(board[31], PIECE_TYPES.WHITE_PIECE);
  });
  it("schrijft een stand terug naar dezelfde FEN", () => {
    const fen = "W:W31,32,33,K45:B1,2,3,K7";
    const { board, turn } = parseFen(fen);
    assertEqual(boardToFen(board, turn), fen);
  });
  it("rondrit: FEN -> bord -> FEN blijft gelijk voor de startstand", () => {
    const board = createStartBoard();
    const fen = boardToFen(board, "white");
    const { board: board2 } = parseFen(fen);
    assertTrue(boardsEqual(board, board2));
  });
  it("gooit een fout bij een ontbrekende aan-zet-letter", () => {
    assertThrows(() => parseFen("W13,15:B1,5"));
  });
  it("gooit een fout bij een dubbel veld", () => {
    assertThrows(() => parseFen("W:W13,13:B"));
  });
});

describe("snelle tekstinvoer", () => {
  it("parseert 'wit 27 28 32 d45 zwart 12 13 19'", () => {
    const { board } = parseQuickText("wit 27 28 32 d45 zwart 12 13 19");
    assertEqual(board[27], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[45], PIECE_TYPES.WHITE_KING);
    assertEqual(board[12], PIECE_TYPES.BLACK_PIECE);
  });
  it("accepteert komma's als scheiding", () => {
    const { board } = parseQuickText("wit 1, 2, K3 zwart 46,47");
    assertEqual(board[1], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[3], PIECE_TYPES.WHITE_KING);
    assertEqual(board[46], PIECE_TYPES.BLACK_PIECE);
  });
  it("gooit een fout als een veldnummer voor 'wit'/'zwart' komt", () => {
    assertThrows(() => parseQuickText("27 28 wit 1"));
  });
});

describe("validatie van onmogelijke standen", () => {
  it("waarschuwt bij een witte schijf op veld 1-5", () => {
    const board = createEmptyBoard();
    board[3] = PIECE_TYPES.WHITE_PIECE;
    const warnings = validateBoard(board);
    assertTrue(warnings.some((w) => w.includes("3")));
  });
  it("waarschuwt bij een zwarte schijf op veld 46-50", () => {
    const board = createEmptyBoard();
    board[48] = PIECE_TYPES.BLACK_PIECE;
    const warnings = validateBoard(board);
    assertTrue(warnings.some((w) => w.includes("48")));
  });
  it("waarschuwt niet bij een normale startstand", () => {
    const board = createStartBoard();
    assertEqual(validateBoard(board), []);
  });
  it("waarschuwt bij meer dan 20 stukken van een kleur", () => {
    const board = createEmptyBoard();
    for (let f = 6; f <= 26; f++) board[f] = PIECE_TYPES.WHITE_PIECE;
    const warnings = validateBoard(board);
    assertTrue(warnings.some((w) => w.toLowerCase().includes("wit")));
  });
});
