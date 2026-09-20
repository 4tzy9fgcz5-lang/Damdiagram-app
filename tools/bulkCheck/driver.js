// Testhulp (gitignored): draait de bulk-route op een paginafoto en tekent de herkenning per diagram.
export async function setup(V) {
  const M = { bulk: await import("/src/recognition/bulkDetect.js" + V), homo: await import("/src/recognition/homography.js" + V), refine: await import("/src/recognition/gridRefine.js" + V), cap: await import("/src/ui/diagramCaptureView.js" + V), board: await import("/src/core/board.js" + V) };
  const save = async (canvas, name) => { const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.88)); await fetch("/save?name=" + name, { method: "POST", body: blob }); };
  window.pageRun = async (url, tag) => {
    const t0 = performance.now();
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const boards = M.bulk.detectBulkBoards(bmp);
    const tDetect = Math.round(performance.now() - t0);
    const { fieldToCoord } = M.board; const T = 300; const tiles = []; const info = [];
    for (let i = 0; i < boards.length; i++) {
      const warped = M.homo.warpToSquareCanvas(bmp, boards[i], 500);
      const rg = M.refine.refineGrid(warped);
      const r = await M.cap.reclassifyFromDataUrl(rg.canvas.toDataURL("image/jpeg", 0.9), "cnn");
      const c = document.createElement("canvas"); c.width = T; c.height = T + 24; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, T, T + 24); g.drawImage(rg.canvas, 0, 24, T, T);
      const k = T / 500; let w = 0, b = 0;
      for (let f = 1; f <= 50; f++) {
        const { row, col } = fieldToCoord(f); const cx = (col * 50 + 25) * k, cy = 24 + (row * 50 + 25) * k, v = r.board[f];
        if (r.uncertainFields.includes(f)) { g.strokeStyle = "#ffd400"; g.lineWidth = 3; g.strokeRect(col * 50 * k + 2, 24 + row * 50 * k + 2, 50 * k - 4, 50 * k - 4); }
        if (v === M.board.PIECE_TYPES.WHITE_PIECE) { w++; g.strokeStyle = "#ff0000"; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.stroke(); }
        else if (v === M.board.PIECE_TYPES.BLACK_PIECE) { b++; g.strokeStyle = "#0055ff"; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.stroke(); }
      }
      g.strokeStyle = "rgba(255,0,255,0.3)"; g.lineWidth = 1; for (let q = 1; q < 10; q++) { g.beginPath(); g.moveTo(q * 30, 24); g.lineTo(q * 30, T + 24); g.moveTo(0, 24 + q * 30); g.lineTo(T, 24 + q * 30); g.stroke(); }
      g.fillStyle = "#000"; g.font = "bold 16px sans-serif"; g.fillText(`${tag} #${i}: W${w} Z${b} geel${r.uncertainFields.length}`, 4, 17);
      tiles.push(c); info.push({ i, w, b, geel: r.uncertainFields.length });
    }
    for (let s = 0; s < tiles.length; s += 12) {
      const part = tiles.slice(s, s + 12); const cols = 4; const rows = Math.ceil(part.length / cols);
      const sheet = document.createElement("canvas"); sheet.width = cols * T; sheet.height = rows * (T + 24); const sg = sheet.getContext("2d"); sg.fillStyle = "#fff"; sg.fillRect(0, 0, sheet.width, sheet.height);
      part.forEach((t, kk) => sg.drawImage(t, (kk % cols) * T, Math.floor(kk / cols) * (T + 24)));
      await save(sheet, `${tag}_${s / 12 + 1}.jpg`);
    }
    return { tDetect, n: boards.length, info: info.map(x => `${x.i}:W${x.w}Z${x.b}g${x.geel}`).join(" ") };
  };
  return M;
}
