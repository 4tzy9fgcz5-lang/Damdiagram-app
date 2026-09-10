import { PIECE_TYPES, createEmptyBoard, isValidField } from "./board.js";

export class QuickTextParseError extends Error {}

const WHITE_WORDS = new Set(["wit", "w", "white"]);
const BLACK_WORDS = new Set(["zwart", "z", "b", "black"]);

export function parseQuickText(text, turn = "white") {
  if (typeof text !== "string") throw new QuickTextParseError("Invoer moet tekst zijn.");
  const tokens = text
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const board = createEmptyBoard();
  let currentColor = null;

  for (const token of tokens) {
    if (WHITE_WORDS.has(token)) {
      currentColor = "white";
      continue;
    }
    if (BLACK_WORDS.has(token)) {
      currentColor = "black";
      continue;
    }
    const match = token.match(/^([dk]?)(\d+)$/i);
    if (!match) {
      throw new QuickTextParseError(`Onbekend woord of veldnummer: "${token}"`);
    }
    if (!currentColor) {
      throw new QuickTextParseError(
        `Veldnummer "${token}" gevonden voordat "wit" of "zwart" is genoemd.`
      );
    }
    const king = match[1].length > 0;
    const field = Number.parseInt(match[2], 10);
    if (!isValidField(field)) {
      throw new QuickTextParseError(`Veldnummer buiten bereik (1-50): "${token}"`);
    }
    if (board[field]) {
      throw new QuickTextParseError(`Veld ${field} wordt twee keer genoemd.`);
    }
    board[field] =
      currentColor === "white"
        ? king
          ? PIECE_TYPES.WHITE_KING
          : PIECE_TYPES.WHITE_PIECE
        : king
        ? PIECE_TYPES.BLACK_KING
        : PIECE_TYPES.BLACK_PIECE;
  }

  return { board, turn };
}
