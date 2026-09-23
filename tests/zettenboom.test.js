import { describe, it, assertEqual, assertTrue, assertThrows } from "./test-runner.js?v=20260923d";
import { parseFen } from "../src/core/fen.js?v=20260923d";
import { getLegalMoves, applyMove, opposite } from "../src/core/draughtsMoves.js?v=20260923d";
import {
  maakWortel,
  vindToegestaneZet,
  voegZetToe,
  hoofdlijnKnopen,
  controleerBoom,
  boomVanPlatteOplossing,
  platteOplossingVanBoom,
} from "../src/core/zettenboom.js?v=20260923d";

const START_FEN =
  "W:W31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20";

function start() {
  return parseFen(START_FEN);
}

// Speelt steeds de EERSTE toegestane zet, `aantal` keer — geen echte partij, maar altijd
// geldig, en genoeg om een boom mee te vullen.
function speelDeterministisch(board, turn, aantal) {
  const zetten = [];
  let b = board;
  let t = turn;
  for (let i = 0; i < aantal; i++) {
    const zet = getLegalMoves(b, t)[0];
    zetten.push(zet);
    b = applyMove(b, zet);
    t = opposite(t);
  }
  return zetten;
}

function zonderId(v) {
  return { vanaf: v.vanaf, zetten: v.zetten };
}

describe("zettenboom: vindToegestaneZet", () => {
  it("vindt de toegestane zet bij een geldige notatie", () => {
    const { board, turn } = start();
    const gevonden = vindToegestaneZet(board, turn, "32-28");
    assertTrue(gevonden.ok, "32-28 is een geldige openingszet");
    assertEqual(gevonden.zet.van, 32);
    assertEqual(gevonden.zet.pad, [28]);
  });

  it("meldt een niet-toegestane zet in gewoon Nederlands, in plaats van te crashen", () => {
    const { board, turn } = start();
    const gevonden = vindToegestaneZet(board, turn, "1-6"); // veld 1 is een zwarte schijf, wit is aan zet
    assertTrue(!gevonden.ok, "1-6 mag niet: wit is aan zet en veld 1 is geen witte schijf");
    assertTrue(gevonden.reden.includes("1-6"), "de melding noemt de geweigerde zet");
    assertTrue(gevonden.reden.includes("Toegestaan"), "de melding somt op wat wél mag");
  });

  it("bij een ringslag die op twee manieren tot dezelfde stand leidt, kiest hij er één in plaats van te struikelen", () => {
    // Zelfde stand als bij de perft-controle uit de inventarisatie (CLAUDE.md, "Regelengine"):
    // zwarte schijf op 17 kan de vier witte schijven eromheen rechtsom of linksom slaan en
    // eindigt in beide gevallen weer op 17 — dus dezelfde korte notatie "17x17".
    const { board } = parseFen(
      "B:W21,22,31,32,34,35,36,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,19,20"
    );
    const gevonden = vindToegestaneZet(board, "black", "17x17");
    assertTrue(gevonden.ok, "17x17 moet gevonden worden (twee paden, kies er één)");
    assertEqual(gevonden.zet.van, 17);
    assertEqual(gevonden.zet.pad[gevonden.zet.pad.length - 1], 17);
    assertEqual(gevonden.zet.geslagen.length, 4);
  });
});

describe("zettenboom: voegZetToe", () => {
  it("voegt een zet toe als knoop, via notatietekst", () => {
    const { board, turn } = start();
    const wortel = maakWortel();
    const resultaat = voegZetToe(wortel, board, turn, "32-28");
    assertTrue(resultaat.ok, "32-28 moet mogen");
    assertEqual(wortel.kinderen.length, 1);
    assertEqual(wortel.kinderen[0], resultaat.knoop);
    assertEqual(resultaat.knoop.zet.van, 32);
  });

  it("voegt een zet toe via een kant-en-klaar zet-object (zoals van een klik op het bord)", () => {
    const { board, turn } = start();
    const wortel = maakWortel();
    const echteZet = getLegalMoves(board, turn)[0];
    const resultaat = voegZetToe(wortel, board, turn, echteZet);
    assertTrue(resultaat.ok);
    assertEqual(resultaat.knoop.zet, echteZet);
  });

  it("weigert een onmogelijke zet, ook als zet-object, en voegt niets toe", () => {
    const { board, turn } = start();
    const wortel = maakWortel();
    const onmogelijkeZet = { van: 1, pad: [6], geslagen: [], wordtDam: false }; // veld 1 is zwart, wit is aan zet
    const resultaat = voegZetToe(wortel, board, turn, onmogelijkeZet);
    assertTrue(!resultaat.ok, "een verzonnen zet mag niet stilzwijgend geaccepteerd worden");
    assertEqual(wortel.kinderen.length, 0);
  });

  it("een tweede voegZetToe op dezelfde knoop wordt een variant (tweede kind), niet een vervanging", () => {
    const { board, turn } = start();
    const wortel = maakWortel();
    voegZetToe(wortel, board, turn, "32-28");
    voegZetToe(wortel, board, turn, "31-27");
    assertEqual(wortel.kinderen.length, 2);
    assertEqual(wortel.kinderen[0].zet.van, 32);
    assertEqual(wortel.kinderen[1].zet.van, 31);
  });
});

describe("zettenboom: controleerBoom", () => {
  it("een boom die alleen met voegZetToe is opgebouwd, keurt zichzelf goed", () => {
    const { board, turn } = start();
    const wortel = maakWortel();
    let ouder = wortel;
    let b = board;
    let t = turn;
    for (const zet of speelDeterministisch(board, turn, 4)) {
      const r = voegZetToe(ouder, b, t, zet);
      assertTrue(r.ok);
      ouder = r.knoop;
      b = applyMove(b, zet);
      t = opposite(t);
    }
    assertEqual(controleerBoom(wortel, board, turn), []);
  });

  it("markeert een zet die achteraf geknoeid is, zonder de rest van de boom te laten crashen", () => {
    const { board, turn } = start();
    const zetten = speelDeterministisch(board, turn, 3);
    const wortel = boomVanPlatteOplossing({ zetten });
    const geknoeideKnoop = hoofdlijnKnopen(wortel)[1];
    geknoeideKnoop.zet = { ...geknoeideKnoop.zet, pad: [999], geslagen: [] }; // bestaat niet
    const fouten = controleerBoom(wortel, board, turn);
    assertEqual(fouten.length, 1);
    assertTrue(fouten[0].pad.includes(geknoeideKnoop.id), "het pad wijst de foute knoop aan");
    assertTrue(fouten[0].reden.includes("mag niet"));
  });
});

describe("zettenboom: heen en terug met het bestaande platte model", () => {
  it("zetten + zijvarianten -> boom -> zetten + zijvarianten geeft precies hetzelfde terug", () => {
    const { board, turn } = start();
    const zetten = speelDeterministisch(board, turn, 6);

    // Bouw een zijvariant die zet 3 (index 2) vervangt: de TWEEDE toegestane zet op dat
    // moment, en speel daarna nog 2 zetten deterministisch door.
    let b = board;
    let t = turn;
    for (let i = 0; i < 2; i++) {
      b = applyMove(b, zetten[i]);
      t = opposite(t);
    }
    const alternatief = getLegalMoves(b, t)[1];
    b = applyMove(b, alternatief);
    t = opposite(t);
    const variantZetten = [alternatief, ...speelDeterministisch(b, t, 2)];
    const zijvarianten = [{ id: "oorspronkelijk-id", vanaf: 2, zetten: variantZetten }];

    const boom = boomVanPlatteOplossing({ zetten, zijvarianten });
    const terug = platteOplossingVanBoom(boom);

    assertEqual(terug.zetten, zetten);
    assertEqual(terug.zijvarianten.map(zonderId), zijvarianten.map(zonderId));
  });

  it("een boom zonder varianten geeft lege zijvarianten terug", () => {
    const { board, turn } = start();
    const zetten = speelDeterministisch(board, turn, 3);
    const boom = boomVanPlatteOplossing({ zetten });
    const terug = platteOplossingVanBoom(boom);
    assertEqual(terug.zetten, zetten);
    assertEqual(terug.zijvarianten, []);
  });

  it("weigert een variant-op-een-variant te pletten tot het platte formaat, met een duidelijke reden", () => {
    const { board, turn } = start();
    const wortel = maakWortel();
    const hoofdzet = voegZetToe(wortel, board, turn, getLegalMoves(board, turn)[0]).knoop;
    const bNaHoofdzet = applyMove(board, hoofdzet.zet);
    const tNaHoofdzet = opposite(turn);

    // Variant op de hoofdzet zelf (mag: dat is gewoon een zijvariant).
    const variant = voegZetToe(wortel, board, turn, getLegalMoves(board, turn)[1]).knoop;
    const bNaVariant = applyMove(board, variant.zet);
    const tNaVariant = opposite(turn);

    // En nu een variant BINNEN die variant — dat kan het platte formaat niet weergeven.
    voegZetToe(variant, bNaVariant, tNaVariant, getLegalMoves(bNaVariant, tNaVariant)[0]);
    voegZetToe(variant, bNaVariant, tNaVariant, getLegalMoves(bNaVariant, tNaVariant)[1]);

    assertThrows(() => platteOplossingVanBoom(wortel), "een geneste variant hoort een fout te geven, geen stille dataverlies");
  });
});
