// Meetprogramma voor de bulk-import (buiten de app, in Node): zoekt op elke
// paginafoto (PNG, liefst op volle resolutie, max ~2400px) de diagrammen zoals de
// app dat doet (detectie op 1600px, kaders omgerekend naar volle resolutie), en
// bewaart per diagram het rechtgetrokken beeld met de kaders zoals de app ze vóór
// (`a_raw`) en na (`b_strip`) het wegsnijden van de bordrand zou gebruiken, plus
// de patroon-scores. Bekijk de uitvoer als plaatje met een 10x10-hulpraster erover.
//
// Voorbereiding (macOS):  sips -s format png -Z 2400 foto.jpeg --out paginas/001.png
// Gebruik (vanuit de project-root):  node tools/meetBulkImport.mjs paginas uitvoer_map
globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
import fs from "node:fs"; import path from "node:path";
import { PNG } from "../node_modules/pngjs/lib/png.js";
const R = "../src/recognition/";
const { detectMultipleCornersFromImageData } = await import(R + "detectMultiBoard.js");
const { gridFitScore } = await import(R + "gridFit.js");
const { stripBorderToPlayfield } = await import(R + "detectBoard.js");
const { computeHomography, warpPerspective } = await import(R + "homography.js");
const PAGES = process.argv[2];
const out = process.argv[3]; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
function boxDown(png, maxSide) {
  const sc = Math.min(1, maxSide / Math.max(png.width, png.height));
  if (sc === 1) return png;
  const w = Math.round(png.width * sc), h = Math.round(png.height * sc);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x / sc), x1 = Math.max(x0 + 1, Math.floor((x + 1) / sc)), y0 = Math.floor(y / sc), y1 = Math.max(y0 + 1, Math.floor((y + 1) / sc));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < Math.min(y1, png.height); yy++) for (let xx = x0; xx < Math.min(x1, png.width); xx++) { const i = (yy * png.width + xx) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++; }
    const o = (y * w + x) * 4; data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
const rows = [];
for (const full of fs.readdirSync(PAGES).filter((f) => f.endsWith(".png")).sort()) {
  const id = full.replace(/\.png$/, "").slice(0, 12);
  const pf = PNG.sync.read(fs.readFileSync(path.join(PAGES, full)));
  const p7 = boxDown(pf, 1600);
  const k = pf.width / p7.width;
  const cands = detectMultipleCornersFromImageData(p7, p7.width, p7.height);
  cands.forEach((c, i) => {
    const raw = c.map((p) => ({ x: p.x * k, y: p.y * k }));
    let strip; try { strip = stripBorderToPlayfield(pf, raw); } catch { strip = raw; }
    const sq = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }];
    const save = (name, corners) => {
      const H = computeHomography(sq, corners);
      const w = warpPerspective(pf, H, 300, 300);
      const png = new PNG({ width: 300, height: 300 }); png.data = Buffer.from(w.data);
      fs.writeFileSync(path.join(out, `${id}_${String(i).padStart(2, "0")}_${name}.png`), PNG.sync.write(png));
    };
    save("a_raw", raw); save("b_strip", strip);
    const side = (q) => Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
    rows.push({ id, i, raw: gridFitScore(pf, raw), strip: gridFitScore(pf, strip), size: Math.round(side(raw)), stripRatio: side(strip) / side(raw) });
  });
}
for (const r of rows) console.log(r.id, r.i, "px", r.size, "raw", r.raw.toFixed(2), "strip", r.strip.toFixed(2), "ratio", r.stripRatio.toFixed(2));
console.log("diagrammen:", rows.length);
