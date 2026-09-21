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
- Staat de oplossing direct bij het diagram (eronder of ernaast) zonder eigen nummer, gebruik dan het nummer dat boven of bij dat diagram staat. Zet alles van één oplossing op één regel, dus ook als het boek de regel afbreekt.
- Onderschriften onder een diagram (zoals "39-34?! (16-21) enz?") en uitleg in woorden zijn geen oplossing: laat ze weg. 
- Staat er bij een oplossing een auteur (bijvoorbeeld "B. Mirotin." of "M. Galkin"), schrijf die dan vlak achter het nummer, vóór de zetten, zoals "287. B. Mirotin. 40-34 ...". Namen van spelers van een partij of verwijzingen ("Zie ook ...") laat je weg.
- Er mogen ook diagrammen op de foto staan; die hoef je niet te beschrijven.
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
