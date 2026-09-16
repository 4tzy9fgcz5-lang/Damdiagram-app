import { describe, it, assertTrue } from "./test-runner.js?v=20260918e";
import { detectBoardCorners } from "../src/recognition/detectBoard.js?v=20260918e";

function approxEqual(a, b, eps) {
  return Math.abs(a - b) < eps;
}

function canvasWithBorder(size, border) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e8dcc0"; // papierkleur, buiten het bord
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.fillRect(border.x0, border.y0, border.x1 - border.x0, border.y1 - border.y0);
  ctx.fillStyle = "#cccccc";
  const inset = 8;
  ctx.fillRect(border.x0 + inset, border.y0 + inset, border.x1 - border.x0 - 2 * inset, border.y1 - border.y0 - 2 * inset);
  return canvas;
}

describe("automatische hoekdetectie", () => {
  it("vindt een duidelijke zwarte bordrand op een verder effen foto", () => {
    const border = { x0: 60, y0: 90, x1: 540, y1: 570 };
    const canvas = canvasWithBorder(600, border);
    const corners = detectBoardCorners(canvas);
    assertTrue(corners !== null, "verwachtte een gevonden bord, kreeg null");
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    assertTrue(approxEqual(Math.min(...xs), border.x0, 15), `linkerkant: ${Math.min(...xs)} vs ${border.x0}`);
    assertTrue(approxEqual(Math.max(...xs), border.x1, 15), `rechterkant: ${Math.max(...xs)} vs ${border.x1}`);
    assertTrue(approxEqual(Math.min(...ys), border.y0, 15), `bovenkant: ${Math.min(...ys)} vs ${border.y0}`);
    assertTrue(approxEqual(Math.max(...ys), border.y1, 15), `onderkant: ${Math.max(...ys)} vs ${border.y1}`);
  });

  it("geeft null terug (nooit een gok) als er geen overtuigende rand te vinden is", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#dddddd";
    ctx.fillRect(0, 0, 300, 300);
    const corners = detectBoardCorners(canvas);
    assertTrue(corners === null, "verwachtte null bij een effen, randloze foto");
  });

  it("volgt ook een licht scheefstaande (geroteerde) bordrand", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(0, 0, 500, 500);
    ctx.save();
    ctx.translate(250, 250);
    ctx.rotate((8 * Math.PI) / 180);
    ctx.fillStyle = "#000000";
    ctx.fillRect(-180, -160, 360, 320);
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(-165, -145, 330, 290);
    ctx.restore();

    const corners = detectBoardCorners(canvas);
    assertTrue(corners !== null, "verwachtte een gevonden bord ondanks de scheve hoek");
    // grove sanity check: de 4 hoeken moeten een aardig gevulde vierhoek vormen,
    // niet ergens plat/ontaard zijn.
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    assertTrue(Math.max(...xs) - Math.min(...xs) > 250, "bord lijkt te smal gevonden");
    assertTrue(Math.max(...ys) - Math.min(...ys) > 250, "bord lijkt te laag gevonden");
  });
});
