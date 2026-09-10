import { FIELD_COUNT, PIECE_TYPES, createEmptyBoard, isValidField } from "./board.js";

export class FenParseError extends Error {}

function parseSquareList(text) {
  const squares = [];
  if (!text) return squares;
  for (const raw of text.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const king = /^K/i.test(token);
    const numText = token.replace(/^K/i, "");
    const num = Number.parseInt(numText, 10);
    if (!isValidField(num)) {
      throw new FenParseError(`Ongeldig veldnummer in FEN: "${token}"`);
    }
    squares.push({ field: num, king });
  }
  return squares;
}

export function parseFen(fen) {
  if (typeof fen !== "string") throw new FenParseError("FEN moet een tekst zijn.");
  const trimmed = fen.trim();
  const parts = trimmed.split(":");
  if (parts.length < 1) throw new FenParseError("Lege FEN.");

  const turnToken = parts[0].trim().toUpperCase();
  if (turnToken !== "W" && turnToken !== "B") {
    throw new FenParseError(`FEN moet beginnen met "W:" of "B:" (aan zet), niet "${parts[0]}".`);
  }
  const turn = turnToken === "W" ? "white" : "black";

  const board = createEmptyBoard();
  const colorParts = parts.slice(1);

  for (const part of colorParts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;
    const colorLetter = trimmedPart[0].toUpperCase();
    const rest = trimmedPart.slice(1);
    if (colorLetter !== "W" && colorLetter !== "B") {
      throw new FenParseError(`Onbekende kleurletter in FEN: "${trimmedPart}"`);
    }
    const squares = parseSquareList(rest);
    for (const { field, king } of squares) {
      if (board[field]) {
        throw new FenParseError(`Veld ${field} komt dubbel voor in de FEN.`);
      }
      board[field] =
        colorLetter === "W"
          ? king
            ? PIECE_TYPES.WHITE_KING
            : PIECE_TYPES.WHITE_PIECE
          : king
          ? PIECE_TYPES.BLACK_KING
          : PIECE_TYPES.BLACK_PIECE;
    }
  }

  return { board, turn };
}

function squareToken(field, king) {
  return king ? `K${field}` : `${field}`;
}

export function boardToFen(board, turn) {
  const whites = [];
  const blacks = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    const piece = board[f];
    if (!piece) continue;
    if (piece === PIECE_TYPES.WHITE_PIECE) whites.push(squareToken(f, false));
    else if (piece === PIECE_TYPES.WHITE_KING) whites.push(squareToken(f, true));
    else if (piece === PIECE_TYPES.BLACK_PIECE) blacks.push(squareToken(f, false));
    else if (piece === PIECE_TYPES.BLACK_KING) blacks.push(squareToken(f, true));
  }
  const turnLetter = turn === "white" ? "W" : "B";
  return `${turnLetter}:W${whites.join(",")}:B${blacks.join(",")}`;
}
