import { getLegalMoves, applyMove, opposite, plyColor, plyMoveNumber } from "./draughtsMoves.js?v=20260923i";

// Een oplossing zoals die in een boek staat (bv. "1. 31 - 27 8 - 12 2. 38 - 33 (2. 39 - 33)
// 29 x 49 ... 9. 45 x 5 x.") omzetten in `zetten` + `zijvarianten`, zoals de klikbare
// oplossing-invoer (solutionInput.js) die ook bewaart.
//
// Het ontleden wordt gestuurd door de damregels: in plaats van de tekst eerst in stukken
// te hakken (en dan te hopen dat "31 - 278 - 12" goed uit elkaar valt) wordt bij elke zet
// gekeken welke van de TOEGESTANE zetten als beginstuk van de resterende tekst past. Dat
// lost plakkende cijfers op, en het vangt leesfouten: een zet die niet mag, wordt gemeld.
//
// Herkent: zetnummers ("12."), "..." , het slotteken "x.", `!`/`?`/`+`, Cyrillisch
// commentaar (wordt genegeerd), varianten tussen haakjes ("(2. ... 6 - 11 3. 30 - 25)") en
// varianten met een letter ("... 43 x 21 A 4. ..." en later "A) 3. ... 23 x 21 ..."), en
// weggelaten gedwongen antwoorden ("2. 39 - 33, 3. 47 - 41,": met een komma).
// Een slag wordt zoals in de boeken als "van x eind" geschreven; de volledige route mag ook.
//
// Meetresultaat op 24 echte oplossingen: zie CLAUDE.md ("Oplossingen via foto").

const CYR = /[Ѐ-ӿ]+/g;
const MAX_STEPS = 20000;
const COLOR_NAME = { white: "wit", black: "zwart" };

// ---------- tekst opschonen ----------

function normalizeText(raw) {
  return String(raw ?? "")
    .replace(/[Xх×Х%]/g, "x")
    .replace(/[–—−‑]/g, "-")
    // "18 : 49" of "18:49" is in sommige boeken een slag
    .replace(/(\d)\s*:\s*(?=\d)/g, "$1x");
}

const MOVE_IN_TEXT = /\d{1,2}\s*[-x]\s*\d{1,2}/;
const ONLY_MOVE = /^\d{1,2}\s*[-x]\s*\d{1,2}(?:\s*x\s*\d{1,2})*$/;

// Sommige boeken schrijven ZONDER zetnummers, met de zwarte zetten tussen haakjes:
// "39-34?! (16-21) 27x16 (18-22) 28x17". Dan zijn de haakjes geen varianten maar gewoon de
// volgende zet. Herkend aan: geen enkel zetnummer ("12.") in de tekst, en elk haakjespaar bevat
// precies één zet. De haakjes worden dan weggehaald.
function unwrapParenMoves(text) {
  const plain = text.replace(CYR, " ");
  if (/(?:^|[\s(])\d{1,2}\s*\.(?!\d)/.test(plain)) return text; // er zijn zetnummers: gewone varianten
  const groups = [...plain.matchAll(/\(([^()]*)\)/g)];
  if (groups.length === 0) return text;
  const single = groups.every((g) => ONLY_MOVE.test(g[1].replace(/[!?+\/;\s]/g, "")));
  return single ? text.replace(/[()]/g, " ") : text;
}

// Letter die een variant aanwijst: Latijns A/B/C (ook klein) of Cyrillisch А/В/С (hoofdletter).
function markerLetter(ch) {
  const map = { A: "A", a: "A", B: "B", b: "B", C: "C", c: "C", "А": "A", "В": "B", "С": "C" };
  return map[ch] ?? null;
}

// Haalt varianten uit de tekst en laat op hun plek een plaatsvervanger `§n§` achter, zodat de
// hoofdlijn leesbaar blijft. Geeft { main, variants: [{ id, text, kind, anchored }] }.
function splitVariants(text) {
  const variants = [];
  let main = "";
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") {
      if (depth > 0) cur += ch;
      else cur = "";
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) {
        // Alleen een variant als er echt een zet in staat; anders is het commentaar.
        if (/\d\s*[-x]\s*\d/.test(cur.replace(CYR, " "))) {
          variants.push({ id: variants.length, text: cur, kind: "haakjes", anchored: true });
          main += `§${variants.length - 1}§`;
        }
      } else cur += ch;
    } else if (depth > 0) cur += ch;
    else main += ch;
  }

  // Letter-varianten: "A) 3. ... 23 x 21 ..." staat achter de hoofdlijn; de letter staat ook
  // in de hoofdlijn, direct achter de zet die de variant vervangt ("... 43 x 21 A 4. ...").
  const markerRe = /(?:^|[\s.,;])([ABCabcАВС])\)/g;
  const markers = [];
  let m;
  while ((m = markerRe.exec(main))) markers.push({ letter: markerLetter(m[1]), index: m.index, len: m[0].length });
  if (markers.length > 0) {
    let head = main.slice(0, markers[0].index);
    markers.forEach((mk, i) => {
      const end = i + 1 < markers.length ? markers[i + 1].index : main.length;
      const body = main.slice(mk.index + mk.len, end);
      const id = variants.length;
      const variant = { id, text: body, kind: "letter", anchored: false };
      const anchorRe = /(?<=[\dx])\s*([ABCabcАВС])(?=\s|\d|$|[.,])/g;
      let a;
      while ((a = anchorRe.exec(head))) {
        if (markerLetter(a[1]) === mk.letter) {
          head = head.slice(0, a.index) + `§${id}§` + head.slice(a.index + a[0].length);
          variant.anchored = true;
          break;
        }
      }
      variants.push(variant);
    });
    main = head;
  }
  return { main, variants };
}

function toMoveString(text) {
  return text
    .replace(CYR, " ")
    .replace(/[!?+\/;:]/g, "")
    .replace(/[A-Za-wyz]/g, "")
    .replace(/\s+/g, "");
}

// ---------- ontleden, gestuurd door de damregels ----------

export function moveNotation(mv) {
  return `${mv.van}${mv.geslagen.length ? "x" : "-"}${mv.pad[mv.pad.length - 1]}`;
}

function moveStrings(mv) {
  if (mv.geslagen.length === 0) return [`${mv.van}-${mv.pad[0]}`];
  const strings = [`${mv.van}x${mv.pad[mv.pad.length - 1]}`];
  if (mv.pad.length > 1) strings.push(`${mv.van}x${mv.pad.join("x")}`);
  return strings;
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

const TOKEN = /^(\d{1,2})[-x](\d{1,2})(?:x\d{1,2})*/;

// Toegestane zetten die het dichtst bij de gelezen tekst `token` liggen (hoogstens `maxDist` letters
// verschil), dichtstbijzijnde eerst.
function closestMoves(legal, token, maxDist) {
  const found = [];
  for (const mv of legal) {
    const dist = Math.min(...moveStrings(mv).map((s) => levenshtein(token, s)));
    if (dist > 0 && dist <= maxDist) found.push({ mv, dist });
  }
  found.sort((a, b) => a.dist - b.dist);
  return found;
}

// Zoekt (diepte eerst) het langste stuk oplossing dat op de tekst past. Geeft de beste stand terug:
// { plies, boards, turns, pos, complete, implicit, repairs, ambiguous, anchors }.
// `plies[i]` is de i-de zet, `boards[i]`/`turns[i]` de stand/beurt VOOR die zet.
function decode(text, board, turn, { allowImplicit = true, maxRepairs = 0 } = {}) {
  let best = { plies: [], boards: [board], turns: [turn], pos: 0, complete: false, implicit: [], repairs: [], ambiguous: [], anchors: {}, ignored: "" };
  let steps = 0;
  let finished = false;

  const better = (a, b) =>
    a.plies.length > b.plies.length ||
    (a.plies.length === b.plies.length && (a.repairs.length < b.repairs.length || (a.repairs.length === b.repairs.length && a.pos > b.pos)));

  function rec(state) {
    if (finished || ++steps > MAX_STEPS) return;
    let { pos, b, t, plies, boards, turns, implicit, repairs, ambiguous, anchors } = state;

    // zetnummers, puntjes, komma's en plaatsvervangers overslaan
    let p = pos;
    let comma = false;
    for (;;) {
      const m = /^(?:\d{1,2}\.{1,4}|[^\d§]+|§(\d+)§)/.exec(text.slice(p));
      if (!m) break;
      if (m[0].includes(",")) comma = true;
      if (m[1] !== undefined) anchors = { ...anchors, [plies.length - 1]: Number(m[1]) };
      p += m[0].length;
    }

    const rest = text.slice(p);
    // niets meer over, of alleen het slotteken "x." van het boek
    // ...of alleen tekst zonder één zet erin (bv. "Jeugdkampioenschap 1974.")
    const atEnd = rest === "" || /^[x.\-]*$/.test(rest) || !MOVE_IN_TEXT.test(rest);
    const snapshot = { plies, boards, turns, pos: atEnd ? text.length : p, complete: atEnd, implicit, repairs, ambiguous, anchors, ignored: atEnd && /\d/.test(rest) ? rest : "" };
    if (atEnd || better(snapshot, best)) best = snapshot;
    if (atEnd) {
      finished = true;
      return;
    }

    const legal = getLegalMoves(b, t);
    // dezelfde zet kan via twee schrijfwijzen passen; ontdubbel op (zet, lengte)
    const seen = new Set();
    const matches = [];
    for (const mv of legal) {
      for (const s of moveStrings(mv)) {
        if (!rest.startsWith(s)) continue;
        const key = `${mv.van}>${mv.pad.join(",")}|${s.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ mv, len: s.length });
      }
    }
    matches.sort((x, y) => y.len - x.len);
    // twee verschillende toegestane slagen met dezelfde begin- en eindveld = dubbelzinnig
    const groups = new Map();
    const groupKey = (x) => `${x.mv.van}>${x.mv.pad[x.mv.pad.length - 1]}|${x.len}`;
    for (const x of matches) groups.set(groupKey(x), (groups.get(groupKey(x)) ?? 0) + 1);

    for (const x of matches) {
      const nb = applyMove(b, x.mv);
      const amb = groups.get(groupKey(x)) > 1 ? [...ambiguous, plies.length] : ambiguous;
      rec({ pos: p + x.len, b: nb, t: opposite(t), plies: [...plies, x.mv], boards: [...boards, nb], turns: [...turns, opposite(t)], implicit, repairs, ambiguous: amb, anchors });
    }

    // Boeken laten soms een gedwongen antwoord weg ("2. 39-33, 3. 47-41,"). Past er geen zet
    // en is er precies één toegestane zet (of staat er een komma), dan wordt dat antwoord aangevuld.
    if (allowImplicit && matches.length === 0 && (legal.length === 1 || (comma && legal.length > 0 && legal.length <= 6))) {
      for (const lm of legal) {
        const nb = applyMove(b, lm);
        rec({ pos: p, b: nb, t: opposite(t), plies: [...plies, lm], boards: [...boards, nb], turns: [...turns, opposite(t)], implicit: [...implicit, plies.length], repairs, ambiguous, anchors });
      }
    }

    // Herstel: staat er een zet die net niet mag (één of twee tekens verschil met een toegestane
    // zet, bv. "6 x 17" in plaats van "16 x 7"), neem de dichtstbijzijnde toegestane zet.
    if (matches.length === 0 && repairs.length < maxRepairs) {
      const tm = TOKEN.exec(rest);
      if (tm) {
        for (const { mv } of closestMoves(legal, tm[0], 2)) {
          const nb = applyMove(b, mv);
          rec({
            pos: p + tm[0].length,
            b: nb,
            t: opposite(t),
            plies: [...plies, mv],
            boards: [...boards, nb],
            turns: [...turns, opposite(t)],
            implicit,
            repairs: [...repairs, { ply: plies.length, gelezen: tm[0], gekozen: moveNotation(mv) }],
            ambiguous,
            anchors,
          });
        }
      }
    }
  }

  rec({ pos: 0, b: board, t: turn, plies: [], boards: [board], turns: [turn], implicit: [], repairs: [], ambiguous: [], anchors: {} });
  return best;
}

// Eerst zonder herstel; lukt dat niet helemaal, dan met steeds meer herstel (maximaal `maxRepairs`).
// Geeft { result, exact }: `result` is de eerste volledige lezing (of, als die er niet is, de beste
// lezing zonder herstel), `exact` altijd de beste lezing zonder herstel (voor de foutmelding).
function decodeWithRepairs(text, board, turn, { allowImplicit = true, maxRepairs = 0 } = {}) {
  const exact = decode(text, board, turn, { allowImplicit, maxRepairs: 0 });
  if (exact.complete) return { result: exact, exact };
  for (let r = 1; r <= maxRepairs; r++) {
    const tried = decode(text, board, turn, { allowImplicit, maxRepairs: r });
    if (tried.complete) return { result: tried, exact };
  }
  return { result: exact, exact };
}

// ---------- meldingen in gewoon Nederlands ----------

function plyLabel(startTurn, ply) {
  return `zet ${plyMoveNumber(startTurn, ply)} van ${COLOR_NAME[plyColor(startTurn, ply)]}`;
}

function describeFailure(exact, text, startTurn, prefix) {
  const ply = exact.plies.length;
  const rest = text.slice(exact.pos);
  const junk = rest.replace(/^[-x.,]+/, "");
  const tm = TOKEN.exec(junk);
  if (!tm) {
    if (/\d/.test(junk)) return { niveau: "let-op", tekst: `${prefix}Na ${ply === 0 ? "het begin" : plyLabel(startTurn, ply - 1)} staat nog tekst die niet als zet te lezen is: „${junk.slice(0, 30)}”.` };
    return null;
  }
  const legal = getLegalMoves(exact.boards[exact.boards.length - 1], exact.turns[exact.turns.length - 1]);
  const voorstellen = closestMoves(legal, tm[0], 2).slice(0, 3).map((c) => moveNotation(c.mv));
  const tip = voorstellen.length > 0 ? ` Bedoeld: ${voorstellen.join(" of ")}?` : "";
  return {
    niveau: "fout",
    ply,
    gelezen: tm[0],
    voorstellen,
    tekst: `${prefix}${plyLabel(startTurn, ply)}: „${tm[0]}” kan niet op deze stand.${tip}`,
  };
}

function newVariantId(index) {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v${Date.now()}-${index}`;
}

function cleanMove(mv) {
  return { van: mv.van, pad: [...mv.pad], geslagen: [...mv.geslagen], wordtDam: mv.wordtDam };
}

// ---------- hoofdfunctie ----------

/**
 * @param {string} tekst   de oplossing zoals afgelezen (zonder het diagramnummer ervoor)
 * @param {{ board: object, turn?: "white"|"black", herstel?: boolean }} opties
 *   `board`: de stand (zoals `parseFen(...).board`), `turn`: wie er aan zet is,
 *   `herstel`: zetten die net niet mogen (1-2 tekens verschil) vervangen door de dichtstbijzijnde
 *   toegestane zet (staat dan in `hersteld` en in de meldingen). Standaard aan.
 * @returns {{
 *   zetten: object[], zijvarianten: { id: string, vanaf: number, zetten: object[] }[],
 *   volledig: boolean, betrouwbaar: boolean, aangevuld: number[], hersteld: { ply: number, gelezen: string, gekozen: string }[],
 *   fout: null | { ply: number, gelezen: string, voorstellen: string[] },
 *   meldingen: { niveau: "fout"|"let-op"|"info", tekst: string }[]
 * }}
 */
export function parseOplossing(tekst, { board, turn = "white", herstel = true } = {}) {
  const meldingen = [];
  const empty = { zetten: [], zijvarianten: [], volledig: false, betrouwbaar: false, aangevuld: [], hersteld: [], fout: null, meldingen };
  const cleaned = unwrapParenMoves(normalizeText(tekst));
  const { main, variants } = splitVariants(cleaned);
  const mainStr = toMoveString(main);
  if (!/\d/.test(mainStr)) {
    meldingen.push({ niveau: "fout", tekst: "Er is geen oplossing gevonden in de tekst." });
    return empty;
  }

  const maxRepairs = herstel ? 2 : 0;
  const { result, exact } = decodeWithRepairs(mainStr, board, turn, { allowImplicit: true, maxRepairs });

  // Begint de oplossing met een zet van de andere kleur? Dan staat de beurt op de stand waarschijnlijk verkeerd.
  if (result.plies.length === 0) {
    const other = decodeWithRepairs(mainStr, board, opposite(turn), { allowImplicit: true, maxRepairs: 0 });
    if (other.result.plies.length > 0) {
      meldingen.push({
        niveau: "fout",
        tekst: `De oplossing begint met een zet van ${COLOR_NAME[opposite(turn)]}, maar op deze stand is ${COLOR_NAME[turn]} aan zet. Klopt “wie is aan zet”?`,
      });
      return { ...empty, fout: { ply: 0, gelezen: "", voorstellen: [], andereBeurt: true } };
    }
  }

  let fout = null;
  if (!result.complete) {
    const failure = describeFailure(exact, mainStr, turn, "");
    if (failure) {
      meldingen.push({ niveau: failure.niveau, tekst: failure.tekst });
      if (failure.niveau === "fout") fout = { ply: failure.ply, gelezen: failure.gelezen, voorstellen: failure.voorstellen };
    }
  }
  if (result.complete && result.ignored) {
    meldingen.push({ niveau: "info", tekst: `Tekst achter de laatste zet is genegeerd: „${result.ignored.slice(0, 40)}”.` });
  }
  for (const r of result.repairs) {
    meldingen.push({ niveau: "let-op", tekst: `${plyLabel(turn, r.ply)}: „${r.gelezen}” kan niet; gelezen als ${r.gekozen} (dichtstbijzijnde toegestane zet). Controleer dit.` });
  }
  for (const i of result.implicit) {
    meldingen.push({ niveau: "info", tekst: `${plyLabel(turn, i)}: het boek laat dit (gedwongen) antwoord weg; aangevuld met ${moveNotation(result.plies[i])}.` });
  }
  for (const i of result.ambiguous) {
    meldingen.push({ niveau: "let-op", tekst: `${plyLabel(turn, i)}: er zijn twee slagen met hetzelfde begin- en eindveld; de eerste is gekozen. Controleer dit.` });
  }

  const zijvarianten = [];
  let variantsOk = true;
  for (const v of variants) {
    const anchorPly = Object.entries(result.anchors).find(([, id]) => id === v.id)?.[0];
    const label = `Variant ${v.kind === "letter" ? "" : "tussen haakjes "}`;
    if (anchorPly === undefined || Number(anchorPly) < 0) {
      variantsOk = false;
      if (result.complete) meldingen.push({ niveau: "let-op", tekst: `${label}(bij „${toMoveString(v.text).slice(0, 20)}…”) kon niet aan een zet in de hoofdlijn gekoppeld worden en is overgeslagen.` });
      continue;
    }
    const at = Number(anchorPly);
    const vText = toMoveString(v.text);
    const { result: vr, exact: vx } = decodeWithRepairs(vText, result.boards[at], result.turns[at], { allowImplicit: true, maxRepairs: herstel ? 1 : 0 });
    const prefix = `Variant bij ${plyLabel(turn, at)}: `;
    if (vr.plies.length > 0) zijvarianten.push({ id: newVariantId(zijvarianten.length), vanaf: at, zetten: vr.plies.map(cleanMove) });
    if (!vr.complete) {
      variantsOk = false;
      const failure = describeFailure(vx, vText, result.turns[at], prefix);
      meldingen.push(failure ? { niveau: failure.niveau, tekst: failure.tekst } : { niveau: "let-op", tekst: `${prefix}niet helemaal te lezen.` });
    }
    for (const r of vr.repairs) meldingen.push({ niveau: "let-op", tekst: `${prefix}„${r.gelezen}” gelezen als ${r.gekozen}. Controleer dit.` });
  }

  return {
    zetten: result.plies.map(cleanMove),
    zijvarianten,
    volledig: result.complete && variantsOk,
    // volledig gelezen ÉN zonder gok: geen herstelde zetten en geen dubbelzinnige slagen
    betrouwbaar: result.complete && variantsOk && result.repairs.length === 0 && result.ambiguous.length === 0,
    aangevuld: result.implicit,
    hersteld: result.repairs,
    fout,
    meldingen,
  };
}

/**
 * Knipt een lezing van een hele oplossingenpagina in stukken per diagramnummer.
 * Zoekt elk gevraagd nummer op in oplopende volgorde ("570. 1. 21 - 17 ...": nummer, punt, dan
 * "1."). Geeft { [nummer]: tekst } terug; nummers die niet gevonden zijn ontbreken.
 */
export function splitOplossingenPerNummer(tekst, nummers) {
  const found = [];
  let from = 0;
  for (const n of nummers) {
    const re = new RegExp(`(?<![\\d])${n}\\s*[.,]\\s*(?:[^\\n]{0,40}?)?1\\s*[.,]\\s*\\d`, "g");
    re.lastIndex = from;
    const m = re.exec(tekst);
    if (m) {
      found.push({ n, start: m.index, bodyStart: m.index + String(n).length });
      from = m.index + 1;
    } else {
      found.push({ n, start: -1 });
    }
  }
  const chunks = {};
  found.forEach((f, i) => {
    if (f.start < 0) return;
    const next = found.slice(i + 1).find((x) => x.start >= 0);
    chunks[f.n] = tekst.slice(f.bodyStart, next ? next.start : tekst.length).replace(/^[\s.,]+/, "");
  });
  return chunks;
}

/**
 * Verdeelt een geplakte tekst met meerdere oplossingen (één per regel, zoals de opdracht voor
 * Claude die vraagt: "570. 1. 21 - 17 22 x 11 ...") in stukken per diagramnummer.
 * Een regel begint een nieuwe oplossing als hij start met een nummer en een punt, en daarna:
 *   - vlak erna "1." (het eerste zetnummer), of
 *   - een zet staat ("286. 39-34?! (16-21) ...", boeken zonder zetnummers), of
 *   - alleen een naam ("287. B. Mirotin.", de zetten volgen op de volgende regel) én het nummer
 *     is een verwacht diagramnummer (`verwacht`).
 * Uitzondering: een regel die met het VOLGENDE zetnummer van de oplossing ervoor begint ("12." na
 * "... 11. 25 x 3") is een afgebroken regel en hoort bij die oplossing.
 * Andere regels horen bij de vorige oplossing. Volgorde van de nummers maakt niet uit.
 * Opmaaktekens van een chat (```, **, opsommingstekens) worden genegeerd.
 * @param {string} tekst
 * @param {{ verwacht?: (string|number)[] }} [opties] `verwacht`: de nummers van de diagrammen
 * @returns {{ perNummer: Record<string, string>, volgorde: string[], dubbel: string[] }}
 */
export function splitOplossingenTekst(tekst, { verwacht } = {}) {
  const expected = verwacht ? new Set(verwacht.map(String)) : null;
  const cleaned = String(tekst ?? "").replace(/```[a-zA-Z]*/g, "").replace(/[*`]/g, "");
  const START = /^\s*(?:[-•]\s*)?(?:nr\.?\s*)?(\d{1,4})\s*[.):]\s*(.*)$/i;
  const FIRST_MOVE = /^.{0,40}?(?<![\d])1\s*\.\s*(?:\.\.\s*)?\d/;
  const HAS_MOVE = /\d{1,2}\s*[-—–x:×]\s*\d{1,2}/;
  const lastMoveNumber = (text) => {
    let last = 0;
    for (const mm of text.matchAll(/(?:^|\s)(\d{1,2})\.(?!\d)/g)) last = Number(mm[1]);
    return last;
  };
  const perNummer = {};
  const volgorde = [];
  const dubbel = [];
  let current = null;
  for (const line of cleaned.split(/\r?\n/)) {
    const m = START.exec(line);
    const rest = m ? m[2] : "";
    let isStart = false;
    if (m) {
      const last = current ? lastMoveNumber(perNummer[current]) : 0;
      if (FIRST_MOVE.test(rest)) isStart = true;
      else if (last > 0 && Number(m[1]) === last + 1) isStart = false;
      else if (HAS_MOVE.test(rest)) isStart = true;
      else if (expected && expected.has(m[1]) && !/\d/.test(rest) && rest.trim().length > 0) isStart = true;
    }
    if (isStart) {
      current = m[1];
      if (perNummer[current] !== undefined) {
        if (!dubbel.includes(current)) dubbel.push(current);
      } else volgorde.push(current);
      perNummer[current] = rest.trim();
    } else if (current && line.trim()) {
      perNummer[current] += " " + line.trim();
    }
  }
  return { perNummer, volgorde, dubbel };
}

/**
 * Haalt de auteur uit het stukje tekst vóór de eerste zet van een oplossing ("287. B. Mirotin. 40-34?! ..."
 * -> "B. Mirotin"). Geeft { auteur, zeker, ruw }:
 *   - `auteur`: de naam (leeg als er niets vóór de zetten staat);
 *   - `zeker`: true bij een duidelijke naam (initialen + achternaam); false als het twijfelachtig is
 *     (bv. twee namen met een streepje ertussen — dat zijn meestal de spelers van een partij, geen
 *     componist — of een hele zin), dan moet Jan het even controleren;
 *   - `ruw`: de tekst zoals hij vóór de zetten stond.
 */
export function extractAuthor(tekst) {
  const t = String(tekst ?? "");
  const firstDigit = t.search(/\d/);
  const prefix = (firstDigit < 0 ? t : t.slice(0, firstDigit)).replace(/[()\s]+$/g, "").replace(/^[\s(]+/g, "").trim();
  if (!prefix || !/\p{L}/u.test(prefix)) return { auteur: "", zeker: false, ruw: "" };

  const name = prefix.replace(/[.,;:\s]+$/g, "").trim();
  const PARTICLE = "(?:van|de|der|den|von|la|le|ten|ter|te|op|du|di|da)";
  const SURNAME = `\\p{Lu}[\\p{L}'’\\-]+`;
  const INITIALS_SURNAME = new RegExp(`^(?:\\p{Lu}\\.\\s*){1,3}(?:${PARTICLE}\\s+)*${SURNAME}(?:\\s+${PARTICLE}\\s+${SURNAME})*$`, "u");
  const SINGLE_NAME = new RegExp(`^${SURNAME}$`, "u");

  if (INITIALS_SURNAME.test(name)) return { auteur: name, zeker: true, ruw: prefix };
  // één achternaam zonder initialen kan een auteur zijn, maar ook een woord als "Studie": laten controleren
  if (SINGLE_NAME.test(name)) return { auteur: name, zeker: false, ruw: prefix };
  return { auteur: "", zeker: false, ruw: prefix };
}
