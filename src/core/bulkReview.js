// Volgorde waarin de diagrammen van een bulk-import gecontroleerd worden (automatische modus).
// Een diagram dat de app zelf niet zeker weet, komt eerst: dan zit je met een frisse blik aan de
// moeilijke gevallen, en de rest (waar de app geen twijfel over heeft) gaat daarna vlot.
//
// Een diagram is `d = { manual, result?: { uncertainFields, warnings }, oplossingStatus, fout }`:
//   - `fout` (kon niet herkend worden) of `manual` (hoeken zelf plaatsen) : moet altijd bekeken worden
//   - `oplossingStatus === "fout"`: de geplakte oplossing past niet op de herkende stand (vaak: een
//     verkeerd herkend veld) -> het sterkste teken dat er iets niet klopt
//   - gele velden of waarschuwingen: de herkenning twijfelde zelf
//   - `oplossingStatus === "let-op"`: oplossing loopt, maar met een herstelde zet of gok

export function reviewScore(d) {
  let score = 0;
  if (d.fout) score = Math.max(score, 300);
  if (d.manual) score = Math.max(score, 250);
  if (d.oplossingStatus === "fout") score = Math.max(score, 200);
  const yellow = d.result?.uncertainFields?.length ?? 0;
  const warnings = d.result?.warnings?.length ?? 0;
  if (yellow > 0 || warnings > 0) score = Math.max(score, 100) + Math.min(yellow, 50) + (warnings > 0 ? 25 : 0);
  if (d.oplossingStatus === "let-op") score = Math.max(score, 50);
  return score;
}

// Waarom staat dit diagram vooraan? Korte uitleg in gewoon Nederlands (leeg = geen twijfel).
export function reviewReason(d) {
  const redenen = [];
  if (d.fout) redenen.push("kon niet automatisch herkend worden");
  if (d.manual) redenen.push("hoeken zelf plaatsen");
  const yellow = d.result?.uncertainFields?.length ?? 0;
  if (yellow > 0) redenen.push(`${yellow} onzeker${yellow === 1 ? "" : "e"} veld${yellow === 1 ? "" : "en"}`);
  if ((d.result?.warnings?.length ?? 0) > 0) redenen.push("waarschuwing bij de herkenning");
  if (d.oplossingStatus === "fout") redenen.push("de oplossing past niet op de herkende stand");
  if (d.oplossingStatus === "let-op") redenen.push("bij de oplossing is een zet aangepast of gegokt");
  return redenen.join(", ");
}

// mode "twijfel": moeilijke gevallen eerst (binnen gelijke score in boekvolgorde);
// mode "boek": ongewijzigd. Geeft een nieuwe lijst terug.
export function orderForReview(diagrams, mode = "twijfel") {
  if (mode !== "twijfel") return [...diagrams];
  return diagrams
    .map((d, i) => ({ d, i, score: reviewScore(d) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.d);
}

// Tellingen voor het overzicht na het herkennen.
export function reviewCounts(diagrams) {
  const counts = { totaal: diagrams.length, zonderTwijfel: 0, onzeker: 0, oplossingFout: 0, handwerk: 0 };
  for (const d of diagrams) {
    if (d.fout || d.manual) counts.handwerk++;
    else if (d.oplossingStatus === "fout") counts.oplossingFout++;
    else if (reviewScore(d) >= 50) counts.onzeker++;
    else counts.zonderTwijfel++;
  }
  return counts;
}
