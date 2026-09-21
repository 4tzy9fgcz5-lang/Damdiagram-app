// De vaste opdracht die Jan in een Claude-chat plakt, samen met de foto's van de
// oplossingenpagina's. Het antwoord (platte tekst, één oplossing per regel) plakt hij daarna in
// de bulk-import, waar `splitOplossingenTekst` (src/core/solutionParser.js) het weer uit elkaar haalt.
// Houd de regelvorm hieronder in de pas met die functie.
export const OPLOSSING_OPDRACHT = `Hierbij foto's van pagina's met oplossingen van damopgaven uit een boek. Schrijf de oplossingen over als platte tekst, precies zo:

- Eén oplossing per regel. Elke regel begint met het nummer van de opgave, een punt, en dan de zetten precies zoals ze in het boek staan. Voorbeeld:
570. 1. 21 - 17 22 x 11 2. 30 - 24 19 x 30 3. 38 - 33 29 x 49 ... 10. 45 x 1 x.
- Neem alle zetten en zetnummers over, ook het slotteken "x." aan het eind.
- Varianten neem je precies over: tussen haakjes, of met een letter (zoals "A) 3. ... 23 x 21 4. 35 - 30 ...") achter de hoofdlijn, met dezelfde letter in de hoofdlijn achter de zet waar de variant bij hoort.
- Corrigeer NIETS, ook niet als een zet volgens jou niet kan of een cijfer verkeerd gedrukt lijkt. Ik controleer het zelf. Twijfel je over een cijfer, schrijf dan je beste lezing.
- Tekst in woorden (opmerkingen, namen) mag je weglaten.
- Loopt een oplossing door op de volgende pagina, maak er dan één regel van.
- Geef het hele antwoord in één codeblok, zonder uitleg ervoor of erna.`;

// Kopieert naar het klembord; valt terug op een tijdelijk tekstvak als de moderne manier niet mag.
export async function kopieerNaarKlembord(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = tekst;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
