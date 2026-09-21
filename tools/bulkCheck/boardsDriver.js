// Testhulp: draait de bulk-route (detectie + rechttrekken + neurale herkenning) op paginafoto's
// en bewaart per diagram de herkende stelling als FEN in een JSON-bestand, voor
// tools/meetOplossingen.mjs. Draait in de browser, met de server uit README.md
// (python3 tools/bulkCheck/server.py <uitvoermap>) en index.html geopend:
//
//   const d = await import("/tools/bulkCheck/boardsDriver.js");
//   await d.boardsToJson("?v=<cache-versie>", [["/testdata/oplossingen/IMG_0766.jpg", 570], ["/testdata/oplossingen/IMG_0767.jpg", 582]], "boards.json");
//
// Elk paar is [paginafoto, nummer van het eerste diagram]; de nummers lopen daarna per
// diagram op in leesvolgorde (rij voor rij). Klopt dat niet voor een boek (nummers per
// kolom), pas de nummers dan achteraf aan in het JSON-bestand.
export async function boardsToJson(V, pages, outName) {
  const M = {
    bulk: await import("/src/recognition/bulkDetect.js" + V),
    homo: await import("/src/recognition/homography.js" + V),
    refine: await import("/src/recognition/gridRefine.js" + V),
    cap: await import("/src/ui/diagramCaptureView.js" + V),
    fen: await import("/src/core/fen.js" + V),
  };
  const all = [];
  for (const [url, firstNumber] of pages) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const boards = M.bulk.detectBulkBoards(bmp);
    for (let i = 0; i < boards.length; i++) {
      const warped = M.homo.warpToSquareCanvas(bmp, boards[i], 500);
      const rg = M.refine.refineGrid(warped);
      const r = await M.cap.reclassifyFromDataUrl(rg.canvas.toDataURL("image/jpeg", 0.9), "cnn");
      all.push({ nummer: firstNumber + i, fen: M.fen.boardToFen(r.board, "white"), geel: r.uncertainFields, hoeken: boards[i].map((p) => [Math.round(p.x), Math.round(p.y)]) });
    }
  }
  await fetch("/save?name=" + outName, { method: "POST", body: new Blob([JSON.stringify(all, null, 1)]) });
  return all.length;
}
