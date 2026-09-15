'use strict';
/**
 * Synthetische diagram-velden in vier verzonnen drukstijlen. Alleen om de
 * pipeline te proberen zonder echte scans. Niet nodig in productie.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { formatLabelLine } = require('./labels');

const N = 48;
const root = process.argv[2] || 'fake';
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'crops'), { recursive: true });

let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// Elke stijl is een ander boek: andere arcering, andere schijfweergave.
const STYLES = [
  { name: 'arcering-fijn', hatchAngle: 1, hatchPeriod: 3, hatchDepth: 45, paper: 235, discOutline: 3, whiteFill: 250, blackFill: 35 },
  { name: 'arcering-grof', hatchAngle: -1, hatchPeriod: 6, hatchDepth: 70, paper: 245, discOutline: 4, whiteFill: 252, blackFill: 20 },
  { name: 'grijsvlak', hatchAngle: 0, hatchPeriod: 0, hatchDepth: 0, paper: 190, discOutline: 2, whiteFill: 250, blackFill: 45 },
  { name: 'zwart-wit', hatchAngle: 1, hatchPeriod: 4, hatchDepth: 100, paper: 255, discOutline: 5, whiteFill: 255, blackFill: 10 },
  // Donker speelveld: een leeg veld is hier DONKERDER dan een witte schijf, precies
  // omgekeerd aan de stijlen hierboven. Dit breekt elke vaste drempel.
  { name: 'donkervlak', hatchAngle: 0, hatchPeriod: 0, hatchDepth: 0, paper: 85, discOutline: 2, whiteFill: 245, blackFill: 25 },
  // Open ring: de witte schijf is alleen een cirkellijn, de binnenkant is het
  // speelveld zelf. Midden van wit en midden van leeg zijn dus identiek.
  { name: 'open-ring', hatchAngle: 0, hatchPeriod: 0, hatchDepth: 0, paper: 100, discOutline: 4, whiteOpen: true, whiteFill: 245, blackFill: 20 },
];

const lines = [];
let d = 0;
for (const style of STYLES) {
  for (let k = 0; k < 5; k++) {
    d++;
    const photo = `diag${String(d).padStart(2, '0')}`;
    fs.mkdirSync(path.join(root, 'crops', photo), { recursive: true });
    const exposure = 0.75 + rnd() * 0.5; // scan-helderheid varieert per diagram
    const labels = [];
    for (let sq = 1; sq <= 50; sq++) {
      const r = rnd();
      const label = r < 0.35 ? 'empty' : r < 0.68 ? 'white' : 'black';
      labels.push(label);
      const png = new PNG({ width: N, height: N });
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = x - (N - 1) / 2;
          const dy = y - (N - 1) / 2;
          const rad = Math.hypot(dx, dy) / N;
          let v = style.paper;
          if (style.hatchPeriod) {
            const t = style.hatchAngle >= 0 ? x + y : x - y;
            if (((t % style.hatchPeriod) + style.hatchPeriod) % style.hatchPeriod < 1.2) {
              v -= style.hatchDepth;
            }
          }
          if (label !== 'empty') {
            const R = 0.38;
            const outline = style.discOutline / N;
            const openWhite = style.whiteOpen && label === 'white';
            if (rad < R - outline) {
              if (!openWhite) v = label === 'white' ? style.whiteFill : style.blackFill;
            }
            else if (rad < R) v = 15; // getekende cirkelrand
          }
          v = v * exposure + (rnd() - 0.5) * 10;
          const i = (y * N + x) << 2;
          const g = Math.max(0, Math.min(255, v));
          png.data[i] = png.data[i + 1] = png.data[i + 2] = g;
          png.data[i + 3] = 255;
        }
      }
      fs.writeFileSync(
        path.join(root, 'crops', photo, `${String(sq).padStart(2, '0')}.png`),
        PNG.sync.write(png)
      );
    }
    lines.push(formatLabelLine(photo, labels, style.name));
  }
}
fs.writeFileSync(path.join(root, 'labels.txt'), lines.join('\n') + '\n');
console.log(`Testdata in ${root}/ — ${STYLES.length} stijlen, ${d} diagrammen`);
