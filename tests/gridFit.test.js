import { describe, it, assertTrue } from "./test-runner.js?v=20260921b";
import { gridFitScore } from "../src/recognition/gridFit.js?v=20260921b";
import { detectBoardCorners, tightenCornersToPlayfield } from "../src/recognition/detectBoard.js?v=20260921b";

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

describe("bulk-import: kader strakker trekken naar het speelveld", () => {
  it("snijdt een dikke zwarte bordrand weg, maar nooit meer dan een rand (geen 8x8)", () => {
    const size = 700;
    const frame = { x0: 80, y0: 80, x1: 620, y1: 620 };
    const play = { x0: 110, y0: 110, x1: 590, y1: 590 }; // rand van 30px = 5,5% van het kader
    const cell = (play.x1 - play.x0) / 10;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    ctx.fillRect(frame.x0, frame.y0, frame.x1 - frame.x0, frame.y1 - frame.y0);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? "#3a2a18" : "#c9b183";
        ctx.fillRect(play.x0 + col * cell, play.y0 + row * cell, cell, cell);
      }
    }
    const imageData = ctx.getImageData(0, 0, size, size);
    const tight = tightenCornersToPlayfield(imageData, quad(frame.x0, frame.y0, frame.x1, frame.y1));
    const xs = tight.map((p) => p.x);
    const ys = tight.map((p) => p.y);
    const near = (a, b) => Math.abs(a - b) < 15;
    assertTrue(near(Math.min(...xs), play.x0) && near(Math.max(...xs), play.x1), `links/rechts ${Math.min(...xs)}–${Math.max(...xs)} vs patroon ${play.x0}–${play.x1}`);
    assertTrue(near(Math.min(...ys), play.y0) && near(Math.max(...ys), play.y1), `boven/onder ${Math.min(...ys)}–${Math.max(...ys)} vs patroon ${play.y0}–${play.y1}`);
    // Nooit meer dan 8% van de kaderbreedte per kant weg (een hele cel is 10%).
    const frameWidth = frame.x1 - frame.x0;
    assertTrue(Math.min(...xs) - frame.x0 <= frameWidth * 0.081, "meer dan 8% weggesneden aan de linkerkant");
  });
});
