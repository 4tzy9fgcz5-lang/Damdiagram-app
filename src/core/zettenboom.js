import { getLegalMoves, applyMove, opposite } from "./draughtsMoves.js?v=20260923d";
import { moveNotation } from "./solutionParser.js?v=20260923d";

// De zettenboom: het gedeelde model voor studies, partijen en openingen (zie CLAUDE.md,
// "Uitbreiding: dam-toolkit" -> "Doelarchitectuur"). Een knoop is één zet, met eventueel
// commentaar en een waarderingsteken (!, ?, !?, !!, ??), en `kinderen`: het eerste kind is
// de voortzetting die ook echt gespeeld is (de hoofdlijn vanaf die knoop), de overige
// kinderen zijn varianten op diezelfde zet. Een variant kan op zijn beurt weer eigen
// kinderen/varianten hebben — varianten mogen dus genest zijn, in tegenstelling tot de
// bestaande `zetten`/`zijvarianten` (één laag), zie het damkunst.nl-voorbeeld in CLAUDE.md.
//
// Een knoop bewaart geen bord: de stand bij een knoop wordt afgeleid door vanaf de
// beginstand van de boom (die de aanroeper geeft, meestal de FEN van de stand) alle zetten
// van de wortel tot die knoop na te spelen met `applyMove` — net als bij de bestaande
// `zetten`/`zijvarianten`, dus niets extra's om op te slaan of uit de pas te laten lopen.

function newNodeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}-${Math.random()}`;
}

// Nieuwe, lege boom: de wortel stelt de beginstand voor (nog geen zet gespeeld) en heeft
// zelf geen `zet`/`commentaar`/`teken` — die horen bij een knoop die wél een zet is.
export function maakWortel() {
  return { id: newNodeId(), zet: null, commentaar: "", teken: "", kinderen: [] };
}

function maakKnoop(zet, { commentaar = "", teken = "" } = {}) {
  return { id: newNodeId(), zet, commentaar, teken, kinderen: [] };
}

// Zoekt onder de toegestane zetten vanaf `bord`/`beurt` de zet die notatie `van-eind` of
// `vanxeind` oplevert. Geeft `{ ok: true, zet }` of `{ ok: false, reden }` terug — nooit een
// exception, zodat een onmogelijke of dubbelzinnige zet altijd gemeld wordt in plaats van
// stilzwijgend genegeerd (zie CLAUDE.md, "Zettenboom": "een onmogelijke zet wordt gemarkeerd").
// Bij een ringslag die op twee manieren hetzelfde opzet (zie CLAUDE.md, "Notatie"): de eerst
// gevonden toegestane zet wint, net als bij `tools/meetOplossingen.mjs`.
export function vindToegestaneZet(bord, beurt, notatie) {
  const schoon = String(notatie ?? "").replace(/\s+/g, "");
  const legaal = getLegalMoves(bord, beurt);
  const treffers = legaal.filter((mv) => moveNotation(mv) === schoon);
  if (treffers.length === 0) {
    return {
      ok: false,
      reden: `"${notatie}" is geen toegestane zet. Toegestaan: ${legaal.map(moveNotation).join(", ") || "geen enkele zet (geen stukken meer?)"}.`,
    };
  }
  return { ok: true, zet: treffers[0] };
}

// Voegt een zet toe aan `ouder` (als hoofdvoortzetting, of als variant als er al een
// hoofdvoortzetting is) en geeft de nieuwe knoop terug — of `{ ok: false, reden }` als de zet
// niet mag. `zet` mag een kant-en-klaar zet-object zijn (zoals uit `getLegalMoves`, bv. van een
// klik op het bord) of een notatietekst ("32-28"/"28x19"), die dan eerst via
// `vindToegestaneZet` gecontroleerd wordt. Zo kan geen enkele aanroeper (klikinvoer, PDN-lezer)
// per ongeluk een onmogelijke zet in de boom krijgen.
export function voegZetToe(ouder, bord, beurt, zet, opts = {}) {
  let echteZet = zet;
  if (typeof zet === "string") {
    const gevonden = vindToegestaneZet(bord, beurt, zet);
    if (!gevonden.ok) return gevonden;
    echteZet = gevonden.zet;
  } else {
    const legaal = getLegalMoves(bord, beurt);
    const treffer = legaal.find(
      (mv) => mv.van === zet.van && mv.pad.join(",") === zet.pad.join(",") && mv.geslagen.join(",") === zet.geslagen.join(",")
    );
    if (!treffer) {
      return { ok: false, reden: `Zet ${moveNotation(zet)} is geen toegestane zet vanuit deze stand.` };
    }
    echteZet = treffer;
  }
  const knoop = maakKnoop(echteZet, opts);
  ouder.kinderen.push(knoop);
  return { ok: true, knoop };
}

// Loopt de hoofdlijn af (steeds het eerste kind) en geeft de knopen terug, wortel niet
// meegerekend. Nuttig voor weergave/print en voor `platteOplossingVanBoom` hieronder.
export function hoofdlijnKnopen(wortel) {
  const pad = [];
  let knoop = wortel;
  while (knoop.kinderen.length > 0) {
    knoop = knoop.kinderen[0];
    pad.push(knoop);
  }
  return pad;
}

// Controleert of elke zet in de boom (hoofdlijn én alle varianten, op elk niveau) een
// toegestane zet is vanuit de gegeven beginstand — een integriteitscontrole voor een boom die
// van buiten komt (bv. een toekomstige PDN-import), los van `voegZetToe` dat dit al bij het
// opbouwen afdwingt. Geeft een lijst meldingen terug (leeg = boom is helemaal geldig); elke
// melding heeft `pad` (de reeks knoop-id's tot en met de foute zet) en `reden`.
export function controleerBoom(wortel, bord, beurt) {
  const fouten = [];
  function bezoek(knoop, huidigBord, huidigeBeurt, padIds) {
    for (const kind of knoop.kinderen) {
      const legaal = getLegalMoves(huidigBord, huidigeBeurt);
      const magWel = legaal.some(
        (mv) => mv.van === kind.zet.van && mv.pad.join(",") === kind.zet.pad.join(",") && mv.geslagen.join(",") === kind.zet.geslagen.join(",")
      );
      const nieuwPad = [...padIds, kind.id];
      if (!magWel) {
        fouten.push({ pad: nieuwPad, reden: `Zet ${moveNotation(kind.zet)} mag niet vanuit deze stand.` });
        continue; // onder een foute zet kan niet zinvol verder gecontroleerd worden
      }
      bezoek(kind, applyMove(huidigBord, kind.zet), opposite(huidigeBeurt), nieuwPad);
    }
  }
  bezoek(wortel, bord, beurt, []);
  return fouten;
}

// ---------- omzetten van/naar het bestaande platte model (`zetten` + `zijvarianten`) ----------
//
// Het bestaande model is precies een boom van maximaal twee lagen: de hoofdlijn (`zetten`,
// een platte lijst) en, per zijvariant, één alternatieve, zelf ook platte reeks die de
// hoofdzet op index `vanaf` vervangt. Dat is dus altijd om te zetten naar en — als de boom
// niet dieper genest is dan dat — weer terug naar een boom.

// `{ zetten, zijvarianten }` (het bestaande opslagformaat van een stand) -> een boom.
// Commentaar/tekens bestaan niet in dat formaat, dus elke knoop krijgt die leeg.
export function boomVanPlatteOplossing({ zetten = [], zijvarianten = [] } = {}) {
  const wortel = maakWortel();
  const hoofdlijn = [wortel];
  for (const zet of zetten) {
    const knoop = maakKnoop(zet);
    hoofdlijn[hoofdlijn.length - 1].kinderen.push(knoop);
    hoofdlijn.push(knoop);
  }
  for (const variant of zijvarianten) {
    if (variant.vanaf < 0 || variant.vanaf >= hoofdlijn.length || !variant.zetten?.length) continue; // zoals solutionPlayer.js: defensief negeren
    const ouder = hoofdlijn[variant.vanaf];
    let vorige = ouder;
    for (const zet of variant.zetten) {
      const knoop = maakKnoop(zet);
      vorige.kinderen.push(knoop);
      vorige = knoop;
    }
  }
  return wortel;
}

// Boom -> `{ zetten, zijvarianten }`. Gooit een duidelijke fout als de boom iets bevat dat het
// platte formaat niet kan weergeven: een variant-op-een-variant (genest dieper dan één laag),
// of meer dan één variant-tak die op dezelfde knoop begint zonder dat er ook een hoofdlijn-
// voortzetting is. Commentaar en tekens gaan bewust verloren (het platte formaat heeft daar
// geen plek voor) — deze functie is dus alleen geschikt voor een boom die oorspronkelijk zelf
// van `boomVanPlatteOplossing` komt, of net zo eenvoudig is.
export function platteOplossingVanBoom(wortel) {
  const hoofdlijn = hoofdlijnKnopen(wortel);
  const zetten = hoofdlijn.map((k) => k.zet);

  const zijvarianten = [];
  const knopenMetIndex = [wortel, ...hoofdlijn]; // index in hoofdlijn (0 = wortel, vóór de eerste zet)
  knopenMetIndex.forEach((knoop, vanaf) => {
    knoop.kinderen.slice(1).forEach((takStart) => {
      const variantZetten = [];
      let cursor = takStart;
      for (;;) {
        variantZetten.push(cursor.zet);
        if (cursor.kinderen.length === 0) break;
        if (cursor.kinderen.length > 1) {
          throw new Error(
            `Deze boom heeft een variant binnen een variant (bij zet ${moveNotation(cursor.zet)}) — dat kan het ` +
              "oude opslagformaat (zetten + zijvarianten, één laag) niet weergeven."
          );
        }
        cursor = cursor.kinderen[0];
      }
      zijvarianten.push({ id: takStart.id, vanaf, zetten: variantZetten });
    });
  });

  return { zetten, zijvarianten };
}
