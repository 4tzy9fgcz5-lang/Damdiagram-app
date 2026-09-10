import { fieldToCoord, FIELD_COUNT, isWhite, isKing } from "../core/board.js";

const VIEW = 300;
const BORDER_BLACK = 3;
const GAP_WHITE = 2;
const GREY_LINE = 1;
const MARGIN = BORDER_BLACK + GAP_WHITE + GREY_LINE;
const SQUARE = (VIEW - 2 * MARGIN) / 10;

export const DEFAULT_COLORS = Object.freeze({
  border: "#000000",
  gap: "#FFFFFF",
  greyLine: "#666666",
  darkSquare: "#C4C4C4",
  lightSquare: "#FFFFFF",
  whiteFill: "#FFFFFF",
  whiteStroke: "#000000",
  blackFill: "#000000",
  blackLine: "#CCCCCC",
});

function squareOrigin(row, col) {
  return { x: MARGIN + col * SQUARE, y: MARGIN + row * SQUARE };
}

function boardBackgroundSVG(colors) {
  let svg = "";
  svg += `<rect x="0" y="0" width="${VIEW}" height="${VIEW}" fill="${colors.border}"/>`;
  svg += `<rect x="${BORDER_BLACK}" y="${BORDER_BLACK}" width="${VIEW - 2 * BORDER_BLACK}" height="${
    VIEW - 2 * BORDER_BLACK
  }" fill="${colors.gap}"/>`;
  const greyOuter = BORDER_BLACK + GAP_WHITE;
  svg += `<rect x="${greyOuter}" y="${greyOuter}" width="${VIEW - 2 * greyOuter}" height="${
    VIEW - 2 * greyOuter
  }" fill="${colors.greyLine}"/>`;
  svg += `<rect x="${MARGIN}" y="${MARGIN}" width="${VIEW - 2 * MARGIN}" height="${
    VIEW - 2 * MARGIN
  }" fill="${colors.lightSquare}"/>`;

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const { row, col } = fieldToCoord(f);
    const { x, y } = squareOrigin(row, col);
    svg += `<rect data-field="${f}" x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${colors.darkSquare}"/>`;
  }
  return svg;
}

function discBodyPath(cx, topY, rx, ry, rim) {
  const x1 = cx - rx;
  const x2 = cx + rx;
  const y1 = topY;
  const y2 = topY + rim;
  return `M ${x1} ${y1} L ${x1} ${y2} A ${rx} ${ry} 0 0 0 ${x2} ${y2} L ${x2} ${y1} Z`;
}

function singleDiscSVG(cx, topY, rx, ry, rim, fill, stroke, strokeWidth) {
  const body = discBodyPath(cx, topY, rx, ry, rim);
  let svg = "";
  svg += `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
  svg += `<ellipse cx="${cx}" cy="${topY}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  return svg;
}

function pieceSVG(field, piece, colors) {
  const { row, col } = fieldToCoord(field);
  const { x, y } = squareOrigin(row, col);
  const cx = x + SQUARE / 2;
  const cyCenter = y + SQUARE / 2;
  const white = isWhite(piece);
  const fill = white ? colors.whiteFill : colors.blackFill;
  const stroke = white ? colors.whiteStroke : colors.blackLine;
  const strokeWidth = white ? 1.1 : 0.8;

  if (isKing(piece)) {
    const rx = SQUARE * 0.34;
    const ry = rx * 0.52;
    const rim = SQUARE * 0.155;
    const totalHeight = ry * 2 + rim * 2;
    const topY = cyCenter - totalHeight / 2 + ry;
    let svg = "";
    svg += singleDiscSVG(cx, topY + rim, rx, ry, rim, fill, stroke, strokeWidth);
    svg += singleDiscSVG(cx, topY, rx, ry, rim, fill, stroke, strokeWidth);
    return svg;
  }

  const rx = SQUARE * 0.36;
  const ry = rx * 0.55;
  const rim = SQUARE * 0.24;
  const totalHeight = ry + rim;
  const topY = cyCenter - totalHeight / 2 + ry;
  return singleDiscSVG(cx, topY, rx, ry, rim, fill, stroke, strokeWidth);
}

export function renderDiagramSVG(board, options = {}) {
  const size = options.size ?? VIEW;
  const colors = { ...DEFAULT_COLORS, ...(options.colors ?? {}) };

  let body = boardBackgroundSVG(colors);
  for (let f = 1; f <= FIELD_COUNT; f++) {
    const piece = board[f];
    if (piece) body += `<g pointer-events="none">${pieceSVG(f, piece, colors)}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}">${body}</svg>`;
}

export function pieceIconSVG(piece, size = 60) {
  const colors = DEFAULT_COLORS;
  const cx = size / 2;
  const cy = size / 2;
  const square = size / 1.3;
  const white = isWhite(piece);
  const fill = white ? colors.whiteFill : colors.blackFill;
  const stroke = white ? colors.whiteStroke : colors.blackLine;
  const strokeWidth = white ? 1.6 : 1.2;

  let body;
  if (isKing(piece)) {
    const rx = square * 0.34;
    const ry = rx * 0.52;
    const rim = square * 0.155;
    const totalHeight = ry * 2 + rim * 2;
    const topY = cy - totalHeight / 2 + ry;
    body = "";
    body += singleDiscSVG(cx, topY + rim, rx, ry, rim, fill, stroke, strokeWidth);
    body += singleDiscSVG(cx, topY, rx, ry, rim, fill, stroke, strokeWidth);
  } else {
    const rx = square * 0.36;
    const ry = rx * 0.55;
    const rim = square * 0.24;
    const totalHeight = ry + rim;
    const topY = cy - totalHeight / 2 + ry;
    body = singleDiscSVG(cx, topY, rx, ry, rim, fill, stroke, strokeWidth);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}

export { VIEW, MARGIN, SQUARE };
