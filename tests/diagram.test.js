import { describe, it, assertTrue, assertEqual } from "./test-runner.js?v=20260923l";
import { renderDiagramSVG, MARGIN, SQUARE } from "../src/diagram/render.js?v=20260923l";
import { parseFen } from "../src/core/fen.js?v=20260923l";
import { createEmptyBoard, fieldToCoord } from "../src/core/board.js?v=20260923l";

function countOccurrences(text, sub) {
  return text.split(sub).length - 1;
}

describe("SVG-diagramrenderer", () => {
  it("produceert geldige SVG met de juiste viewBox", () => {
    const svg = renderDiagramSVG(createEmptyBoard());
    assertTrue(svg.startsWith("<svg"));
    assertTrue(svg.includes('viewBox="0 0 300 300"'));
  });
  it("tekent 50 donkere velden voor een leeg bord", () => {
    const svg = renderDiagramSVG(createEmptyBoard());
    assertEqual(countOccurrences(svg, "#C4C4C4"), 50);
  });
  it("tekent een ellips per gewoon stuk", () => {
    const { board } = parseFen("W:W13,15,33:B1,5,30");
    const svg = renderDiagramSVG(board);
    assertEqual(countOccurrences(svg, "<ellipse"), 6);
  });
  it("tekent twee ellipsen per dam (gestapeld)", () => {
    const { board } = parseFen("W:WK13:B");
    const svg = renderDiagramSVG(board);
    assertEqual(countOccurrences(svg, "<ellipse"), 2);
  });
  it("staat een gewone schijf verticaal gecentreerd in het veld (niet te laag)", () => {
    // Regressietest: de vorm van een schijf loopt van (topY - ry) tot
    // (topY + rim + ry) — de afgeronde onderrand steekt nóg een keer ry uit onder
    // de rand. Die extra ry ontbrak eerder in de centrerings-berekening, waardoor
    // de schijf zichtbaar te laag in het veld stond.
    const { board } = parseFen("W:W13:B");
    const svg = renderDiagramSVG(board);
    const match = svg.match(/<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/);
    assertTrue(match !== null, "geen ellips gevonden in de SVG");
    const [, , cyStr, , ryStr] = match;
    const topY = parseFloat(cyStr);
    const ry = parseFloat(ryStr);
    const rim = SQUARE * 0.24; // zelfde formule als in render.js (rim hangt af van SQUARE, niet van rx/ry)

    const { row, col } = fieldToCoord(13);
    const cyCenter = MARGIN + row * SQUARE + SQUARE / 2;

    const top = topY - ry;
    const bottom = topY + rim + ry;
    const visualCenter = (top + bottom) / 2;
    assertTrue(
      Math.abs(visualCenter - cyCenter) < 0.5,
      `schijf niet gecentreerd: visueel midden ${visualCenter.toFixed(2)} vs. veldmidden ${cyCenter.toFixed(2)}`
    );
  });

  it("respecteert de gevraagde uitvoergrootte", () => {
    const svg = renderDiagramSVG(createEmptyBoard(), { size: 1200 });
    assertTrue(svg.includes('width="1200"'));
    assertTrue(svg.includes('height="1200"'));
  });
});
