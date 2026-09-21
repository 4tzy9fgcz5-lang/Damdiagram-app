import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260921as";
import { parseFen } from "../src/core/fen.js?v=20260921as";
import { getLegalMoves, applyMove, opposite, formatZettenMetVarianten } from "../src/core/draughtsMoves.js?v=20260921as";
import { parseOplossing, splitOplossingenPerNummer, splitOplossingenTekst, moveNotation } from "../src/core/solutionParser.js?v=20260921as";

const START_FEN = `W:W${Array.from({ length: 20 }, (_, i) => 31 + i).join(",")}:B${Array.from({ length: 20 }, (_, i) => 1 + i).join(",")}`;

// Vaste "willekeur" zodat de tests elke keer hetzelfde spelen.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function playRandom(board, turn, plies, rand) {
  const moves = [];
  let b = board;
  let t = turn;
  for (let i = 0; i < plies; i++) {
    const legal = getLegalMoves(b, t);
    if (legal.length === 0) break;
    const mv = legal[Math.floor(rand() * legal.length)];
    moves.push(mv);
    b = applyMove(b, mv);
    t = opposite(t);
  }
  return moves;
}

// Zoekt een spel van 8 zetten waarin bij zet `at` (0-based) een andere zet mogelijk is, en geeft
// het spel, het alternatief en de stand daarvoor terug.
function gameWithAlternative(board, turn, at, seedStart) {
  for (let seed = seedStart; seed < seedStart + 200; seed++) {
    const main = playRandom(board, turn, 8, lcg(seed));
    if (main.length < 8) continue;
    let b = board;
    let t = turn;
    for (let i = 0; i < at; i++) {
      b = applyMove(b, main[i]);
      t = opposite(t);
    }
    const alt = getLegalMoves(b, t).find((m) => moveNotation(m) !== moveNotation(main[at]));
    if (alt) return { main, alt, b, t };
  }
  throw new Error("geen spel met alternatief gevonden");
}

const key = (moves) => moves.map((m) => `${m.van}>${m.pad.join(",")}|${m.geslagen.join(",")}`);

describe("solutionParser: gewone oplossingen", () => {
  it("leest een door de app zelf opgeschreven oplossing (met zetnummers) precies terug", () => {
    const { board, turn } = parseFen(START_FEN);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const zetten = playRandom(board, turn, 14, lcg(seed));
      const text = formatZettenMetVarianten(zetten, turn, []);
      const r = parseOplossing(text, { board, turn });
      assertEqual(key(r.zetten), key(zetten), `seed ${seed}: ${text}`);
      assertTrue(r.volledig, `seed ${seed} niet volledig: ${JSON.stringify(r.meldingen)}`);
    }
  });

  it("leest ook zonder spaties, met Cyrillische x, hoofdletter X, en-streepjes, uitroeptekens en slotteken", () => {
    const { board, turn } = parseFen(START_FEN);
    const zetten = playRandom(board, turn, 10, lcg(7));
    const plain = formatZettenMetVarianten(zetten, turn, []);
    const variants = [
      plain.replace(/ /g, ""),
      plain.replace(/x/g, "х"), // Cyrillische х
      plain.replace(/x/g, "X"),
      plain.replace(/-/g, " – "),
      plain.replace(/(\d)\. /g, "$1. ") + "!",
      plain + " x.",
      plain.replace(/ (\d+\.)/g, " $1") + " ... x.",
    ];
    for (const v of variants) {
      const r = parseOplossing(v, { board, turn });
      assertEqual(key(r.zetten), key(zetten), v);
    }
  });

  it("negeert Cyrillisch commentaar en een naam ervoor of erachter", () => {
    const { board, turn } = parseFen(START_FEN);
    const zetten = playRandom(board, turn, 6, lcg(11));
    const text = `${formatZettenMetVarianten(zetten, turn, [])} Красивое переплетение ударов...`;
    const r = parseOplossing(text, { board, turn });
    assertEqual(key(r.zetten), key(zetten));
    assertTrue(r.volledig, JSON.stringify(r.meldingen));
  });
});

describe("solutionParser: varianten", () => {
  it("leest een variant tussen haakjes en koppelt die aan de juiste zet", () => {
    const { board, turn } = parseFen(START_FEN);
    // variant: vanaf zet 3 (0-based) een andere zet, dan nog 3 zetten willekeurig
    const { main, alt, b, t } = gameWithAlternative(board, turn, 3, 21);
    const rest = playRandom(applyMove(b, alt), opposite(t), 3, lcg(22));
    const variant = { vanaf: 3, zetten: [alt, ...rest] };
    const text = formatZettenMetVarianten(main, turn, [variant]);
    const r = parseOplossing(text, { board, turn });
    assertEqual(key(r.zetten), key(main), text);
    assertEqual(r.zijvarianten.length, 1, text);
    assertEqual(r.zijvarianten[0].vanaf, 3);
    assertEqual(key(r.zijvarianten[0].zetten), key(variant.zetten), text);
    assertTrue(r.volledig, JSON.stringify(r.meldingen));
  });

  it("leest een variant met een letter (\"... 4 A ...\" en later \"A) ...\")", () => {
    const { board, turn } = parseFen(START_FEN);
    const { main, alt, b, t } = gameWithAlternative(board, turn, 4, 31);
    const rest = playRandom(applyMove(b, alt), opposite(t), 2, lcg(32));
    const variantText = formatZettenMetVarianten([...main.slice(0, 4), alt, ...rest], turn, []);
    // "1. a b 2. c d 3. e f ..." -> hoofdlijn met A achter zet 4 (index 4) en de variant achter "A)".
    const mainText = formatZettenMetVarianten(main, turn, []);
    const anchorAt = formatZettenMetVarianten(main.slice(0, 5), turn, []).length;
    const withAnchor = `${mainText.slice(0, anchorAt)} A${mainText.slice(anchorAt)}`;
    const varPart = variantText.slice(formatZettenMetVarianten(main.slice(0, 4), turn, []).length).trim();
    const text = `${withAnchor} A) ${varPart}`;
    const r = parseOplossing(text, { board, turn });
    assertEqual(key(r.zetten), key(main), text);
    assertEqual(r.zijvarianten.length, 1, text);
    assertEqual(r.zijvarianten[0].vanaf, 4);
    assertEqual(key(r.zijvarianten[0].zetten), key([alt, ...rest]), text);
  });
});

describe("solutionParser: weggelaten antwoorden", () => {
  it("vult een gedwongen antwoord aan dat het boek met een komma weglaat", () => {
    const { board, turn } = parseFen(START_FEN);
    // zoek een spel waarin zwart of wit een gedwongen (enige) zet heeft
    let found = null;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const rand = lcg(seed);
      let b = board;
      let t = turn;
      const zetten = [];
      for (let i = 0; i < 24; i++) {
        const legal = getLegalMoves(b, t);
        if (legal.length === 0) break;
        if (legal.length === 1 && i > 0 && i < 20) {
          found = { zetten: [...zetten, legal[0], ...playRandom(applyMove(b, legal[0]), opposite(t), 4, rand)], forcedAt: i };
          break;
        }
        const mv = legal[Math.floor(rand() * legal.length)];
        zetten.push(mv);
        b = applyMove(b, mv);
        t = opposite(t);
      }
    }
    assertTrue(found, "geen spel met een gedwongen zet gevonden");
    const { zetten, forcedAt } = found;
    const shown = zetten.filter((_, i) => i !== forcedAt);
    // schrijf de zetten op met de zetnummers van het volledige spel, maar zonder de gedwongen zet
    const full = formatZettenMetVarianten(zetten, turn, []);
    const forced = moveNotation(zetten[forcedAt]);
    const forcedFull = zetten[forcedAt].geslagen.length ? `${zetten[forcedAt].van}x${zetten[forcedAt].pad.join("x")}` : forced;
    const text = full.replace(forcedFull, ",");
    assertTrue(text !== full, "de gedwongen zet stond niet in de tekst");
    const r = parseOplossing(text, { board, turn });
    assertEqual(key(r.zetten), key(zetten), text);
    assertEqual(r.aangevuld, [forcedAt]);
    assertTrue(shown.length < zetten.length);
  });
});

describe("solutionParser: fouten en herstel", () => {
  it("herstelt een verkeerd cijfer naar de dichtstbijzijnde toegestane zet en meldt dat", () => {
    const { board, turn } = parseFen(START_FEN);
    const zetten = playRandom(board, turn, 8, lcg(41));
    const text = formatZettenMetVarianten(zetten, turn, []);
    // verander één cijfer van de derde zet zo dat die niet meer mag maar wel dichtbij ligt
    const third = moveNotation(zetten[2]);
    let hersteld = null;
    for (const digit of "0123456789") {
      const bad = third.slice(0, -1) + digit;
      if (bad === third) continue;
      const r = parseOplossing(text.replace(third, bad), { board, turn });
      if (r.hersteld.length === 1 && key(r.zetten).join() === key(zetten).join()) {
        hersteld = r;
        break;
      }
    }
    assertTrue(hersteld, "geen enkele foute variant werd hersteld");
    assertEqual(hersteld.hersteld[0].ply, 2);
    assertTrue(hersteld.meldingen.some((m) => m.niveau === "let-op" && m.tekst.includes("zet 2 van wit")), JSON.stringify(hersteld.meldingen));
    assertEqual(hersteld.betrouwbaar, false, "een herstelde zet is niet 'betrouwbaar'");
  });

  it("zonder herstel: stopt bij de eerste zet die niet mag en zegt welke", () => {
    const { board, turn } = parseFen(START_FEN);
    const r = parseOplossing("1. 31-27 8-12 2. 32-28", { board, turn });
    assertEqual(r.volledig, false);
    assertEqual(r.zetten.length, 1);
    assertEqual(r.fout.ply, 1);
    assertTrue(r.meldingen.some((m) => m.tekst.includes("zet 1 van zwart")), JSON.stringify(r.meldingen));
  });

  it("melding bij een oplossing die met de andere kleur begint", () => {
    const { board } = parseFen(START_FEN);
    const r = parseOplossing("1. 17-22 32-28", { board, turn: "white" });
    assertEqual(r.zetten.length, 0);
    assertTrue(r.fout?.andereBeurt, JSON.stringify(r));
  });

  it("geeft een duidelijke melding als er helemaal geen zetten in de tekst staan", () => {
    const { board, turn } = parseFen(START_FEN);
    const r = parseOplossing("Красивое переплетение ударов", { board, turn });
    assertEqual(r.zetten.length, 0);
    assertEqual(r.volledig, false);
    assertEqual(r.meldingen[0].niveau, "fout");
  });

  it("melding (geen zet) bij tekst die na de laatste zet nog overblijft", () => {
    const { board, turn } = parseFen(START_FEN);
    const zetten = playRandom(board, turn, 4, lcg(51));
    const text = `${formatZettenMetVarianten(zetten, turn, [])} met dreiging`;
    const r = parseOplossing(text, { board, turn });
    assertEqual(key(r.zetten), key(zetten));
    assertTrue(r.volledig, "tekst zonder cijfers erachter is gewoon commentaar");
  });
});

describe("solutionParser: oplossingenpagina in stukken knippen", () => {
  it("knipt op de gevraagde nummers, in oplopende volgorde", () => {
    const page = `570. 1. 31-27 8-12 2. 38-33 x.\n571. 1. 32-28 18-23 2. 37-32 x.\n573. 1. 33-29 x.`;
    const chunks = splitOplossingenPerNummer(page, [570, 571, 572, 573]);
    assertEqual(Object.keys(chunks), ["570", "571", "573"]);
    assertTrue(chunks[570].startsWith("1. 31-27") && !chunks[570].includes("571"));
    assertTrue(chunks[573].includes("33-29"));
  });
});

describe("solutionParser: geplakte tekst met meerdere oplossingen", () => {
  it("verdeelt per regel, in willekeurige volgorde van de nummers", () => {
    const tekst = "580. 1. 33 - 28 18 - 22 2. 38 - 33!\n570. 1. 21 - 17 22 x 11 2. 30 - 24 x.\n";
    const r = splitOplossingenTekst(tekst);
    assertEqual(r.volgorde, ["580", "570"]);
    assertEqual(r.perNummer["570"], "1. 21 - 17 22 x 11 2. 30 - 24 x.");
    assertEqual(r.dubbel, []);
  });

  it("negeert codeblok-tekens en vet/opsommingstekens uit een chatantwoord", () => {
    const tekst = "```\n**570.** 1. 21 - 17 22 x 11\n- 571. 1. 29 - 24 20 x 49\n```";
    const r = splitOplossingenTekst(tekst);
    assertEqual(r.volgorde, ["570", "571"]);
    assertTrue(r.perNummer["571"].startsWith("1. 29 - 24"));
  });

  it("voegt een doorlopende regel toe aan de vorige oplossing (een zetnummer is geen nieuw nummer)", () => {
    const tekst = "570. 1. 21 - 17 22 x 11 2. 30 - 24 19 x 30\n3. 38 - 33 29 x 49\n12. 40 - 35 x.\n571. 1. 29 - 24 20 x 49";
    const r = splitOplossingenTekst(tekst);
    assertEqual(r.volgorde, ["570", "571"]);
    assertTrue(r.perNummer["570"].includes("3. 38 - 33 29 x 49") && r.perNummer["570"].includes("12. 40 - 35"));
  });

  it("herkent een oplossing met een naam voor de eerste zet en meldt een dubbel nummer", () => {
    const tekst = "585. М. Галкин. 1. 33-29 19x30\n585. 1. 33-29 19x30 2. 39-33";
    const r = splitOplossingenTekst(tekst);
    assertEqual(r.dubbel, ["585"]);
    assertTrue(r.perNummer["585"].startsWith("1. 33-29 19x30 2."));
  });

  it("geeft niets terug voor tekst zonder oplossingen", () => {
    assertEqual(splitOplossingenTekst("Hier zijn je oplossingen!").volgorde, []);
  });
});
