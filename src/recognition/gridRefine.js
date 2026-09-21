// Fase 1 van het herkenning-verbeterplan (zie CLAUDE.md): het raster automatisch
// een klein beetje bijstellen na het rechttrekken, zodat kleine onnauwkeurigheid
// in de handmatig (of automatisch) aangewezen hoekpunten niet meer leidt tot een
// raster dat een fractie naast de echte velden ligt — vooral de buitenste velden
// (1, 5, 46, 50) waren daar gevoelig voor.
//
// Werkwijze: het dambord heeft altijd een schaakbordpatroon (afwisselend licht/
// donker), dus op de 18 echte rasterlijnen (9 verticaal, 9 horizontaal) zit altijd
// een scherpe overgang — ongeacht welke stukken erop staan. We zoeken de kleine
// verschuiving/schaal/rotatie van het aangenomen 10x10-raster die de opgetelde
// randsterkte (Sobel-gradiënt) langs die 18 lijnen maximaliseert, en trekken het
// beeld dan met die correctie recht — dezelfde homografie-machinery als de eerste
// keer rechttrekken (`homography.js`), nu met een piepklein quadrilateral in
// plaats van de door de gebruiker aangewezen hoeken.
//
// Bewust GEEN gebruik van de classifier zelf om te scoren (te traag om
// tientallen keren per foto te draaien, en dan leun je op een model waarvan je
// juist de fouten probeert te verkleinen) — dit is een volledig aparte,
// classifier-onafhankelijke stap.

import { toGray } from "./newFeatures.js?v=20260921am";
import { computeHomography, warpPerspective } from "./homography.js?v=20260921am";

function gradientMagnitude(gray, w, h) {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function sampleMag(mag, size, x, y) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= size || yi >= size) return 0;
  return mag[yi * size + xi];
}

// Beeldt een "ideale" 10x10-rasterpositie af op waar die daadwerkelijk in het
// (nog ongecorrigeerde) rechtgetrokken beeld ligt, gegeven een kandidaat-correctie.
function makeMapper(size, dx, dy, scale, rotRad) {
  const c = size / 2;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  return (x0, y0) => {
    const rx = x0 - c;
    const ry = y0 - c;
    const rrx = rx * cos - ry * sin;
    const rry = rx * sin + ry * cos;
    return { x: rrx * scale + c + dx, y: rry * scale + c + dy };
  };
}

const SAMPLE_STEP = 4;

function scoreTransform(mag, size, dx, dy, scale, rotRad) {
  const map = makeMapper(size, dx, dy, scale, rotRad);
  const step = size / 10;
  let total = 0;
  for (let k = 1; k < 10; k++) {
    const gridPos = k * step;
    for (let t = 0; t <= size; t += SAMPLE_STEP) {
      const v = map(gridPos, t);
      total += sampleMag(mag, size, v.x, v.y);
      const h = map(t, gridPos);
      total += sampleMag(mag, size, h.x, h.y);
    }
  }
  return total;
}

// warpedCanvas: het al rechtgetrokken 10x10-beeld (bijvoorbeeld 500x500).
// Geeft { canvas, improved, dx, dy, scale, rotationDeg } terug. `canvas` is het
// (mogelijk) opnieuw rechtgetrokken beeld; als er niets te verbeteren viel is
// dat gewoon `warpedCanvas` zelf terug (identiteit was al de beste kandidaat).
export function refineGrid(warpedCanvas) {
  const size = warpedCanvas.width;
  const ctx = warpedCanvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, size, size);
  const gray = toGray(imageData.data, size, size, 4);
  const mag = gradientMagnitude(gray, size, size);

  let best = { dx: 0, dy: 0, scale: 1, rotDeg: 0 };
  let bestScore = scoreTransform(mag, size, 0, 0, 1, 0);

  function tryCandidates(partials) {
    for (const partial of partials) {
      const candidate = { ...best, ...partial };
      const score = scoreTransform(
        mag,
        size,
        candidate.dx,
        candidate.dy,
        candidate.scale,
        (candidate.rotDeg * Math.PI) / 180
      );
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }

  // Stap 1: grove verschuiving (dekt de meest voorkomende fout: hoekpunten net
  // niet exact op de speelveldrand).
  const coarse = [-6, -3, 0, 3, 6];
  tryCandidates(coarse.flatMap((dx) => coarse.map((dy) => ({ dx, dy }))));
  // Stap 2: schaal.
  tryCandidates([0.97, 0.985, 1, 1.015, 1.03].map((scale) => ({ scale })));
  // Stap 3: rotatie.
  tryCandidates([-1.5, -0.75, 0, 0.75, 1.5].map((rotDeg) => ({ rotDeg })));
  // Stap 4: verschuiving verfijnen rond de inmiddels beste schaal/rotatie.
  const fine = [-1.5, 0, 1.5];
  tryCandidates(fine.flatMap((ddx) => fine.map((ddy) => ({ dx: best.dx + ddx, dy: best.dy + ddy }))));

  const improved = best.dx !== 0 || best.dy !== 0 || best.scale !== 1 || best.rotDeg !== 0;
  if (!improved) {
    return { canvas: warpedCanvas, improved: false, dx: 0, dy: 0, scale: 1, rotationDeg: 0 };
  }

  const map = makeMapper(size, best.dx, best.dy, best.scale, (best.rotDeg * Math.PI) / 180);
  const dstCorners = [map(0, 0), map(size, 0), map(size, size), map(0, size)];
  const squareCorners = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  const H = computeHomography(squareCorners, dstCorners);
  // Randherhaling i.p.v. wit: de bijstelling schuift het beeld een paar pixels, en een
  // witte band langs de rand liet de herkenners de onderste/buitenste velden missen.
  const correctedImageData = warpPerspective(imageData, H, size, size, true);
  const correctedCanvas = document.createElement("canvas");
  correctedCanvas.width = size;
  correctedCanvas.height = size;
  correctedCanvas.getContext("2d").putImageData(correctedImageData, 0, 0);

  return { canvas: correctedCanvas, improved: true, dx: best.dx, dy: best.dy, scale: best.scale, rotationDeg: best.rotDeg };
}
