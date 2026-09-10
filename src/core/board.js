export const FIELD_COUNT = 50;
export const BOARD_SIZE = 10;

export const EMPTY = null;

export function isValidField(n) {
  return Number.isInteger(n) && n >= 1 && n <= FIELD_COUNT;
}

// Rij0 = bovenste rij. Veld linksboven (rij0,kolom0) is licht.
// Donkere velden liggen op oneven kolommen in even rijen en op even kolommen in oneven rijen.
export function fieldToCoord(field) {
  if (!isValidField(field)) throw new RangeError(`Ongeldig veld: ${field}`);
  const index = field - 1;
  const row = Math.floor(index / 5);
  const posInRow = index % 5;
  const col = row % 2 === 0 ? posInRow * 2 + 1 : posInRow * 2;
  return { row, col };
}

export function coordToField(row, col) {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  const isDark = (row + col) % 2 === 1;
  if (!isDark) return null;
  const posInRow = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  return row * 5 + posInRow + 1;
}

// Spiegelt een veldnummer links-rechts: binnen elke rij van 5 velden wordt de volgorde omgedraaid.
export function mirrorField(field) {
  if (!isValidField(field)) throw new RangeError(`Ongeldig veld: ${field}`);
  const rowBase = 10 * Math.floor((field - 1) / 5);
  return rowBase + 6 - field;
}

export const PIECE_TYPES = Object.freeze({
  WHITE_PIECE: "wp",
  BLACK_PIECE: "bp",
  WHITE_KING: "wk",
  BLACK_KING: "bk",
});

export function isWhite(piece) {
  return piece === PIECE_TYPES.WHITE_PIECE || piece === PIECE_TYPES.WHITE_KING;
}

export function isBlack(piece) {
  return piece === PIECE_TYPES.BLACK_PIECE || piece === PIECE_TYPES.BLACK_KING;
}

export function isKing(piece) {
  return piece === PIECE_TYPES.WHITE_KING || piece === PIECE_TYPES.BLACK_KING;
}

export function createEmptyBoard() {
  return new Array(FIELD_COUNT + 1).fill(EMPTY);
}

export function createStartBoard() {
  const board = createEmptyBoard();
  for (let f = 1; f <= 20; f++) board[f] = PIECE_TYPES.BLACK_PIECE;
  for (let f = 31; f <= 50; f++) board[f] = PIECE_TYPES.WHITE_PIECE;
  return board;
}

export function cloneBoard(board) {
  return board.slice();
}

export function mirrorBoard(board) {
  const mirrored = createEmptyBoard();
  for (let f = 1; f <= FIELD_COUNT; f++) {
    mirrored[mirrorField(f)] = board[f];
  }
  return mirrored;
}

export function boardsEqual(a, b) {
  for (let f = 1; f <= FIELD_COUNT; f++) {
    if (a[f] !== b[f]) return false;
  }
  return true;
}

export function countPieces(board, colorPredicate) {
  let count = 0;
  for (let f = 1; f <= FIELD_COUNT; f++) {
    if (board[f] && colorPredicate(board[f])) count++;
  }
  return count;
}
