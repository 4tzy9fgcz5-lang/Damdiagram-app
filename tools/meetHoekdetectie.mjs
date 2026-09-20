// Meetprogramma voor de automatische hoekdetectie (buiten de app, in Node).
// Draait detectPlayfieldFromImageData() op een map PNG's (max 700px langste zijde —
// dezelfde grootte als de app zelf gebruikt) en tekent per foto het gevonden kader
// (rood) en de buitenrand uit stap 1 (oranje) erop, zodat je het met het oog kunt
// controleren. Print per foto welk kader gekozen is en hoeveel kleiner het speelveld
// is dan de buitenrand.
//
// Voorbereiding (macOS):  for f in map/*.jpeg; do sips -s format png -Z 700 "$f" --out foto_png/$(basename "$f" .jpeg).png; done
// Gebruik (vanuit de project-root):  node tools/meetHoekdetectie.mjs foto_png uitvoer_map
globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
import fs from "node:fs";
import path from "node:path";
import { PNG } from "../node_modules/pngjs/lib/png.js";
const { detectPlayfieldFromImageData } = await import("../src/recognition/detectBoard.js");

const dir = process.argv[2];
const outDir = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const side = (c) => (dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]) + dist(c[3], c[0])) / 4;

function line(png, a, b, col) {
  const n = Math.ceil(dist(a, b));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n), y = Math.round(a.y + ((b.y - a.y) * i) / n);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= png.width || yy >= png.height) continue;
      const k = (yy * png.width + xx) * 4;
      png.data[k] = col[0]; png.data[k + 1] = col[1]; png.data[k + 2] = col[2]; png.data[k + 3] = 255;
    }
  }
}
const rows = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  const res = detectPlayfieldFromImageData(png, png.width, png.height);
  let info;
  if (!res) info = { f, none: true };
  else {
    const ratio = side(res.corners) / side(res.outer);
    info = { f, ratio: +ratio.toFixed(3), source: res.source };
    for (let i = 0; i < 4; i++) line(png, res.outer[i], res.outer[(i + 1) % 4], [255, 160, 0]);
    for (let i = 0; i < 4; i++) line(png, res.corners[i], res.corners[(i + 1) % 4], [255, 0, 0]);
  }
  rows.push(info);
  fs.writeFileSync(path.join(outDir, f), PNG.sync.write(png));
}
for (const r of rows) console.log(r.none ? `${r.f}  GEEN` : `${r.f}  ${r.ratio} ${r.source}`);
const rs = rows.filter((r) => !r.none).map((r) => r.ratio);
console.log("totaal", rows.length, "geen", rows.filter((r) => r.none).length, "ratio<0.85:", rs.filter((x) => x < 0.85).length, "ratio<0.9:", rs.filter((x) => x < 0.9).length);
