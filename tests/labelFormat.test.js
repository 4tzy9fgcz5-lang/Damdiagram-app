import { describe, it, assertEqual } from "./test-runner.js?v=20260918e";
import { boardToLabelLine } from "../src/recognition/labelFormat.js?v=20260918e";
import { createEmptyBoard } from "../src/core/board.js?v=20260918e";

function boardFrom(whiteFields, blackFields) {
  const board = createEmptyBoard();
  for (const f of whiteFields) board[f] = "wp";
  for (const f of blackFields) board[f] = "bp";
  return board;
}

describe("labels.txt-regel voor damscan", () => {
  it("komt exact overeen met een regel uit damscan/labels.example.txt", () => {
    // diag01 @arcering-fijn  W: 1,3,5,7-8,10,19,22-24,26,33-34,39,42,50  Z: 6,9,12-13,17,29,31,36-37,43,47-48
    const white = [1, 3, 5, 7, 8, 10, 19, 22, 23, 24, 26, 33, 34, 39, 42, 50];
    const black = [6, 9, 12, 13, 17, 29, 31, 36, 37, 43, 47, 48];
    const line = boardToLabelLine("diag01", boardFrom(white, black), "arcering-fijn");
    assertEqual(
      line,
      "diag01 @arcering-fijn  W: 1,3,5,7-8,10,19,22-24,26,33-34,39,42,50  Z: 6,9,12-13,17,29,31,36-37,43,47-48"
    );
  });

  it("laat de @stijl-tag weg als die niet is opgegeven", () => {
    const line = boardToLabelLine("diag02", boardFrom([1], []), "");
    assertEqual(line, "diag02  W: 1  Z: -");
  });

  it("telt een dam mee als zijn gewone kleur (geen aparte damnotatie)", () => {
    const board = createEmptyBoard();
    board[3] = "wk";
    board[48] = "bk";
    const line = boardToLabelLine("diag03", board);
    assertEqual(line, "diag03  W: 3  Z: 48");
  });

  it("schrijft '-' voor een lege kleurgroep", () => {
    const line = boardToLabelLine("diag04", createEmptyBoard());
    assertEqual(line, "diag04  W: -  Z: -");
  });
});
