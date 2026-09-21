import { describe, it, assertTrue } from "./test-runner.js?v=20260921ax";
import { detectBoardCorners } from "../src/recognition/detectBoard.js?v=20260921ax";

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

describe("automatische hoekdetectie: rand wegsnijden tot het patroon", () => {
  it("snijdt een dikke zwarte rand om het schaakbordpatroon weg", () => {
    const size = 700;
    const frame = { x0: 100, y0: 100, x1: 600, y1: 600 };
    const playfield = { x0: 130, y0: 130, x1: 570, y1: 570 }; // rand van 30px
    const cell = (playfield.x1 - playfield.x0) / 10;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8dcc0"; // papierkleur
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000"; // dikke rand
    ctx.fillRect(frame.x0, frame.y0, frame.x1 - frame.x0, frame.y1 - frame.y0);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        ctx.fillStyle = (row + col) % 2 === 1 ? "#3a2a18" : "#c9b183";
        ctx.fillRect(playfield.x0 + col * cell, playfield.y0 + row * cell, cell, cell);
      }
    }

    const corners = detectBoardCorners(canvas);
    assertTrue(corners !== null, "verwachtte een gevonden bord");
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);

    // De rand (100-600) moet zijn weggesneden tot dicht bij het echte patroon
    // (130-570) — niet exact, maar wél duidelijk dichter bij het patroon dan
    // bij de buitenkant van de rand.
    assertTrue(approxEqual(Math.min(...xs), playfield.x0, 20), `linkerkant: ${Math.min(...xs)} vs patroon ${playfield.x0} (rand lag op ${frame.x0})`);
    assertTrue(approxEqual(Math.max(...xs), playfield.x1, 20), `rechterkant: ${Math.max(...xs)} vs patroon ${playfield.x1} (rand lag op ${frame.x1})`);
    assertTrue(approxEqual(Math.min(...ys), playfield.y0, 20), `bovenkant: ${Math.min(...ys)} vs patroon ${playfield.y0} (rand lag op ${frame.y0})`);
    assertTrue(approxEqual(Math.max(...ys), playfield.y1, 20), `onderkant: ${Math.max(...ys)} vs patroon ${playfield.y1} (rand lag op ${frame.y1})`);
  });

  it("laat een bord zonder rand met rust (patroon vult de gevonden buitenkant al)", () => {
    const size = 700;
    const playfield = { x0: 100, y0: 100, x1: 600, y1: 600 };
    const cell = (playfield.x1 - playfield.x0) / 10;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(0, 0, size, size);
    // Geen aparte zwarte rand: het patroon zelf heeft aan de buitenkant al
    // een donker veld, zodat de buitenrand-detectie (stap 1) meteen het
    // patroon zelf vindt.
    ctx.fillStyle = "#000000";
    ctx.fillRect(playfield.x0 - 2, playfield.y0 - 2, playfield.x1 - playfield.x0 + 4, playfield.y1 - playfield.y0 + 4);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        ctx.fillStyle = (row + col) % 2 === 1 ? "#3a2a18" : "#c9b183";
        ctx.fillRect(playfield.x0 + col * cell, playfield.y0 + row * cell, cell, cell);
      }
    }

    const corners = detectBoardCorners(canvas);
    assertTrue(corners !== null, "verwachtte een gevonden bord");
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    assertTrue(approxEqual(Math.min(...xs), playfield.x0, 20), `linkerkant week te veel af: ${Math.min(...xs)}`);
    assertTrue(approxEqual(Math.max(...xs), playfield.x1, 20), `rechterkant week te veel af: ${Math.max(...xs)}`);
  });

  it("vindt bij een heel dik kader (20%) het echte 10x10-patroon, dus geen 8x8- of te ruime selectie", () => {
    // Een kader van 20% (veel dikker dan een echte bordrand). De oude aanpak snoeide daar maximaal
    // 8% per kant af (de terugval `MAX_BORDER_FRACTION` bestaat nog); de patroonzoektocht
    // (`quadFit.js`) controleert het 10x10-patroon zelf en hoort dus precies op het speelveld uit
    // te komen: niet op het kader (te ruim) en niet een veld naar binnen (8x8).
    const size = 700;
    const frame = { x0: 100, y0: 100, x1: 600, y1: 600 };
    const playfield = { x0: 200, y0: 200, x1: 500, y1: 500 };
    const cell = (playfield.x1 - playfield.x0) / 10;
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
        ctx.fillStyle = (row + col) % 2 === 1 ? "#3a2a18" : "#c9b183";
        ctx.fillRect(playfield.x0 + col * cell, playfield.y0 + row * cell, cell, cell);
      }
    }
    const corners = detectBoardCorners(canvas);
    assertTrue(corners !== null, "verwachtte een gevonden bord");
    const near = (a, b) => Math.abs(a - b) <= cell * 0.6;
    assertTrue(near(Math.min(...corners.map((p) => p.x)), playfield.x0), `links ${Math.min(...corners.map((p) => p.x)).toFixed(0)} vs ${playfield.x0}`);
    assertTrue(near(Math.max(...corners.map((p) => p.x)), playfield.x1), `rechts ${Math.max(...corners.map((p) => p.x)).toFixed(0)} vs ${playfield.x1}`);
    assertTrue(near(Math.min(...corners.map((p) => p.y)), playfield.y0), `boven ${Math.min(...corners.map((p) => p.y)).toFixed(0)} vs ${playfield.y0}`);
    assertTrue(near(Math.max(...corners.map((p) => p.y)), playfield.y1), `onder ${Math.max(...corners.map((p) => p.y)).toFixed(0)} vs ${playfield.y1}`);
  });
});
