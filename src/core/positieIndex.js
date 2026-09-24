import { applyMove, opposite } from "./draughtsMoves.js?v=20260924f";
import { boardToFen } from "./fen.js?v=20260924f";

// De canonieke sleutel van een stand is dezelfde FEN-tekst die `standen.js` al gebruikt om
// dubbele standen te herkennen (`boardToFen`: velden altijd in dezelfde volgorde, dus twee keer
// dezelfde stand geeft altijd dezelfde tekst, ongeacht via welke zetten je erheen kwam). Daar is
// dus niets nieuws voor nodig — zie CLAUDE.md ("Doelarchitectuur" -> "Positie-index").
//
// Wat hier wél nieuw is: eenzelfde soort index voor een hele `zettenboom` (stap 1/2) in plaats
// van voor één losse stand. Nog niet gekoppeld aan de database — er is nog niets om te indexeren
// (fase 1 voegt geen `partijen`/`studies`-archief toe, dat komt in fase 2/3). Dit is dus puur de
// herbruikbare rekenkern; hoe/waar dat straks opgeslagen wordt, is een keuze voor als er een
// archief is om 'm op toe te passen (zie het verslag bij deze stap).

// Wandelt de hele boom af (hoofdlijn ÉN alle varianten, op elk niveau) en geeft voor elke stand
// erin — inclusief de beginstand zelf, vóór de eerste zet — een indexregel `{ fen, pad }` terug;
// `pad` is de reeks knoop-id's om daar te komen (leeg voor de beginstand zelf). Twee verschillende
// zettenvolgordes die toevallig op dezelfde stand uitkomen (een transpositie) krijgen dezelfde
// `fen` — dat is precies het doel: zoeken op stand kan dan een gewone opzoeking zijn, en vindt
// zo'n stand ongeacht via welke weg (of welke partij/studie) hij bereikt is.
export function indexeerBoom(wortel, bord0, beurt0) {
  const regels = [{ fen: boardToFen(bord0, beurt0), pad: [] }];
  function bezoek(knoop, bord, beurt, pad) {
    for (const kind of knoop.kinderen) {
      const nieuwBord = applyMove(bord, kind.zet);
      const nieuweBeurt = opposite(beurt);
      const nieuwPad = [...pad, kind.id];
      regels.push({ fen: boardToFen(nieuwBord, nieuweBeurt), pad: nieuwPad });
      bezoek(kind, nieuwBord, nieuweBeurt, nieuwPad);
    }
  }
  bezoek(wortel, bord0, beurt0, []);
  return regels;
}

// Zoekt in een lijst indexregels (van één boom, of van meerdere achter elkaar geplakt — zo werkt
// zoeken straks over partijen/studies/openingen heen) naar één of meer gegeven FEN's. Geef zowel
// de gewone als de gespiegelde FEN mee (zoals `standen.js`'s `findDuplicates` dat nu al voor een
// losse stand doet) om ook gespiegelde standen te vinden.
export function zoekPositie(regels, fens) {
  const gezocht = new Set(Array.isArray(fens) ? fens : [fens]);
  return regels.filter((regel) => gezocht.has(regel.fen));
}
