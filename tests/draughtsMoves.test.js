import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260920c";
import { coordToField, createEmptyBoard, PIECE_TYPES } from "../src/core/board.js?v=20260920c";
import { getLegalMoves, applyMove } from "../src/core/draughtsMoves.js?v=20260920c";

// Rij0 = bovenkant (zwart start hier, velden 1-20), rij9 = onderkant (wit start hier, velden 31-50).
// Wit speelt dus "omhoog" (rij neemt af), zwart "omlaag" (rij neemt toe).
function f(row, col) {
  const field = coordToField(row, col);
  if (field == null) throw new Error(`(${row},${col}) is geen speelveld`);
  return field;
}

function place(board, row, col, piece) {
  board[f(row, col)] = piece;
  return board;
}

function findMove(moves, vanField, landField) {
  return moves.find((m) => m.van === vanField && m.pad[m.pad.length - 1] === landField);
}

describe("draughtsMoves: gewone zetten", () => {
  it("een schijf gaat één veld diagonaal vooruit naar een leeg veld", () => {
    const board = place(createEmptyBoard(), 6, 5, PIECE_TYPES.WHITE_PIECE);
    const moves = getLegalMoves(board, "white");
    assertEqual(
      moves.map((m) => `${m.van}->${m.pad.join(",")}`).sort(),
      [`${f(6, 5)}->${f(5, 4)}`, `${f(6, 5)}->${f(5, 6)}`].sort()
    );
    for (const m of moves) assertEqual(m.geslagen, []);
  });

  it("een dam mag willekeurig ver over lege velden diagonaal bewegen", () => {
    const board = place(createEmptyBoard(), 9, 0, PIECE_TYPES.WHITE_KING);
    const moves = getLegalMoves(board, "white");
    // Vanuit de hoek (9,0) kan de dam maar één richting op: (8,1),(7,2)...(0,9).
    assertEqual(moves.length, 9);
    assertTrue(findMove(moves, f(9, 0), f(5, 4)), "verwacht een zet naar (5,4)");
    assertTrue(findMove(moves, f(9, 0), f(0, 9)), "verwacht een zet helemaal tot de rand, (0,9)");
  });
});

describe("draughtsMoves: slagplicht", () => {
  it("als een slag mogelijk is, zijn gewone zetten van andere stukken niet toegestaan", () => {
    const board = createEmptyBoard();
    place(board, 6, 5, PIECE_TYPES.WHITE_PIECE); // slaat
    place(board, 5, 4, PIECE_TYPES.BLACK_PIECE); // wordt geslagen
    place(board, 6, 1, PIECE_TYPES.WHITE_PIECE); // heeft alleen een gewone zet beschikbaar

    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 1);
    assertEqual(moves[0], { van: f(6, 5), pad: [f(4, 3)], geslagen: [f(5, 4)], wordtDam: false });
  });

  it("een schijf mag ook achterwaarts slaan", () => {
    const board = createEmptyBoard();
    place(board, 4, 5, PIECE_TYPES.WHITE_PIECE);
    place(board, 5, 6, PIECE_TYPES.BLACK_PIECE);
    const moves = getLegalMoves(board, "white");
    assertEqual(moves, [{ van: f(4, 5), pad: [f(6, 7)], geslagen: [f(5, 6)], wordtDam: false }]);
  });

  it("kan niet twee keer over hetzelfde stuk springen (stopt na één slag)", () => {
    const board = createEmptyBoard();
    place(board, 6, 5, PIECE_TYPES.WHITE_PIECE);
    place(board, 5, 4, PIECE_TYPES.BLACK_PIECE);
    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 1);
    assertEqual(moves[0].geslagen, [f(5, 4)]);
    assertEqual(moves[0].pad, [f(4, 3)]);
  });
});

describe("draughtsMoves: meeste-slaan-regel", () => {
  it("kiest verplicht de slagreeks met de meeste geslagen stukken", () => {
    const board = createEmptyBoard();
    place(board, 6, 5, PIECE_TYPES.WHITE_PIECE); // de slaande schijf

    // Kortste route (1 slag): via (5,4) naar (4,3), doodlopend.
    place(board, 5, 4, PIECE_TYPES.BLACK_PIECE);

    // Langste route (2 slagen): via (5,6)->(4,7), dan verder via (3,6)->(2,5).
    place(board, 5, 6, PIECE_TYPES.BLACK_PIECE);
    place(board, 3, 6, PIECE_TYPES.BLACK_PIECE);

    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 1);
    assertEqual(moves[0], {
      van: f(6, 5),
      pad: [f(4, 7), f(2, 5)],
      geslagen: [f(5, 6), f(3, 6)],
      wordtDam: false,
    });
  });
});

describe("draughtsMoves: slagreeks terug naar eigen vertrekveld", () => {
  it("mag tijdens dezelfde slagreeks landen op het inmiddels verlaten vertrekveld", () => {
    // Vier zwarte schijven in een ruit rond wit: wit kan de hele ruit rondslaan,
    // in beide richtingen, en komt daarbij terug op zijn eigen (inmiddels
    // verlaten) vertrekveld. Regressietest voor een bug waarbij het statische
    // bord dat vertrekveld nog als bezet zag, waardoor zo'n slagreeks er
    // onterecht vóór stopte (gemeld door Jan: stand met een keuze tussen
    // "23x12x3" en "3x12x23", die allebei nog door hadden moeten slaan naar 14).
    const board = createEmptyBoard();
    place(board, 5, 4, PIECE_TYPES.WHITE_PIECE);
    place(board, 4, 3, PIECE_TYPES.BLACK_PIECE);
    place(board, 2, 3, PIECE_TYPES.BLACK_PIECE);
    place(board, 2, 5, PIECE_TYPES.BLACK_PIECE);
    place(board, 4, 5, PIECE_TYPES.BLACK_PIECE);

    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 2);
    for (const move of moves) {
      assertEqual(move.geslagen.length, 4);
      assertEqual(move.pad[move.pad.length - 1], f(5, 4));
      assertEqual(move.wordtDam, false);
    }
  });
});

describe("draughtsMoves: dam (vliegende schijf)", () => {
  it("een dam mag van veraf slaan en op elk leeg veld erachter landen", () => {
    const board = createEmptyBoard();
    place(board, 1, 0, PIECE_TYPES.WHITE_KING);
    place(board, 3, 2, PIECE_TYPES.BLACK_PIECE);
    // Lege landingsvelden erachter: (4,3),(5,4),(6,5),(7,6),(8,7),(9,8) — 6 opties.
    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 6);
    for (const m of moves) {
      assertEqual(m.van, f(1, 0));
      assertEqual(m.geslagen, [f(3, 2)]);
    }
    assertTrue(findMove(moves, f(1, 0), f(9, 8)), "verwacht een landingsoptie helemaal achteraan");
  });
});

describe("draughtsMoves: promotie", () => {
  it("stopt normaal op de damrij als er vandaar niets meer te slaan valt", () => {
    const board = createEmptyBoard();
    place(board, 2, 1, PIECE_TYPES.WHITE_PIECE);
    place(board, 1, 2, PIECE_TYPES.BLACK_PIECE); // geslagen, landing is de damrij

    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 1);
    assertEqual(moves[0], { van: f(2, 1), pad: [f(0, 3)], geslagen: [f(1, 2)], wordtDam: true });
  });

  it("blijft een schijf als de slagreeks over de damrij heen doorgaat en er verderop eindigt", () => {
    const board = createEmptyBoard();
    place(board, 2, 1, PIECE_TYPES.WHITE_PIECE);
    place(board, 1, 2, PIECE_TYPES.BLACK_PIECE); // eerste slag, landing is de damrij
    place(board, 1, 4, PIECE_TYPES.BLACK_PIECE); // moet ook geslagen worden, nog als schijf
    // Blokkeert verdere landingsopties voorbij (2,5), voor een eenduidige uitkomst.
    place(board, 3, 6, PIECE_TYPES.WHITE_PIECE);

    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 1);
    assertEqual(moves[0], {
      van: f(2, 1),
      pad: [f(0, 3), f(2, 5)],
      geslagen: [f(1, 2), f(1, 4)],
      wordtDam: false,
    });
  });

  it("slaat na de damrij nog steeds als schijf, niet vliegend als dam", () => {
    const board = createEmptyBoard();
    place(board, 2, 1, PIECE_TYPES.WHITE_PIECE);
    place(board, 1, 2, PIECE_TYPES.BLACK_PIECE); // eerste slag, landing is de damrij
    // Op 2 velden afstand (met een leeg veld ertussen) — voor een dam wel te slaan,
    // voor een schijf niet (die kan alleen een aangrenzend stuk slaan).
    place(board, 2, 5, PIECE_TYPES.BLACK_PIECE);

    const moves = getLegalMoves(board, "white");
    assertEqual(moves.length, 1);
    assertEqual(moves[0], { van: f(2, 1), pad: [f(0, 3)], geslagen: [f(1, 2)], wordtDam: true });
  });

  it("een gewone zet naar de laatste rij maakt ook dam", () => {
    const board = place(createEmptyBoard(), 1, 2, PIECE_TYPES.WHITE_PIECE);
    const moves = getLegalMoves(board, "white");
    const toCrownhead = findMove(moves, f(1, 2), f(0, 1));
    assertTrue(toCrownhead, "verwacht een zet naar (0,1)");
    assertEqual(toCrownhead.wordtDam, true);
  });
});

describe("draughtsMoves: applyMove", () => {
  it("verplaatst het stuk, haalt geslagen stukken weg en maakt dam als wordtDam", () => {
    const board = createEmptyBoard();
    place(board, 2, 1, PIECE_TYPES.WHITE_PIECE);
    place(board, 1, 2, PIECE_TYPES.BLACK_PIECE);
    const move = { van: f(2, 1), pad: [f(0, 3)], geslagen: [f(1, 2)], wordtDam: true };
    const next = applyMove(board, move);
    assertEqual(next[f(2, 1)], null);
    assertEqual(next[f(1, 2)], null);
    assertEqual(next[f(0, 3)], PIECE_TYPES.WHITE_KING);
  });

  it("laat het stuktype ongewijzigd als wordtDam niet gezet is", () => {
    const board = place(createEmptyBoard(), 6, 5, PIECE_TYPES.WHITE_PIECE);
    const next = applyMove(board, { van: f(6, 5), pad: [f(5, 4)], geslagen: [], wordtDam: false });
    assertEqual(next[f(5, 4)], PIECE_TYPES.WHITE_PIECE);
  });
});
