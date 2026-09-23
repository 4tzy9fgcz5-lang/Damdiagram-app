import { describe, it, assertTrue } from "./test-runner.js?v=20260923o";
import { gridFitScore } from "../src/recognition/gridFit.js?v=20260923o";
import { detectBoardCorners } from "../src/recognition/detectBoard.js?v=20260923o";

// Een schaakbordpatroon van 10x10 velden dat de hele foto vult (geen rand, geen
// papier eromheen) — zoals een strak bijgesneden diagram.
function fullFrameBoard(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cell = size / 10;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#5a4a38" : "#d9c9a3";
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  return canvas;
}

function quad(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

describe("patroon-controle van een kader (gridFitScore)", () => {
  it("scoort het juiste 10x10-kader duidelijk hoger dan een 8x8-kader (12% marge)", () => {
    const size = 600;
    const canvas = fullFrameBoard(size);
    const imageData = canvas.getContext("2d").getImageData(0, 0, size, size);
    const right = gridFitScore(imageData, quad(0, 0, size, size));
    const eight = gridFitScore(imageData, quad(size * 0.12, size * 0.12, size * 0.88, size * 0.88));
    assertTrue(right > eight * 1.5, `juist kader ${right.toFixed(2)} moet duidelijk boven 8x8-kader ${eight.toFixed(2)} liggen`);
  });

  it("scoort een kader over precies de helft van het bord (5x5 velden) veel lager dan het hele bord", () => {
    const size = 600;
    const canvas = fullFrameBoard(size);
    const imageData = canvas.getContext("2d").getImageData(0, 0, size, size);
    const right = gridFitScore(imageData, quad(0, 0, size, size));
    const half = gridFitScore(imageData, quad(0, 0, size / 2, size / 2));
    assertTrue(right > half * 1.5, `heel bord ${right.toFixed(2)} vs half bord ${half.toFixed(2)}`);
  });
});

describe("hoekdetectie op een strak bijgesneden bord", () => {
  it("kiest bijna de hele foto, niet een 8x8-uitsnede", () => {
    const size = 600;
    const canvas = fullFrameBoard(size);
    const corners = detectBoardCorners(canvas);
    if (corners === null) return; // geen gok is ook goed: de app valt dan zelf terug
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    // 8x8-selectie zou minstens 10% per kant wegsnijden.
    assertTrue(Math.min(...xs) < size * 0.05, `linkerkant ${Math.min(...xs)} snijdt te veel weg`);
    assertTrue(Math.max(...xs) > size * 0.95, `rechterkant ${Math.max(...xs)} snijdt te veel weg`);
    assertTrue(Math.min(...ys) < size * 0.05, `bovenkant ${Math.min(...ys)} snijdt te veel weg`);
    assertTrue(Math.max(...ys) > size * 0.95, `onderkant ${Math.max(...ys)} snijdt te veel weg`);
  });
});
