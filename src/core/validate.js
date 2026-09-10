import { FIELD_COUNT, PIECE_TYPES, countPieces, isWhite, isBlack } from "./board.js";

const MAX_PIECES_PER_COLOR = 20;

export function validateBoard(board) {
  const warnings = [];

  for (let f = 1; f <= 5; f++) {
    if (board[f] === PIECE_TYPES.WHITE_PIECE) {
      warnings.push(`Witte schijf op veld ${f}: dit veld ligt in de laatste rij voor wit en zou een dam moeten zijn.`);
    }
  }
  for (let f = 46; f <= FIELD_COUNT; f++) {
    if (board[f] === PIECE_TYPES.BLACK_PIECE) {
      warnings.push(`Zwarte schijf op veld ${f}: dit veld ligt in de laatste rij voor zwart en zou een dam moeten zijn.`);
    }
  }

  const whiteCount = countPieces(board, isWhite);
  const blackCount = countPieces(board, isBlack);
  if (whiteCount > MAX_PIECES_PER_COLOR) {
    warnings.push(`Wit heeft ${whiteCount} stukken; meer dan ${MAX_PIECES_PER_COLOR} is ongebruikelijk.`);
  }
  if (blackCount > MAX_PIECES_PER_COLOR) {
    warnings.push(`Zwart heeft ${blackCount} stukken; meer dan ${MAX_PIECES_PER_COLOR} is ongebruikelijk.`);
  }

  return warnings;
}
