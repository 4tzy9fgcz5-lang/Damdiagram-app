import { FIELD_COUNT, PIECE_TYPES, EMPTY, isWhite, isBlack } from "../core/board.js?v=20260922a";

// Damlogica als vangnet op de fotoherkenning, los van welke herkenner draaide.
// Corrigeert niets stilzwijgend: geeft waarschuwingen terug (en velden die het
// verdient om extra na te kijken), zodat Jan ze in de editor ziet.
//
// Regels:
//  - geen enkel stuk herkend: waarschijnlijk staan de hoeken verkeerd;
//  - meer dan 20 stukken van één kleur: onmogelijk;
//  - een gewone schijf op de damrij van de eigen kleur: had dam moeten zijn (dammen
//    worden nooit automatisch herkend, dus dit is bijna altijd een fout of een dam);
//  - materiaalbalans: in Jans verzameling is het aantal witte en zwarte stukken in
//    ~95% van de opgaven gelijk, en de enige normale afwijking is precies 1 stuk
//    (bevestigd door Jan, 2026-09-20). Een groter verschil betekent vrijwel altijd
//    dat er een stuk gemist of dubbel gezien is.

const MAX_PIECES_PER_COLOR = 20;
const MAX_BALANCE_DIFFERENCE = 1;

// board: array met index 1..50 (zoals overal in de app). confidences: optioneel,
// zelfde indexering, hoe zeker de herkenner van elk veld was (1 = helemaal zeker).
export function checkPlausibility(board, confidences = []) {
  const warnings = [];
  const whites = [];
  const blacks = [];
  const empties = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    if (isWhite(board[f])) whites.push(f);
    else if (isBlack(board[f])) blacks.push(f);
    else empties.push(f);
  }
  const nW = whites.length;
  const nB = blacks.length;

  if (nW + nB === 0) {
    warnings.push({
      type: "none",
      text: "Geen enkel stuk herkend — staan de hoeken wel op het dambordpatroon?",
    });
    return warnings;
  }

  if (nW > MAX_PIECES_PER_COLOR) warnings.push({ type: "count", text: `${nW} witte schijven gevonden (max 20)` });
  if (nB > MAX_PIECES_PER_COLOR) warnings.push({ type: "count", text: `${nB} zwarte schijven gevonden (max 20)` });

  for (const f of whites) {
    if (f <= 5 && board[f] === PIECE_TYPES.WHITE_PIECE) {
      warnings.push({ type: "promotion", square: f, text: `wit op veld ${f}: dam?` });
    }
  }
  for (const f of blacks) {
    if (f >= 46 && board[f] === PIECE_TYPES.BLACK_PIECE) {
      warnings.push({ type: "promotion", square: f, text: `zwart op veld ${f}: dam?` });
    }
  }

  const difference = Math.abs(nW - nB);
  if (difference > MAX_BALANCE_DIFFERENCE) {
    // Hoeveel velden er minstens aangepast moeten worden om binnen de norm te
    // komen; het vaakst is er een stuk gemist, dus dáár zoeken we: de lege velden
    // waar de herkenner het minst zeker van was.
    const needed = difference - MAX_BALANCE_DIFFERENCE;
    const suspects = [...empties]
      .sort((a, b) => (confidences[a] ?? 1) - (confidences[b] ?? 1) || a - b)
      .slice(0, needed);
    const fewer = nW < nB ? "witte" : "zwarte";
    warnings.push({
      type: "balance",
      squares: suspects,
      text:
        `Wit heeft ${nW} stukken en zwart ${nB}. Bij bijna alle opgaven is dat gelijk, of hooguit 1 verschil — ` +
        `waarschijnlijk is er een ${fewer} schijf gemist of een stuk te veel gezien.` +
        (suspects.length ? ` Kijk vooral naar de gele lege velden (${suspects.join(", ")}).` : ""),
    });
  }

  return warnings;
}

// Alle velden waar een waarschuwing specifiek op wijst, om als onzeker te markeren.
export function warningFields(warnings) {
  const fields = new Set();
  for (const w of warnings ?? []) {
    if (typeof w.square === "number") fields.add(w.square);
    for (const f of w.squares ?? []) fields.add(f);
  }
  return [...fields];
}

const labelOf = (piece) => (isWhite(piece) ? "white" : isBlack(piece) ? "black" : "empty");
const PIECE_OF = { white: PIECE_TYPES.WHITE_PIECE, black: PIECE_TYPES.BLACK_PIECE };
const MIN_PROBABILITY = 1e-6;

// Past de stand aan zodat de materiaalbalans klopt (verschil hooguit 1, hooguit 20
// per kleur), door zo weinig mogelijk en zo goedkoop mogelijk velden om te zetten.
// `probs[veld]` = { empty, white, black }: hoe waarschijnlijk elk antwoord per veld
// is volgens de herkenner(s). De "kosten" van een aanpassing is hoeveel minder
// waarschijnlijk het nieuwe antwoord is dan het huidige (log-verhouding); de
// goedkoopste aanpassing per stuk verschil dat het oplost gaat eerst. Zo verandert
// bijvoorbeeld een leeg veld waar de herkenner ook een wit stuk mogelijk vond
// vóór een veld waar het heel zeker leeg was.
// Geeft { board, changes } terug; `changes` = [{ square, from, to }]. Dammen en
// velden waar een aanpassing een onmogelijke gewone schijf op de damrij zou geven
// blijven ongemoeid.
export function enforceRules(board, probs) {
  const result = [...board];
  const changes = [];
  const changed = new Set();
  const p = (f, label) => Math.max(probs?.[f]?.[label] ?? 0, MIN_PROBABILITY);
  const cost = (f, to) => Math.log(p(f, labelOf(result[f]))) - Math.log(p(f, to));
  const allowed = (f, to) =>
    !changed.has(f) &&
    !(result[f] === PIECE_TYPES.WHITE_KING || result[f] === PIECE_TYPES.BLACK_KING) &&
    !(to === "white" && f <= 5) &&
    !(to === "black" && f >= 46);

  for (let guard = 0; guard < FIELD_COUNT; guard++) {
    let nW = 0;
    let nB = 0;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      if (isWhite(result[f])) nW++;
      else if (isBlack(result[f])) nB++;
    }
    const balanced = Math.abs(nW - nB) <= MAX_BALANCE_DIFFERENCE && nW <= MAX_PIECES_PER_COLOR && nB <= MAX_PIECES_PER_COLOR;
    if (balanced) break;

    const surplus = nW > nB ? "white" : "black";
    const deficient = surplus === "white" ? "black" : "white";
    let best = null;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      const cur = labelOf(result[f]);
      const options = [];
      if (cur === "empty") options.push([deficient, 1]);
      if (cur === surplus) options.push(["empty", 1], [deficient, 2]);
      for (const [to, gain] of options) {
        if (!allowed(f, to)) continue;
        const score = cost(f, to) / gain;
        if (!best || score < best.score) best = { f, to, score };
      }
    }
    if (!best) break;
    changes.push({ square: best.f, from: labelOf(result[best.f]), to: best.to });
    result[best.f] = best.to === "empty" ? EMPTY : PIECE_OF[best.to];
    changed.add(best.f);
  }
  return { board: result, changes };
}
