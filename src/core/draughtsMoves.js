import { FIELD_COUNT, PIECE_TYPES, fieldToCoord, coordToField, isKing, cloneBoard } from "./board.js?v=20260917d";

const ALL_DIRS = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];

export function colorOf(piece) {
  if (piece === PIECE_TYPES.WHITE_PIECE || piece === PIECE_TYPES.WHITE_KING) return "white";
  if (piece === PIECE_TYPES.BLACK_PIECE || piece === PIECE_TYPES.BLACK_KING) return "black";
  return null;
}

function forwardDirs(color) {
  // Veld 1 (rij0) is boven, waar zwart start (velden 1-20); wit start onderaan (velden 31-50, rij6-9).
  // Wit speelt dus omhoog (rij neemt af), zwart speelt omlaag (rij neemt toe).
  return color === "white"
    ? [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }]
    : [{ dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
}

function isCrownhead(color, row) {
  return color === "white" ? row === 0 : row === 9;
}

// Zoekt alle maximale slagreeksen vanaf `field`, als lijst van paden.
// Elk pad is een lijst van stappen {land, captured}, in volgorde.
// Een schijf die tijdens het slaan over de damrij komt maar nog verder kan slaan,
// blijft daarbij een schijf (slaat dus verder met schijf-geometrie, niet vliegend
// als dam) — pas als de hele slagreeks daadwerkelijk op de damrij eindigt, wordt
// hij dam. Zie buildCaptureMoves, dat naar het láátste veld van het pad kijkt.
//
// `originField` is het veld waar de slaande schijf ván start (vast voor de hele
// reeks, in tegenstelling tot `field`, de huidige tussenpositie). Dat veld moet
// overal in deze reeks als leeg gelden — de schijf staat er middenin de slag
// niet meer — anders wordt een slagreeks die er (via-, over- of eind-veld) langs
// het eigen vertrekveld terugkeert onterecht afgekapt doordat het statische
// bord daar nog de oorspronkelijke schijf toont.
function captureSequencesFromField(board, field, color, kingPiece, capturedSoFar, originField) {
  const { row, col } = fieldToCoord(field);
  const results = [];
  const isEmpty = (f) => f === originField || board[f] == null;

  for (const { dr, dc } of ALL_DIRS) {
    if (kingPiece) {
      let r = row + dr;
      let c = col + dc;
      let sawEnemyField = null;
      while (r >= 0 && r <= 9 && c >= 0 && c <= 9) {
        const f = coordToField(r, c);
        if (f == null) break;
        const piece = isEmpty(f) ? null : board[f];
        if (sawEnemyField == null) {
          if (piece == null) {
            r += dr;
            c += dc;
            continue;
          }
          if (colorOf(piece) === color || capturedSoFar.has(f)) break;
          sawEnemyField = f;
          r += dr;
          c += dc;
          continue;
        }
        if (piece != null) break;
        const newCaptured = new Set(capturedSoFar);
        newCaptured.add(sawEnemyField);
        const sub = captureSequencesFromField(board, f, color, true, newCaptured, originField);
        if (sub.length === 0) results.push([{ land: f, captured: sawEnemyField }]);
        else for (const s of sub) results.push([{ land: f, captured: sawEnemyField }, ...s]);
        r += dr;
        c += dc;
      }
    } else {
      const r1 = row + dr;
      const c1 = col + dc;
      const r2 = row + 2 * dr;
      const c2 = col + 2 * dc;
      if (r1 < 0 || r1 > 9 || c1 < 0 || c1 > 9 || r2 < 0 || r2 > 9 || c2 < 0 || c2 > 9) continue;
      const overField = coordToField(r1, c1);
      const landField = coordToField(r2, c2);
      if (overField == null || landField == null) continue;
      const overPiece = isEmpty(overField) ? null : board[overField];
      if (overPiece == null || colorOf(overPiece) === color) continue;
      if (capturedSoFar.has(overField)) continue;
      if (!isEmpty(landField)) continue;

      const newCaptured = new Set(capturedSoFar);
      newCaptured.add(overField);
      // Nog als schijf verder zoeken, ook als landField op de damrij ligt — die
      // rij is alleen bijzonder als de slagreeks daar écht eindigt.
      const sub = captureSequencesFromField(board, landField, color, false, newCaptured, originField);
      if (sub.length === 0) results.push([{ land: landField, captured: overField }]);
      else for (const s of sub) results.push([{ land: landField, captured: overField }, ...s]);
    }
  }
  return results;
}

function buildCaptureMoves(board, turn) {
  const moves = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    const piece = board[f];
    if (!piece || colorOf(piece) !== turn) continue;
    const kingPiece = isKing(piece);
    const paths = captureSequencesFromField(board, f, turn, kingPiece, new Set(), f);
    for (const path of paths) {
      const pad = path.map((s) => s.land);
      const geslagen = path.map((s) => s.captured);
      const finalCoord = fieldToCoord(pad[pad.length - 1]);
      const wordtDam = !kingPiece && isCrownhead(turn, finalCoord.row);
      moves.push({ van: f, pad, geslagen, wordtDam });
    }
  }
  return moves;
}

function buildNormalMoves(board, turn) {
  const moves = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    const piece = board[f];
    if (!piece || colorOf(piece) !== turn) continue;
    const kingPiece = isKing(piece);
    const { row, col } = fieldToCoord(f);
    const dirs = kingPiece ? ALL_DIRS : forwardDirs(turn);
    for (const { dr, dc } of dirs) {
      if (kingPiece) {
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r <= 9 && c >= 0 && c <= 9) {
          const land = coordToField(r, c);
          if (land == null || board[land] != null) break;
          moves.push({ van: f, pad: [land], geslagen: [], wordtDam: false });
          r += dr;
          c += dc;
        }
      } else {
        const r1 = row + dr;
        const c1 = col + dc;
        if (r1 < 0 || r1 > 9 || c1 < 0 || c1 > 9) continue;
        const land = coordToField(r1, c1);
        if (land == null || board[land] != null) continue;
        const landCoord = fieldToCoord(land);
        moves.push({ van: f, pad: [land], geslagen: [], wordtDam: isCrownhead(turn, landCoord.row) });
      }
    }
  }
  return moves;
}

// Alle geldige volledige zetten voor `turn` op `board`, inclusief slagplicht en de
// regel dat de langste slagreeks verplicht is (internationale damregels).
export function getLegalMoves(board, turn) {
  const captureMoves = buildCaptureMoves(board, turn);
  if (captureMoves.length > 0) {
    const maxLen = Math.max(...captureMoves.map((m) => m.geslagen.length));
    return captureMoves.filter((m) => m.geslagen.length === maxLen);
  }
  return buildNormalMoves(board, turn);
}

// Eén zet als leesbare damnotatie, bv. "33-28" of "22x33x40" bij een meerslag.
export function moveToNotation(move) {
  if (move.geslagen.length === 0) return `${move.van}-${move.pad[0]}`;
  return `${move.van}x${move.pad.join("x")}`;
}

// Een hele reeks zetten als leesbare damnotatie, bv. "1. 33-28 19-23 2. 38-32 ...".
// `firstTurn` is de kleur die de eerste zet in `zetten` speelt.
export function formatZetten(zetten, firstTurn) {
  if (!zetten || zetten.length === 0) return "";
  const parts = [];
  let i = 0;
  let moveNumber = 1;
  if (firstTurn === "black") {
    parts.push(`${moveNumber}. ... ${moveToNotation(zetten[0])}`);
    i = 1;
    moveNumber++;
  }
  for (; i < zetten.length; i += 2) {
    const first = moveToNotation(zetten[i]);
    const second = zetten[i + 1] ? ` ${moveToNotation(zetten[i + 1])}` : "";
    parts.push(`${moveNumber}. ${first}${second}`);
    moveNumber++;
  }
  return parts.join(" ");
}

// Past een volledige zet (zoals geleverd door getLegalMoves, of eerder opgeslagen) toe op het bord.
export function applyMove(board, move) {
  const next = cloneBoard(board);
  const piece = next[move.van];
  next[move.van] = null;
  for (const f of move.geslagen ?? []) next[f] = null;
  const finalField = move.pad[move.pad.length - 1];
  next[finalField] = move.wordtDam
    ? colorOf(piece) === "white"
      ? PIECE_TYPES.WHITE_KING
      : PIECE_TYPES.BLACK_KING
    : piece;
  return next;
}
