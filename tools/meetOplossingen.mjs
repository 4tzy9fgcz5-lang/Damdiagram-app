// Meetprogramma voor het inlezen van oplossingen uit een foto (buiten de app, in Node).
// Neemt de herkende stellingen (boards.json: [{ nummer, fen }]) en een tekst met de
// afgelezen oplossingen (een "lezing": Tesseract-uitvoer, of een handmatige/Claude-lezing)
// en speelt elke oplossing zet voor zet na op de stelling. Zo zie je zonder eigen
// invoer hoeveel er goed gelezen is: een zet die niet mag = leesfout (of foute stelling).
//
// Ontleden werkt "gestuurd door de damregels": in plaats van eerst de tekst in zetten te
// hakken (en dan te hopen dat "31 - 278 - 12" goed uit elkaar valt), wordt bij elke zet
// gekeken welke van de TOEGESTANE zetten als beginstuk van de resterende tekst past.
// Varianten tussen haakjes en met "A)" worden apart nagespeeld vanaf de zet die ze vervangen.
//
// Gebruik (vanuit de project-root):
//   node tools/meetOplossingen.mjs boards.json lezing.txt [lezing2.txt ...]
import fs from "node:fs";
import { parseFen } from "../src/core/fen.js";
import { getLegalMoves, applyMove, opposite } from "../src/core/draughtsMoves.js";

// ---------- tekst opschonen ----------
const CYR = /[Ѐ-ӿ]+/g;

function cleanText(raw) {
  let t = raw;
  t = t.replace(/[Xх×Х%]/g, "x").replace(/[–—−]/g, "-");
  return t;
}

// Haal varianten uit de tekst en vervang ze door een plaatsvervanger, zodat de hoofdlijn
// leesbaar blijft. Geeft { main, variants: [{ id, text }] }.
function splitVariants(text) {
  const variants = [];
  let main = "";
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") {
      if (depth === 0) cur = "";
      else cur += ch;
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) {
        // Alleen een variant als er echt een zet in staat; anders is het commentaar.
        if (/\d\s*[-x]\s*\d/.test(cur.replace(CYR, " "))) {
          variants.push({ id: variants.length, text: cur, kind: "haakjes" });
          main += `§${variants.length - 1}§`;
        }
      } else cur += ch;
    } else if (depth > 0) cur += ch;
    else main += ch;
  }
  // Letter-varianten: "... 43 x 21 A 4. 41 - 37 ..." (anker) en later "A) 3. ... 23 x 21 ...".
  const at = main.search(/(?:^|[\s.])[AaАа]\)\s/);
  if (at >= 0) {
    const tail = main.slice(at).replace(/^[\s.]*[AaАа]\)/, "");
    main = main.slice(0, at);
    // een tweede letter-variant (B) is in deze foto's niet gezien; alles ná A) = één variant
    const anchorIdx = variants.length;
    variants.push({ id: anchorIdx, text: tail, kind: "letter" });
    main = main.replace(/(?<=[\dx])\s*[AaАа](?=\s*\d|\s*$)/, `§${anchorIdx}§`);
  }
  return { main, variants };
}

function toMoveString(text) {
  return text
    .replace(CYR, " ")
    .replace(/[!?+\/;:]/g, "")
    .replace(/\s+/g, "");
}

// ---------- ontleden, gestuurd door de damregels ----------
function moveStrings(move) {
  const strings = [];
  if (move.geslagen.length === 0) strings.push(`${move.van}-${move.pad[0]}`);
  else {
    strings.push(`${move.van}x${move.pad[move.pad.length - 1]}`);
    if (move.pad.length > 1) strings.push(`${move.van}x${move.pad.join("x")}`);
  }
  return strings;
}

// DFS: het langste stuk oplossing dat op de tekst past. Geeft { plies, states, pos, implicit }.
function decode(text, board, turn, opts = {}) {
  let best = { plies: [], boards: [board], turns: [turn], pos: 0, implicit: 0, ambiguous: 0, anchors: {} };
  let steps = 0;
  function rec(pos, b, t, plies, boards, turns, implicit, ambiguous, anchors) {
    if (++steps > 20000) return;
    // sla zetnummers, puntjes, plaatsvervangers en losse "x." over
    let p = pos;
    let comma = false;
    for (;;) {
      const m = /^(?:\d{1,2}\.{1,4}|\.{1,4}|,|§(\d+)§)/.exec(text.slice(p));
      if (m && m[0] === ",") comma = true;
      if (!m) break;
      if (m[1] !== undefined) anchors = { ...anchors, [plies.length - 1]: Number(m[1]) };
      p += m[0].length;
    }
    if (plies.length > best.plies.length || (plies.length === best.plies.length && p > best.pos)) {
      best = { plies, boards, turns, pos: p, implicit, ambiguous, anchors };
    }
    if (p >= text.length || /^[x.\-]*$/.test(text.slice(p))) {
      // niets meer over, of alleen het slotteken "x." van het boek
      if (p < text.length && plies.length === best.plies.length) best = { ...best, pos: text.length };
      return;
    }
    const legal = getLegalMoves(b, t);
    const rest = text.slice(p);
    const matches = [];
    for (const mv of legal) {
      for (const s of moveStrings(mv)) {
        if (rest.startsWith(s)) matches.push({ mv, len: s.length });
      }
    }
    // dezelfde zet kan via twee schrijfwijzen passen; ontdubbel op (van, eind, lengte)
    const seen = new Set();
    const uniq = matches.filter((m) => {
      const key = `${m.mv.van}>${m.mv.pad.join(",")}|${m.len}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // langere schrijfwijze eerst
    uniq.sort((a, b2) => b2.len - a.len);
    // twee verschillende toegestane zetten met dezelfde begin- en eindstand = dubbelzinnig
    const groups = new Map();
    for (const m of uniq) {
      const k = `${m.mv.van}>${m.mv.pad[m.mv.pad.length - 1]}|${m.len}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    for (const m of uniq) {
      const k = `${m.mv.van}>${m.mv.pad[m.mv.pad.length - 1]}|${m.len}`;
      const amb = groups.get(k) > 1 ? 1 : 0;
      const nb = applyMove(b, m.mv);
      rec(p + m.len, nb, opposite(t), [...plies, m.mv], [...boards, nb], [...turns, opposite(t)], implicit, ambiguous + amb, anchors);
    }
    // Boeken laten soms een gedwongen antwoord weg ("2. 39-33, 3. 47-41,"): is er precies één
    // toegestane zet voor deze kant en past daarna een zet van de andere kant, neem die aan.
    // Staat er een komma (\"43-39, 9. 49x7\"), dan is het weggelaten antwoord meestal gedwongen; kies
    // zonder komma alleen als er precies één toegestane zet is. Bij meer keuzes: elke proberen.
    if (opts.allowImplicit && uniq.length === 0 && (legal.length === 1 || (comma && legal.length <= 6))) {
      for (const lm of legal) {
        const nb = applyMove(b, lm);
        rec(p, nb, opposite(t), [...plies, { ...lm, impliciet: true }], [...boards, nb], [...turns, opposite(t)], implicit + 1, ambiguous, anchors);
      }
    }
  }
  rec(0, board, turn, [], [board], [turn], 0, 0, {});
  return best;
}

function decodeBothColors(text, board, opts) {
  const w = decode(text, board, "white", opts);
  const b = decode(text, board, "black", opts);
  return { ...(b.plies.length > w.plies.length ? b : w), startTurn: b.plies.length > w.plies.length ? "black" : "white" };
}

// ---------- een oplossing als geheel ----------
function analyse(rawText, board, opts) {
  const cleaned = cleanText(rawText);
  const { main, variants } = splitVariants(cleaned);
  const mainStr = toMoveString(main);
  const res = decodeBothColors(mainStr, board, opts);
  const residue = mainStr.slice(res.pos);
  const residueDigits = (residue.match(/\d/g) ?? []).length;
  const out = {
    plies: res.plies.length,
    startTurn: res.startTurn,
    residueDigits,
    residue: residue.slice(0, 24),
    implicit: res.implicit,
    ambiguous: res.ambiguous,
    complete: residueDigits === 0 && res.plies.length > 0,
    variants: [],
    moves: res.plies.map((m) => `${m.van}${m.geslagen.length ? "x" : "-"}${m.pad[m.pad.length - 1]}`).join(" "),
  };
  // varianten: beginnen bij de stand vóór de hoofdzet die ze vervangen
  for (const v of variants) {
    let anchorPly = null;
    for (const [ply, id] of Object.entries(res.anchors)) if (id === v.id) anchorPly = Number(ply);
    if (anchorPly === null || anchorPly < 0) {
      out.variants.push({ kind: v.kind, ok: false, why: "anker niet gevonden" });
      continue;
    }
    const vb = res.boards[anchorPly];
    const vt = res.turns[anchorPly];
    const vs = toMoveString(cleanText(v.text));
    const d = decode(vs, vb, vt, opts);
    const resid = vs.slice(d.pos);
    const digits = (resid.match(/\d/g) ?? []).length;
    out.variants.push({ kind: v.kind, plies: d.plies.length, residueDigits: digits, ok: d.plies.length > 0 && digits === 0, residue: resid.slice(0, 20) });
  }
  return out;
}

// ---------- een lezing in stukken per diagramnummer ----------
function chunkByNumber(text, numbers) {
  const found = [];
  let from = 0;
  for (const n of numbers) {
    const re = new RegExp(`(?<![\\d])${n}\\s*[.,]\\s*(?:[^\\n]{0,40}?)?1\\s*[.,]\\s*\\d`, "g");
    re.lastIndex = from;
    const m = re.exec(text);
    if (m) {
      found.push({ n, start: m.index, bodyStart: m.index + String(n).length });
      from = m.index + 1;
    } else found.push({ n, start: -1 });
  }
  const chunks = {};
  for (let i = 0; i < found.length; i++) {
    const f = found[i];
    if (f.start < 0) continue;
    const next = found.slice(i + 1).find((x) => x.start >= 0);
    chunks[f.n] = text.slice(f.bodyStart, next ? next.start : text.length).replace(/^[\s.,]+/, "");
  }
  return chunks;
}

// ---------- hoofdprogramma ----------
const [boardsFile, ...readings] = process.argv.slice(2);
const boards = JSON.parse(fs.readFileSync(boardsFile, "utf8"));
const numbers = boards.map((b) => b.nummer);
const summary = {};
const allMoves = {};
for (const file of readings) {
  const text = fs.readFileSync(file, "utf8");
  const chunks = chunkByNumber(text, numbers);
  console.log(`\n===== ${file} =====`);
  const stat = { gevonden: 0, volledig: 0, deels: 0, mis: 0, ontbreekt: 0, variantenOk: 0, variantenTot: 0, plies: 0 };
  for (const b of boards) {
    const chunk = chunks[b.nummer];
    if (chunk === undefined) {
      console.log(`${b.nummer}  ontbreekt in de tekst`);
      stat.ontbreekt++;
      continue;
    }
    stat.gevonden++;
    const { board } = parseFen(b.fen);
    const r = analyse(chunk, board, { allowImplicit: true });
    const rNoImp = analyse(chunk, board, { allowImplicit: false });
    stat.plies += r.plies;
    (allMoves[file] ??= {})[b.nummer] = r.moves;
    if (process.env.DEBUG?.split(",").includes(String(b.nummer))) {
      const cleaned = cleanText(chunk);
      const { main } = splitVariants(cleaned);
      const ms = toMoveString(main);
      const d = decodeBothColors(ms, board, { allowImplicit: process.env.IMPL !== "0" });
      const bd = d.boards[d.boards.length - 1];
      const t = d.turns[d.turns.length - 1];
      const W = [], B = [];
      for (let f = 1; f <= 50; f++) { const v = bd[f]; if (!v) continue; (v[0] === "w" ? W : B).push(f + (v[1] === "k" ? "K" : "")); }
      console.log(`   DEBUG ${b.nummer}: na ${d.plies.length} zetten, ${t} aan zet; wit ${W.join(",")} zwart ${B.join(",")}; tekst nu: "${ms.slice(d.pos, d.pos + 30)}"`);
      console.log(`   toegestaan: ${getLegalMoves(bd, t).map((m) => m.van + (m.geslagen.length ? "x" : "-") + m.pad.join("x")).join(" ")}`);
    }
    const flag = r.complete ? "VOLLEDIG" : r.plies >= 2 ? "deels   " : "mis     ";
    if (r.complete) stat.volledig++;
    else if (r.plies >= 2) stat.deels++;
    else stat.mis++;
    for (const v of r.variants) {
      stat.variantenTot++;
      if (v.ok) stat.variantenOk++;
    }
    const vtxt = r.variants.map((v) => (v.ok ? `var ok(${v.plies})` : `var FOUT(${v.plies ?? 0}, rest "${v.residue ?? v.why}")`)).join("; ");
    console.log(
      `${b.nummer} ${flag} zetten ${String(r.plies).padStart(2)} beurt ${r.startTurn[0]}` +
        (r.residueDigits ? `  rest[${r.residueDigits} cijfers]: "${r.residue}"` : "") +
        (r.implicit ? `  (${r.implicit} weggelaten antwoord aangevuld)` : "") +
        (r.ambiguous ? `  (${r.ambiguous}x dubbelzinnige slag)` : "") +
        (rNoImp.plies !== r.plies ? `  [zonder aanvullen: ${rNoImp.plies}]` : "") +
        (vtxt ? `  ${vtxt}` : "")
    );
  }
  summary[file] = stat;
}
console.log("\n===== samenvatting =====");
for (const [file, s] of Object.entries(summary)) {
  console.log(
    `${file}\n  oplossing gevonden in tekst: ${s.gevonden}/${boards.length}, volledig nagespeeld: ${s.volledig}, deels: ${s.deels}, mis: ${s.mis}, ontbreekt: ${s.ontbreekt}; ` +
      `varianten ok: ${s.variantenOk}/${s.variantenTot}; totaal ${s.plies} zetten nagespeeld`
  );
}
// vergelijking tussen lezingen: zelfde zetten?
if (readings.length >= 2) {
  const [ref, ...others] = readings;
  for (const o of others) {
    let same = 0, both = 0;
    for (const b of boards) {
      const a = allMoves[ref]?.[b.nummer], c = allMoves[o]?.[b.nummer];
      if (a !== undefined && c !== undefined) {
        both++;
        if (a === c) same++;
      }
    }
    console.log(`zelfde zettenreeks als ${ref}: ${same}/${both} (${o})`);
  }
}
