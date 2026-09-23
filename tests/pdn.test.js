import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260923h";
import { createStartBoard, createEmptyBoard, PIECE_TYPES } from "../src/core/board.js?v=20260923h";
import { getLegalMoves, applyMove, opposite } from "../src/core/draughtsMoves.js?v=20260923h";
import { moveNotation } from "../src/core/solutionParser.js?v=20260923h";
import { leesPartijTekst } from "../src/core/pdn.js?v=20260923h";

// Bouwt notaties op met de echte regelengine (zoals tests/zettenboom.test.js) in plaats van
// zelf veldnummers te verzinnen — zo test dit bestand alleen het LEZEN van de tekst, niet of ik
// toevallig een geldige zet heb geraden.
function eersteZet(board, turn, n = 0) {
  return moveNotation(getLegalMoves(board, turn)[n]);
}

describe("pdn: hoofdlijn zonder commentaar of varianten", () => {
  it("leest een reeks gewone zetten tot een boom, zonder foutmeldingen", () => {
    const start = createStartBoard();
    const n1 = eersteZet(start, "white");
    const na1 = applyMove(start, getLegalMoves(start, "white")[0]);
    const n2 = eersteZet(na1, "black");

    const { boom, meldingen } = leesPartijTekst(`1. ${n1} ${n2}`);
    assertEqual(meldingen.filter((m) => m.type === "fout"), []);
    assertEqual(boom.kinderen.length, 1);
    assertEqual(moveNotation(boom.kinderen[0].zet), n1);
    assertEqual(boom.kinderen[0].kinderen.length, 1);
    assertEqual(moveNotation(boom.kinderen[0].kinderen[0].zet), n2);
  });
});

describe("pdn: commentaar en waarderingstekens", () => {
  it("hangt {commentaar} op aan de zet die eraan voorafgaat, niet aan de volgende", () => {
    const start = createStartBoard();
    const n1 = eersteZet(start, "white");
    const na1 = applyMove(start, getLegalMoves(start, "white")[0]);
    const n2 = eersteZet(na1, "black");

    const { boom } = leesPartijTekst(`${n1} {een sterke zet} ${n2}`);
    assertEqual(boom.kinderen[0].commentaar, "een sterke zet");
    assertEqual(boom.kinderen[0].kinderen[0].commentaar, "");
  });

  it("leest !/?/!?/!!/??-tekens direct achter een zet", () => {
    const start = createStartBoard();
    const n1 = eersteZet(start, "white");
    const na1 = applyMove(start, getLegalMoves(start, "white")[0]);
    const n2 = eersteZet(na1, "black");

    const { boom } = leesPartijTekst(`${n1}! ${n2}?!`);
    assertEqual(boom.kinderen[0].teken, "!");
    assertEqual(boom.kinderen[0].kinderen[0].teken, "?!");
  });
});

describe("pdn: geneste varianten", () => {
  it("een '(...)' direct na een zet is een alternatief VOOR DIE ZET (PDN-conventie), en mag zelf weer genest zijn", () => {
    const start = createStartBoard();
    const witZetten = getLegalMoves(start, "white");
    const n1 = moveNotation(witZetten[0]); // hoofdlijn
    const n1b = moveNotation(witZetten[1]); // alternatief voor de hoofdzet

    const na1 = applyMove(start, witZetten[0]);
    const n2 = eersteZet(na1, "black"); // vervolg van de hoofdlijn

    const na1b = applyMove(start, witZetten[1]);
    const zwartZettenNa1b = getLegalMoves(na1b, "black");
    const n2b = moveNotation(zwartZettenNa1b[0]); // vervolg van de variant
    const n2bAlt = moveNotation(zwartZettenNa1b[1]); // alternatief DAARBINNEN weer (genest)

    const tekst = `${n1} (${n1b} ${n2b} (${n2bAlt})) ${n2}`;
    const { boom, meldingen } = leesPartijTekst(tekst);
    assertEqual(meldingen.filter((m) => m.type === "fout"), []);

    assertEqual(boom.kinderen.length, 2, "hoofdzet + 1 alternatief voor diezelfde zet");
    assertEqual(moveNotation(boom.kinderen[0].zet), n1);
    assertEqual(boom.kinderen[0].kinderen.length, 1);
    assertEqual(moveNotation(boom.kinderen[0].kinderen[0].zet), n2);

    const variant = boom.kinderen[1];
    assertEqual(moveNotation(variant.zet), n1b);
    assertEqual(variant.kinderen.length, 2, "vervolg van de variant + 1 genest alternatief daarvoor");
    assertEqual(moveNotation(variant.kinderen[0].zet), n2b);
    assertEqual(moveNotation(variant.kinderen[1].zet), n2bAlt);
  });
});

describe("pdn: onmogelijke zetten", () => {
  it("meldt een niet-toegestane zet en leest daarna gewoon verder op dezelfde stand", () => {
    const start = createStartBoard();
    const n1 = eersteZet(start, "white");
    const na1 = applyMove(start, getLegalMoves(start, "white")[0]);
    const n2 = eersteZet(na1, "black"); // de echte, geldige zwarte zet vanuit die stand

    const { boom, meldingen } = leesPartijTekst(`${n1} 1-99 ${n2}`);
    const fouten = meldingen.filter((m) => m.type === "fout");
    assertEqual(fouten.length, 1);
    assertTrue(fouten[0].tekst.includes("1-99"), "de melding noemt de geweigerde zet");

    assertEqual(boom.kinderen[0].kinderen.length, 1, "de foute zet is overgeslagen, niet toegevoegd");
    assertEqual(moveNotation(boom.kinderen[0].kinderen[0].zet), n2, "en de echte zet erna is wél gelezen");
  });
});

describe("pdn: vrije tekst zonder accolades", () => {
  it("wordt als commentaar bij de dichtstbijzijnde zet gezet, met precies één melding erover", () => {
    const start = createStartBoard();
    const n1 = eersteZet(start, "white");
    const na1 = applyMove(start, getLegalMoves(start, "white")[0]);
    const n2 = eersteZet(na1, "black");

    const { boom, meldingen } = leesPartijTekst(`${n1} dit is los commentaar zonder haakjes ${n2} nog meer los commentaar`);
    assertTrue(boom.kinderen[0].commentaar.includes("dit is los commentaar"), "eerste stuk bij de eerste zet");
    assertTrue(boom.kinderen[0].kinderen[0].commentaar.includes("nog meer los commentaar"), "tweede stuk bij de tweede zet");
    assertEqual(meldingen.filter((m) => m.type === "info").length, 1, "maar één melding, niet per los woord");
  });
});

describe("pdn: [Tag \"waarde\"]-regels (zoals een echt PDN-bestand)", () => {
  it("slaat kopregels over en leest de zetten erna gewoon", () => {
    const start = createStartBoard();
    const n1 = eersteZet(start, "white");
    const na1 = applyMove(start, getLegalMoves(start, "white")[0]);
    const n2 = eersteZet(na1, "black");

    const { boom, meldingen } = leesPartijTekst(`[White "Jan"]\n[Black "Piet"]\n1. ${n1} ${n2}`);
    assertEqual(meldingen.filter((m) => m.type === "fout"), []);
    assertEqual(boom.kinderen.length, 1);
    assertEqual(moveNotation(boom.kinderen[0].zet), n1);
  });
});

describe("pdn: voorloopnul", () => {
  it("leest een veld 1-9 ook als '06-11' i.p.v. '6-11' — zoals in Jans overgetikte partij", () => {
    const board = createEmptyBoard();
    board[6] = PIECE_TYPES.BLACK_PIECE;
    const { boom, meldingen } = leesPartijTekst("06-11", { bord: board, beurt: "black" });
    assertEqual(meldingen.filter((m) => m.type === "fout"), []);
    assertEqual(boom.kinderen.length, 1);
    assertEqual(boom.kinderen[0].zet.van, 6);
    assertEqual(boom.kinderen[0].zet.pad, [11]);
  });
});
