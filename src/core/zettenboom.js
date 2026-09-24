import { getLegalMoves, applyMove, opposite, plyColor, plyMoveNumber, moveToNotation } from "./draughtsMoves.js?v=20260924f";
import { moveNotation } from "./solutionParser.js?v=20260924f";

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

// Sommige boeken/partijbestanden schrijven een veld 1-9 met een voorloopnul ("06-11" i.p.v.
// "6-11", zoals Jan liet zien met een echte, overgetikte partij) — puur schrijfwijze, geen
// andere zet. Haalt zo'n voorloopnul weg vóór het vergelijken, zodat "06-11" en "6-11" dezelfde
// zet zijn. `moveNotation`/`moveToNotation` schrijven zelf nooit een voorloopnul; zie
// `notatieMetVoorloopnul` hieronder voor de OMGEKEERDE weg (weergave mét voorloopnul, op Jans
// verzoek voorlopig alleen voor de boom-viewer, niet overal in de app — zie het verslag).
function zonderVoorloopnul(notatie) {
  return notatie.replace(/(^|[-x])0+(\d)/g, "$1$2");
}

// Zoekt onder de toegestane zetten vanaf `bord`/`beurt` de zet die notatie `van-eind` of
// `vanxeind` oplevert. Geeft `{ ok: true, zet }` of `{ ok: false, reden }` terug — nooit een
// exception, zodat een onmogelijke of dubbelzinnige zet altijd gemeld wordt in plaats van
// stilzwijgend genegeerd (zie CLAUDE.md, "Zettenboom": "een onmogelijke zet wordt gemarkeerd").
// Bij een ringslag die op twee manieren hetzelfde opzet (zie CLAUDE.md, "Notatie"): de eerst
// gevonden toegestane zet wint, net als bij `tools/meetOplossingen.mjs`.
export function vindToegestaneZet(bord, beurt, notatie) {
  const schoon = zonderVoorloopnul(String(notatie ?? "").replace(/\s+/g, ""));
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

// Weergave MET voorloopnul ("01-06" i.p.v. "1-06"... "1-6"), zoals Jan 'm gewend is uit
// damboeken. Bewust een aparte functie i.p.v. een wijziging aan `moveToNotation`
// (`draughtsMoves.js`, de regelengine — die blijft ongewijzigd): die wordt door de hele app
// gebruikt (stencils, Word-export, CSV, elke bestaande stand) en dat op dezelfde manier
// aanpassen is een grotere, zichtbare wijziging die eerst apart besproken moet worden.
export function notatieMetVoorloopnul(zet) {
  const pad2 = (n) => String(n).padStart(2, "0");
  return zet.geslagen.length === 0 ? `${pad2(zet.van)}-${pad2(zet.pad[0])}` : `${pad2(zet.van)}x${zet.pad.map(pad2).join("x")}`;
}

// Weergave MET voorloopnul, en bij een slag ALLEEN begin- en eindveld (geen tussenliggende
// landingsvelden) — Jans wens voor het printen van een partij (CLAUDE.md-feedback 2026-09-23):
// "bij slagen alleen beginveld en eindveld in notatie opnemen". Dit is precies de vorm die
// `vindToegestaneZet` hierboven al accepteert (via `moveNotation` uit solutionParser.js, dat ZELF
// ook al alleen begin/eind schrijft) — een print in dit formaat is dus altijd weer in te lezen,
// ook als er een ringslag is die op twee manieren hetzelfde begin/eind geeft (zie CLAUDE.md,
// "Notatie": een bekende, geaccepteerde onnauwkeurigheid van deze korte vorm, niet nieuw hier).
export function notatieKortMetVoorloopnul(zet) {
  const pad2 = (n) => String(n).padStart(2, "0");
  if (zet.geslagen.length === 0) return `${pad2(zet.van)}-${pad2(zet.pad[0])}`;
  return `${pad2(zet.van)}x${pad2(zet.pad[zet.pad.length - 1])}`;
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

// Zoekt de knoop op het gegeven pad (een reeks knoop-id's, zoals `indexeerBoom`/`voegZetToe`
// die teruggeven) — `[]` is de wortel zelf. Geeft `null` als het pad niet (meer) bestaat, bv.
// omdat een knoop intussen ergens anders verwijderd is. Gebruikt door de boom-viewer om van "waar
// sta ik" (een pad) terug naar de knoop (en dus de zet/commentaar) te gaan.
export function knoopOpPad(wortel, pad) {
  let knoop = wortel;
  for (const id of pad) {
    const volgende = knoop.kinderen.find((k) => k.id === id);
    if (!volgende) return null;
    knoop = volgende;
  }
  return knoop;
}

// Speelt een pad na vanaf de beginstand en geeft de stand DAAR terug (`{ bord, beurt }`) —
// het spiegelbeeld van `indexeerBoom` in `positieIndex.js`, maar dan voor één pad in plaats van
// de hele boom. Gooit een fout als het pad niet bestaat (zie `knoopOpPad`).
export function standBijPad(wortel, bord0, beurt0, pad) {
  let bord = bord0;
  let beurt = beurt0;
  let knoop = wortel;
  for (const id of pad) {
    knoop = knoop.kinderen.find((k) => k.id === id);
    if (!knoop) throw new Error(`Knoop "${id}" bestaat niet (meer) in deze boom.`);
    bord = applyMove(bord, knoop.zet);
    beurt = opposite(beurt);
  }
  return { bord, beurt };
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

// ---------- leesbare tekst (voor printen/export) ----------

// Zet een hele boom om naar leesbare tekst: hoofdlijn met genest `(varianten)` en
// `{commentaar}` — precies het formaat dat `pdn.js` ook weer inleest (`leesPartijTekst`), dus
// dit is het spiegelbeeld daarvan. Gebruikt voor het printen van een partij (fase 2, stap 4).
// `beurt0` is wie de EERSTE zet van de boom speelt (voor de zetnummering, zie
// `plyColor`/`plyMoveNumber` in `draughtsMoves.js`).
export function formatteerBoomTekst(wortel, beurt0) {
  const stukken = [];

  function schrijfZet(knoop, ply, forceerZetnummer) {
    const kleur = plyColor(beurt0, ply);
    if (kleur === "white") stukken.push(`${plyMoveNumber(beurt0, ply)}.`);
    else if (forceerZetnummer) stukken.push(`${plyMoveNumber(beurt0, ply)}. ...`);
    stukken.push(moveToNotation(knoop.zet) + (knoop.teken ?? ""));
    if (knoop.commentaar) stukken.push(`{${knoop.commentaar}}`);
  }

  function schrijfReeks(ouderKnoop, ply) {
    if (ouderKnoop.kinderen.length === 0) return;
    const [hoofdKind, ...varianten] = ouderKnoop.kinderen;
    schrijfZet(hoofdKind, ply, false);
    for (const variant of varianten) {
      stukken.push("(");
      schrijfZet(variant, ply, true);
      schrijfReeks(variant, ply + 1);
      stukken.push(")");
    }
    schrijfReeks(hoofdKind, ply + 1);
  }

  schrijfReeks(wortel, 0);
  // "( 1. 31-26" -> "(1. 31-26", "18-22 )" -> "18-22)" — de haakjes zelf staan als eigen
  // stukken tekst in `stukken` (zie hierboven), dus zonder deze opschoning zou join(" ")
  // overal een losse spatie eromheen zetten.
  return stukken.join(" ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}
