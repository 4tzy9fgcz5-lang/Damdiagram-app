import { computeHomography, warpPerspective } from "./homography.js?v=20260921ap";

// Meet hoe goed een kader (4 hoeken) bij een echt 10x10-dambordpatroon past.
// Doel: bij de automatische hoekdetectie de beste van een paar kandidaat-kaders
// kunnen kiezen (het gevonden kader, de hele foto, een vaste marge) — en zo te
// voorkomen dat een te klein of te ruim kader (bijvoorbeeld 8x8 velden i.p.v.
// 10x10) wordt gekozen.
//
// Werkwijze: trek het kader recht tot een vierkant en kijk naar de randsterkte
// (Sobel) langs de 9 binnenste rasterlijnen per richting. Bij een juist 10x10-
// kader ligt op elk van die 18 lijnen een echte veldrand; bij een kader dat te
// klein of te groot is liggen (een deel van) die lijnen midden in een veld of
// ernaast. Daarom telt de ZWAKSTE lijn (het laagste, niet het gemiddelde): een
// kader dat toevallig op een veelvoud van de celbreedte past (bijvoorbeeld een
// kader over precies 5x5 velden) heeft nog steeds de helft van de lijnen midden in
// een veld en scoort dus laag. De score is een verhouding ten opzichte van de
// randsterkte halverwege twee lijnen (waar bij een goed kader geen rand zit),
// zodat de score niet afhangt van hoe scherp of contrastrijk de foto is.

const FIT_SIZE = 300;

function gradientMagnitude(gray, w, h) {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - (gray[i - w - 1] + 2 * gray[i - 1] + gray[i + w - 1]);
      const gy =
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1]);
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

// Gemiddelde randsterkte langs één lijn (verticaal of horizontaal), met ±1 pixel
// speling voor kleine afwijkingen. Het buitenste stukje (5%) van de lijn telt niet
// mee: daar zit vaak de rand van het bord zelf.
function lineEnergy(mag, size, pos, vertical) {
  const from = Math.floor(size * 0.05);
  const to = Math.ceil(size * 0.95);
  let sum = 0;
  let count = 0;
  for (let t = from; t < to; t++) {
    let best = 0;
    for (let d = -1; d <= 1; d++) {
      const p = Math.min(size - 1, Math.max(0, Math.round(pos) + d));
      const v = vertical ? mag[t * size + p] : mag[p * size + t];
      if (v > best) best = v;
    }
    sum += best;
    count++;
  }
  return sum / count;
}

// corners: 4 hoeken (TL, TR, BR, BL) in de coördinaten van `imageData`.
// Hoger = past beter bij een 10x10-dambord; ~1 = geen patroon.
export function gridFitScore(imageData, corners) {
  const square = [
    { x: 0, y: 0 },
    { x: FIT_SIZE, y: 0 },
    { x: FIT_SIZE, y: FIT_SIZE },
    { x: 0, y: FIT_SIZE },
  ];
  const H = computeHomography(square, corners);
  const warped = warpPerspective(imageData, H, FIT_SIZE, FIT_SIZE);
  const gray = new Float32Array(FIT_SIZE * FIT_SIZE);
  for (let i = 0, p = 0; i < warped.data.length; i += 4, p++) {
    gray[p] = 0.299 * warped.data[i] + 0.587 * warped.data[i + 1] + 0.114 * warped.data[i + 2];
  }
  const mag = gradientMagnitude(gray, FIT_SIZE, FIT_SIZE);

  const step = FIT_SIZE / 10;
  let worst = Infinity;
  for (const vertical of [true, false]) {
    let off = 0;
    for (let k = 0; k < 10; k++) off += lineEnergy(mag, FIT_SIZE, (k + 0.5) * step, vertical);
    off /= 10;
    for (let k = 1; k < 10; k++) {
      const on = lineEnergy(mag, FIT_SIZE, k * step, vertical);
      worst = Math.min(worst, on / Math.max(off, 1e-6));
    }
  }
  return worst;
}
