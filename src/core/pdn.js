import { createStartBoard } from "./board.js?v=20260923e";
import { applyMove, opposite } from "./draughtsMoves.js?v=20260923e";
import { maakWortel, voegZetToe } from "./zettenboom.js?v=20260923e";

// Leest partij-/studietekst in het formaat uit CLAUDE.md ("Doelarchitectuur"): zetnummers,
// `{commentaar}` en geneste `(varianten)`, met !/?/!!/??-tekens direct achter een zet — zoals
// damkunst.nl het ook doet, en zoals we willen dat Jans overgetikte/geplakte boekfragmenten of
// een geëxporteerd PDN-bestand eruitzien. Bouwt op `src/core/zettenboom.js` (stap 1): elke zet
// wordt gecontroleerd door de regelengine via `voegZetToe`, een onmogelijke zet wordt gemeld en
// overgeslagen (niet stilzwijgend genegeerd, en de rest van de tekst wordt wel gewoon verder
// gelezen).
//
// Dit is BEWUST een ander bestand dan `solutionParser.js` (de bestaande, aparte omzetter voor
// een los overgetikte boekoplossing bij één diagram — ongewijzigd, blijft gewoon werken). Die is
// afgestemd op rommelige OCR-achtige tekst (losse cijfers, Cyrillisch, letter-varianten "A)")
// zonder een vast formaat; déze hier verwacht wél een vast formaat (accolades/haakjes hebben een
// vaste betekenis) maar staat wel genest, in tegenstelling tot solutionParser.js. Beide delen
// dezelfde regelengine-gestuurde zetherkenning (uiteindelijk via `zettenboom.js`).
//
// Bekende beperking (nog niet opgelost): dit leest de KALE zettentekst. Een kopregel zoals
// damkunst.nl die op het scherm toont ("Simon Harmsma - Jan Groenendijk (20-06-2025)") moet er
// vóór de eerste zet af gehaald worden, anders leest "20-06" als een (foute) zet — `[Tag "..."]`-
// regels zoals een echt PDN-bestand die gebruikt worden wel automatisch overgeslagen.

function normalizeText(raw) {
  return String(raw ?? "")
    .replace(/[Xх×Х%]/g, "x")
    .replace(/[–—−‑]/g, "-");
}

function stripTags(text) {
  return text.replace(/\[[A-Za-z]+\s+"[^"]*"\]/g, " ");
}

const MOVE_NUMBER = /^\d{1,3}\.{1,3}/;
const MOVE = /^\d{1,2}[-x]\d{1,2}(?:x\d{1,2})*/;
const TEKEN = /^(!!|\?\?|!\?|\?!|!|\?)/;

function isTokenStart(text) {
  return /^[({)]/.test(text) || MOVE_NUMBER.test(text) || MOVE.test(text);
}

function skipWhitespace(state) {
  while (state.i < state.tekst.length && /\s/.test(state.tekst[state.i])) state.i++;
}

function voegCommentaarToe(knoop, tekst) {
  const stuk = tekst.trim();
  if (!stuk) return;
  knoop.commentaar = knoop.commentaar ? `${knoop.commentaar} ${stuk}` : stuk;
}

// Ontleedt één reeks (de hoofdlijn, of de binnenkant van een `(...)`-variant) vanaf `state.i`,
// en stopt bij een `)` (die zelf niet opgegeten wordt — dat doet de aanroeper) of het einde van
// de tekst. `ouderKnoop`/`bord`/`beurt` is de stand aan het BEGIN van deze reeks; elke gelukte
// zet schuift een eigen, lokale `knoop`/`bord`/`beurt` op, los van wat de aanroeper had.
function ontleedReeks(state, ouderKnoop, bord0, beurt0, meldingen, vrijeTekstMelding) {
  let knoop = ouderKnoop;
  let bord = bord0;
  let beurt = beurt0;
  // PDN-conventie: een '(...)' staat direct ná de zet die hij VERVANGT (een alternatief voor
  // die zet), niet ná de zet die er ooit op volgt — zie bv. damkunst.nl (CLAUDE.md): de variant
  // ná zet 4 (32-28) begint zelf ook weer met "4." (dezelfde zet, ander antwoord), niet met "5.".
  // Daarom onthouden we apart de stand VÓÓR de laatst gelezen zet: een '(' opent dan een nieuwe
  // tak onder diezelfde ouder, vanaf diezelfde stand. Vóór de eerste zet in deze reeks wijst dit
  // naar het begin van de reeks zelf (een '(' zo vroeg is ongebruikelijk, maar crasht niet).
  let vaderVanLaatsteZet = ouderKnoop;
  let bordVoorLaatsteZet = bord0;
  let beurtVoorLaatsteZet = beurt0;

  for (;;) {
    skipWhitespace(state);
    if (state.i >= state.tekst.length) return;
    const ch = state.tekst[state.i];
    if (ch === ")") return;

    if (ch === "{") {
      const eind = state.tekst.indexOf("}", state.i + 1);
      const tot = eind === -1 ? state.tekst.length : eind;
      voegCommentaarToe(knoop, state.tekst.slice(state.i + 1, tot));
      if (eind === -1) meldingen.push({ type: "let-op", tekst: "Een '{' commentaar is niet afgesloten met '}' — de rest van de tekst is als commentaar genomen." });
      state.i = tot + 1;
      continue;
    }

    if (ch === "(") {
      state.i++;
      ontleedReeks(state, vaderVanLaatsteZet, bordVoorLaatsteZet, beurtVoorLaatsteZet, meldingen, vrijeTekstMelding);
      skipWhitespace(state);
      if (state.tekst[state.i] === ")") state.i++;
      else meldingen.push({ type: "let-op", tekst: "Een '(' variant is niet afgesloten met ')'." });
      continue; // de hoofdreeks (knoop/bord/beurt) loopt ongewijzigd door
    }

    const rest = state.tekst.slice(state.i);
    const nrMatch = MOVE_NUMBER.exec(rest);
    if (nrMatch) {
      state.i += nrMatch[0].length;
      continue;
    }

    const zetMatch = MOVE.exec(rest);
    if (zetMatch) {
      const notatie = zetMatch[0];
      state.i += notatie.length;
      const tekenMatch = TEKEN.exec(state.tekst.slice(state.i));
      const teken = tekenMatch ? tekenMatch[0] : "";
      if (tekenMatch) state.i += tekenMatch[0].length;

      const resultaat = voegZetToe(knoop, bord, beurt, notatie, { teken });
      if (!resultaat.ok) {
        meldingen.push({
          type: "fout",
          tekst: `Zet ${notatie} (${beurt === "white" ? "wit" : "zwart"} aan zet) overgeslagen: ${resultaat.reden}`,
        });
        continue; // deze ene zet negeren, de rest van de tekst gewoon op dezelfde stand verder lezen
      }
      vaderVanLaatsteZet = knoop;
      bordVoorLaatsteZet = bord;
      beurtVoorLaatsteZet = beurt;
      knoop = resultaat.knoop;
      bord = applyMove(bord, knoop.zet);
      beurt = opposite(beurt);
      continue;
    }

    // Vrije tekst (geen `{...}`): alles tot het volgende herkenbare stukje, als commentaar bij
    // de laatst gelezen zet (of, als er nog geen zet was, bij de knoop waar deze reeks begon).
    let eind = state.i + 1;
    while (eind < state.tekst.length && !isTokenStart(state.tekst.slice(eind))) eind++;
    const vrijeTekst = state.tekst.slice(state.i, eind);
    state.i = eind;
    if (vrijeTekst.trim()) {
      voegCommentaarToe(knoop, vrijeTekst);
      if (!vrijeTekstMelding.gemeld) {
        vrijeTekstMelding.gemeld = true;
        const kort = vrijeTekst.trim().slice(0, 40);
        meldingen.push({
          type: "info",
          tekst: `Tekst zonder accolades ("${kort}${vrijeTekst.trim().length > 40 ? "…" : ""}") is als commentaar bij de dichtstbijzijnde zet gezet.`,
        });
      }
    }
  }
}

// `tekst` -> een zettenboom (zie `zettenboom.js`) + `meldingen` (`fout`/`let-op`/`info`, in
// gewoon Nederlands). `bord`/`beurt` is de beginstand; standaard de normale beginopstelling
// (voor een partij die gewoon begint), geef een andere stand mee voor een studie/fragment dat
// ergens anders begint.
export function leesPartijTekst(tekst, { bord = createStartBoard(), beurt = "white" } = {}) {
  const meldingen = [];
  const wortel = maakWortel();
  const state = { tekst: normalizeText(stripTags(String(tekst ?? ""))), i: 0 };
  ontleedReeks(state, wortel, bord, beurt, meldingen, { gemeld: false });
  return { boom: wortel, meldingen };
}
