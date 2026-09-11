function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxAbs) {
        maxAbs = Math.abs(M[r][col]);
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-9) {
      throw new Error("De 4 hoekpunten liggen te dicht bij elkaar of op één lijn; wijs ze opnieuw aan.");
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivotVal = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= pivotVal;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// Berekent de 3x3-homografie die elk bronpunt src[i] afbeeldt op dst[i] (i = 0..3).
export function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(H, x, y) {
  const X = H[0] * x + H[1] * y + H[2];
  const Y = H[3] * x + H[4] * y + H[5];
  const W = H[6] * x + H[7] * y + H[8];
  return { x: X / W, y: Y / W };
}

function samplePixel(src, sw, sh, sx, sy, outIdx, out) {
  if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
    out.data[outIdx] = 255;
    out.data[outIdx + 1] = 255;
    out.data[outIdx + 2] = 255;
    out.data[outIdx + 3] = 255;
    return;
  }
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, sw - 1);
  const y1 = Math.min(y0 + 1, sh - 1);
  const fx = sx - x0;
  const fy = sy - y0;
  for (let c = 0; c < 4; c++) {
    const p00 = src[(y0 * sw + x0) * 4 + c];
    const p10 = src[(y0 * sw + x1) * 4 + c];
    const p01 = src[(y1 * sw + x0) * 4 + c];
    const p11 = src[(y1 * sw + x1) * 4 + c];
    const top = p00 * (1 - fx) + p10 * fx;
    const bottom = p01 * (1 - fx) + p11 * fx;
    out.data[outIdx + c] = top * (1 - fy) + bottom * fy;
  }
}

// H moet output-coördinaten afbeelden op bron-coördinaten (dus: computeHomography(outputHoeken, bronHoeken)).
export function warpPerspective(sourceImageData, H, outWidth, outHeight) {
  const out = new ImageData(outWidth, outHeight);
  const sw = sourceImageData.width;
  const sh = sourceImageData.height;
  const src = sourceImageData.data;
  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      const { x: sx, y: sy } = applyHomography(H, ox + 0.5, oy + 0.5);
      samplePixel(src, sw, sh, sx, sy, (oy * outWidth + ox) * 4, out);
    }
  }
  return out;
}

// Rechttrekken van het gebied binnen de 4 aangewezen hoeken (bron-coördinaten) naar
// een vierkant beeld van outSize x outSize, als canvas.
export function warpToSquareCanvas(sourceCanvasOrBitmap, corners, outSize) {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = sourceCanvasOrBitmap.width;
  srcCanvas.height = sourceCanvasOrBitmap.height;
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.drawImage(sourceCanvasOrBitmap, 0, 0);
  const sourceImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const squareCorners = [
    { x: 0, y: 0 },
    { x: outSize, y: 0 },
    { x: outSize, y: outSize },
    { x: 0, y: outSize },
  ];
  const H = computeHomography(squareCorners, corners);
  const warped = warpPerspective(sourceImageData, H, outSize, outSize);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  outCanvas.getContext("2d").putImageData(warped, 0, 0);
  return outCanvas;
}
