import { describe, it, assertTrue, assertEqual } from "./test-runner.js?v=20260922a";
import { fitBoardQuad, findMissingBoards, patternSeparation } from "../src/recognition/quadFit.js?v=20260922a";

// Tekent een dambord (10x10, donkere velden waar rij+kolom oneven is) met dikke zwarte
// rand op `ctx`, in het coördinatenstelsel van de huidige transformatie: het speelveld
// beslaat (0,0)-(size,size), de rand zit erbuiten.
function drawBoard(ctx, size, frame) {
  ctx.fillStyle = "#000";
  ctx.fillRect(-frame, -frame, size + 2 * frame, size + 2 * frame);
  const cell = size / 10;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      ctx.fillStyle = (r + c) % 2 === 1 ? "#4a4038" : "#d8ccb0";
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
}

function canvasOf(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe("dambord-hoeken zoeken op het patroon (quadFit)", () => {
  it("vindt de echte hoeken van een scheef, verdraaid bord met een nummer erboven", () => {
    const { canvas, ctx } = canvasOf(700, 700);
    // Nummer vlak boven het bord.
    ctx.fillStyle = "#000";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("185", 300, 105);
    // Het bord: schuin (afschuiving + draaiing), zoals bij een scheef genomen foto.
    const T = [0.99, 0.07, -0.06, 1, 150, 130]; // x' = a*x + c*y + e ; y' = b*x + d*y + f
    ctx.setTransform(...T);
    drawBoard(ctx, 400, 14);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const at = (x, y) => ({ x: T[0] * x + T[2] * y + T[4], y: T[1] * x + T[3] * y + T[5] });
    const truth = [at(0, 0), at(400, 0), at(400, 400), at(0, 400)];

    // Beginschatting zoals de blobdetectie die geeft: rechte rechthoek rond de rand ÉN het nummer.
    const initial = [
      { x: 120, y: 80 },
      { x: 590, y: 80 },
      { x: 590, y: 580 },
      { x: 120, y: 580 },
    ];
    const fit = fitBoardQuad(ctx.getImageData(0, 0, 700, 700), initial);
    truth.forEach((t, i) => {
      const d = dist(fit.corners[i], t);
      assertTrue(d < 12, `hoek ${i}: ${d.toFixed(1)}px van de echte hoek (${fit.corners[i].x.toFixed(0)},${fit.corners[i].y.toFixed(0)} vs ${t.x.toFixed(0)},${t.y.toFixed(0)})`);
    });
    assertTrue(fit.separation > 0.95, `scheiding ${fit.separation}`);
  });

  it("geeft een lage 'geruitheid' voor willekeurige ruis (geen dambord)", () => {
    const size = 300;
    const data = new Uint8ClampedArray(size * size * 4);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < size * size; i++) {
      const v = 100 + rnd() * 100;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const gray = new Float32Array(size * size);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4];
    const quad = [{ x: 20, y: 20 }, { x: 280, y: 20 }, { x: 280, y: 280 }, { x: 20, y: 280 }];
    const sep = patternSeparation(gray, size, size, quad);
    assertTrue(sep < 0.65, `ruis scoorde ${sep}`);
  });

  it("vindt een ontbrekend bord op een leeg kruispunt van het rijen/kolommen-raster, en niets als alles gevonden is", () => {
    const { canvas, ctx } = canvasOf(1000, 700);
    const size = 200;
    const xs = [60, 350, 640];
    const ys = [60, 380];
    const quadAt = (x, y) => [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size },
    ];
    for (const y of ys) {
      for (const x of xs) {
        ctx.setTransform(1, 0, 0, 1, x, y);
        drawBoard(ctx, size, 6);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const imageData = ctx.getImageData(0, 0, 1000, 700);
    const all = ys.flatMap((y) => xs.map((x) => quadAt(x, y)));

    assertEqual(findMissingBoards(imageData, all).length, 0);

    const missing = all.filter((_, i) => i !== 4); // rij 2, midden ontbreekt
    const found = findMissingBoards(imageData, missing);
    assertEqual(found.length, 1);
    const c = found[0].corners;
    const cx = c.reduce((s, p) => s + p.x, 0) / 4;
    const cy = c.reduce((s, p) => s + p.y, 0) / 4;
    assertTrue(Math.abs(cx - (350 + size / 2)) < 15 && Math.abs(cy - (380 + size / 2)) < 15, `midden op (${cx.toFixed(0)},${cy.toFixed(0)}), verwacht (450,480)`);
  });

  it("voegt niets toe op een lege plek waar geen bord staat (bijv. tekst)", () => {
    const { canvas, ctx } = canvasOf(1000, 700);
    const size = 200;
    const spots = [[60, 60], [350, 60], [60, 380]];
    for (const [x, y] of spots) {
      ctx.setTransform(1, 0, 0, 1, x, y);
      drawBoard(ctx, size, 6);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#222";
    ctx.font = "16px monospace";
    for (let i = 0; i < 12; i++) ctx.fillText("27-22 (18x27) 33-29 (24x31) 30-24", 340, 400 + i * 20);
    const quads = spots.map(([x, y]) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }]);
    const found = findMissingBoards(ctx.getImageData(0, 0, 1000, 700), quads);
    assertEqual(found.length, 0);
  });
});

describe("losse foto: bord in het midden met een ander diagram ernaast", () => {
  // Zoals de foto's van Jan: het bedoelde bord in het midden, met er direct boven en onder een
  // stuk van het volgende/vorige diagram (met een nummer ertussen).
  function pageWithNeighbours() {
    const { canvas, ctx } = canvasOf(600, 800);
    const size = 300;
    const spots = [[150, -170], [150, 250], [150, 670]]; // boven (half in beeld), midden, onder (half in beeld)
    for (const [x, y] of spots) {
      ctx.setTransform(1, 0, 0, 1, x, y);
      drawBoard(ctx, size, 6);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("195", 275, 218);
    ctx.fillText("196", 275, 640);
    return { imageData: ctx.getImageData(0, 0, 600, 800), middle: [150, 250, 450, 550] };
  }

  it("kiest het bord in het midden, niet een stuk van de buren of twee borden samen", async () => {
    const { imageData, middle } = pageWithNeighbours();
    const { detectPlayfieldFromImageData } = await import("../src/recognition/detectBoard.js?v=20260922a");
    const found = detectPlayfieldFromImageData(imageData, 600, 800);
    assertTrue(found !== null, "verwachtte een gevonden bord");
    const xs = found.corners.map((p) => p.x);
    const ys = found.corners.map((p) => p.y);
    const [x0, y0, x1, y1] = middle;
    assertTrue(Math.abs(Math.min(...xs) - x0) < 20 && Math.abs(Math.max(...xs) - x1) < 20, `links/rechts ${Math.min(...xs).toFixed(0)}-${Math.max(...xs).toFixed(0)} vs ${x0}-${x1} (${found.source})`);
    assertTrue(Math.abs(Math.min(...ys) - y0) < 20 && Math.abs(Math.max(...ys) - y1) < 20, `boven/onder ${Math.min(...ys).toFixed(0)}-${Math.max(...ys).toFixed(0)} vs ${y0}-${y1} (${found.source})`);
  });
});
