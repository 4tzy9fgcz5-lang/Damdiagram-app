import { describe, it, assertEqual, assertTrue } from "./test-runner.js";
import { computeHomography, applyHomography, warpToSquareCanvas } from "../src/recognition/homography.js";

function approxEqual(a, b, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

describe("homografie: kernwiskunde", () => {
  it("identiteit: dezelfde 4 hoeken erin en eruit geeft de identieke afbeelding", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const H = computeHomography(square, square);
    const p = applyHomography(H, 37, 62);
    assertTrue(approxEqual(p.x, 37) && approxEqual(p.y, 62));
  });

  it("beeldt de 4 gekozen hoekpunten van een scheve vierhoek exact af op de vierkante hoeken", () => {
    const squareOut = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];
    const skewedIn = [
      { x: 30, y: 10 },
      { x: 250, y: 40 },
      { x: 230, y: 260 },
      { x: 10, y: 240 },
    ];
    const H = computeHomography(squareOut, skewedIn);
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H, squareOut[i].x, squareOut[i].y);
      assertTrue(approxEqual(p.x, skewedIn[i].x, 0.01), `hoek ${i} x`);
      assertTrue(approxEqual(p.y, skewedIn[i].y, 0.01), `hoek ${i} y`);
    }
  });

  it("gooit een duidelijke fout bij hoekpunten die (bijna) op één lijn liggen", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const degenerate = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 0 },
    ];
    let threw = false;
    try {
      computeHomography(square, degenerate);
    } catch {
      threw = true;
    }
    assertTrue(threw);
  });
});

describe("homografie: rechttrekken van een canvas", () => {
  it("trekt een scheve rode driehoek op een canvas recht naar een herkenbaar vierkant", () => {
    const src = document.createElement("canvas");
    src.width = 300;
    src.height = 300;
    const ctx = src.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(100, 100, 100, 100);

    const corners = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const out = warpToSquareCanvas(src, corners, 100);
    assertEqual(out.width, 100);
    assertEqual(out.height, 100);
    const pixel = out.getContext("2d").getImageData(50, 50, 1, 1).data;
    assertTrue(pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60, `middenpixel moet rood zijn, kreeg ${pixel}`);
  });
});
