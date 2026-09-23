import { FIELD_COUNT, PIECE_TYPES } from "../core/board.js?v=20260923a";

// Schrijft één regel in het labels.txt-formaat dat damscan/labels.js verwacht
// (zie daar `parseLabelFile`/`formatLabelLine` — dit is bewust dezelfde
// bereiken-notatie, opnieuw geschreven i.p.v. geïmporteerd omdat dat bestand een
// CommonJS-module buiten deze app is, niet een ES-module van de site zelf).
//
//   diag01 @kraakman  W: 31-35,37,38,40  Z: 12,14,16-20
//
// Dammen tellen mee als hun gewone kleur (zie classifyFromFeatures: de herkenning
// onderscheidt dat toch niet), dus wk/wp -> W, bk/bp -> Z.
function groupRanges(fields) {
  if (fields.length === 0) return "-";
  const sorted = [...fields].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(",");
}

export function boardToLabelLine(photo, board, style) {
  const white = [];
  const black = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    const piece = board[f];
    if (piece === PIECE_TYPES.WHITE_PIECE || piece === PIECE_TYPES.WHITE_KING) white.push(f);
    else if (piece === PIECE_TYPES.BLACK_PIECE || piece === PIECE_TYPES.BLACK_KING) black.push(f);
  }
  // Het label-formaat (damscan/labels.js) kent maar één woord per stijl: een
  // boekstijl als "Damspel Kleingoed" met een spatie maakte de hele regel ongeldig
  // en liet `damscan/train.js` er in zijn geheel op vastlopen. Spaties worden dus "_".
  const tag = style ? ` @${style.trim().replace(/\s+/g, "_")}` : "";
  return `${photo}${tag}  W: ${groupRanges(white)}  Z: ${groupRanges(black)}`;
}
