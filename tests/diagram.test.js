import { describe, it, assertTrue, assertEqual } from "./test-runner.js";
import { renderDiagramSVG } from "../src/diagram/render.js";
import { parseFen } from "../src/core/fen.js";
import { createEmptyBoard } from "../src/core/board.js";

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
  it("respecteert de gevraagde uitvoergrootte", () => {
    const svg = renderDiagramSVG(createEmptyBoard(), { size: 1200 });
    assertTrue(svg.includes('width="1200"'));
    assertTrue(svg.includes('height="1200"'));
  });
});
