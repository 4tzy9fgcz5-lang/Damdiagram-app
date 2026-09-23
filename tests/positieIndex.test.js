import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260923q";
import { createStartBoard } from "../src/core/board.js?v=20260923q";
import { boardToFen } from "../src/core/fen.js?v=20260923q";
import { getLegalMoves, applyMove, opposite } from "../src/core/draughtsMoves.js?v=20260923q";
import { maakWortel, voegZetToe } from "../src/core/zettenboom.js?v=20260923q";
import { indexeerBoom, zoekPositie } from "../src/core/positieIndex.js?v=20260923q";

function verwacht(bord, beurt) {
  return boardToFen(bord, beurt);
}

describe("positieIndex: indexeerBoom", () => {
  it("indexeert de beginstand zelf, plus elke zet in de hoofdlijn en in een variant", () => {
    const start = createStartBoard();
    const wortel = maakWortel();

    const ply1 = voegZetToe(wortel, start, "white", "32-28").knoop;
    const naPly1 = applyMove(start, ply1.zet);
    const ply2 = voegZetToe(ply1, naPly1, "black", getLegalMoves(naPly1, "black")[0]).knoop;
    const naPly2 = applyMove(naPly1, ply2.zet);

    const variant = voegZetToe(wortel, start, "white", "31-26").knoop; // alternatief voor 32-28
    const naVariant = applyMove(start, variant.zet);

    const regels = indexeerBoom(wortel, start, "white");
    assertEqual(regels.length, 4, "beginstand + 2 hoofdlijn-standen + 1 variant-stand");

    assertEqual(regels[0], { fen: verwacht(start, "white"), pad: [] });
    assertTrue(
      regels.some((r) => r.fen === verwacht(naPly1, "black") && JSON.stringify(r.pad) === JSON.stringify([ply1.id])),
      "de stand na de hoofdzet staat erin, met het juiste pad"
    );
    assertTrue(
      regels.some((r) => r.fen === verwacht(naPly2, "white") && JSON.stringify(r.pad) === JSON.stringify([ply1.id, ply2.id])),
      "de stand na de tweede hoofdzet staat erin"
    );
    assertTrue(
      regels.some((r) => r.fen === verwacht(naVariant, "black") && JSON.stringify(r.pad) === JSON.stringify([variant.id])),
      "de stand na de variant-zet staat er ook in, met een eigen pad"
    );
  });
});

describe("positieIndex: transpositie", () => {
  it("twee verschillende zettenvolgordes die op dezelfde stand uitkomen, krijgen dezelfde sleutel", () => {
    // Twee losstaande witte zetten (31-26 en 32-28, andere schijf, geen slag) en twee losstaande
    // zwarte antwoorden (16-21 en 11-16): de volgorde waarin wit zijn twee zetten speelt maakt
    // voor de UITEINDELIJKE stand niets uit. Vooraf gecontroleerd met de echte regelengine
    // (zie de sessie waarin deze stap gebouwd is) — wordt hier opnieuw, "live", nagespeeld.
    const start = createStartBoard();

    function bouwReeks(volgorde) {
      const wortel = maakWortel();
      let knoop = wortel;
      let bord = start;
      let beurt = "white";
      for (const notatie of volgorde) {
        const r = voegZetToe(knoop, bord, beurt, notatie);
        assertTrue(r.ok, `${notatie} moet een toegestane zet zijn vanuit deze stand`);
        knoop = r.knoop;
        bord = applyMove(bord, knoop.zet);
        beurt = opposite(beurt);
      }
      return indexeerBoom(wortel, start, "white");
    }

    const regels1 = bouwReeks(["31-26", "16-21", "32-28", "11-16"]);
    const regels2 = bouwReeks(["32-28", "16-21", "31-26", "11-16"]);

    const eindstand1 = regels1[regels1.length - 1];
    const eindstand2 = regels2[regels2.length - 1];
    assertEqual(eindstand1.fen, eindstand2.fen);
  });
});

describe("positieIndex: zoekPositie", () => {
  it("vindt een stand die alleen in een variant voorkomt, niet in de hoofdlijn", () => {
    const start = createStartBoard();
    const wortel = maakWortel();

    const hoofdzet = voegZetToe(wortel, start, "white", "32-28").knoop;
    const naHoofdzet = applyMove(start, hoofdzet.zet);
    const hoofdvervolg = voegZetToe(hoofdzet, naHoofdzet, "black", getLegalMoves(naHoofdzet, "black")[0]).knoop;

    const variant = voegZetToe(wortel, start, "white", "31-26").knoop;
    const naVariant = applyMove(start, variant.zet);
    const variantVervolg = voegZetToe(variant, naVariant, "black", getLegalMoves(naVariant, "black")[0]).knoop;
    const naVariantVervolg = applyMove(naVariant, variantVervolg.zet);

    const regels = indexeerBoom(wortel, start, "white");
    const gezochtFen = verwacht(naVariantVervolg, "white");
    const gevonden = zoekPositie(regels, gezochtFen);

    assertEqual(gevonden.length, 1);
    assertEqual(gevonden[0].pad, [variant.id, variantVervolg.id]);
  });

  it("werkt net zo goed over meerdere bronnen heen (een losse stand samen met een partijboom)", () => {
    const start = createStartBoard();

    // Een "losse stand" zoals die nu al bestaat (standen.js): geen boom, gewoon 1 positie.
    const eenLosseStand = { fen: verwacht(start, "white"), pad: [] };

    const wortel = maakWortel();
    const zet = voegZetToe(wortel, start, "white", "32-28").knoop;
    const naZet = applyMove(start, zet.zet);
    const boomRegels = indexeerBoom(wortel, start, "white");

    const samen = [eenLosseStand, ...boomRegels];
    assertEqual(zoekPositie(samen, verwacht(start, "white")).length, 2, "de beginstand staat in beide bronnen");
    assertEqual(zoekPositie(samen, verwacht(naZet, "black")).length, 1, "de stand na de zet staat alleen in de partijboom");
  });
});
