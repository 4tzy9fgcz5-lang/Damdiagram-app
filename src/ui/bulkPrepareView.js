// Bulk-import, automatische modus: herkent alle diagrammen van de rij alvast, zonder dat je bij elk
// diagram het hoekenscherm hoeft te doorlopen. Daarna hoef je per diagram alleen nog de stand (en
// de ingelezen oplossing) te controleren in de editor. Zie ook bulkReview.js voor de volgorde.
//
// Foto voor foto: een foto wordt één keer op volle resolutie geladen, alle diagrammen ervan worden
// herkend, en de foto wordt weer losgelaten — zo blijft het geheugen klein bij een heel boek.

import { loadDrawable } from "./imageInput.js?v=20260923a";
import { recognizeDiagram } from "./diagramCaptureView.js?v=20260923a";
import { parseOplossing } from "../core/solutionParser.js?v=20260923a";
import { orderForReview, reviewCounts } from "../core/bulkReview.js?v=20260923a";

const tick = () => new Promise((r) => setTimeout(r, 0));

// Legt vast of de geplakte oplossing op de herkende stand past: "ok", "let-op" (loopt, maar met een
// herstelde of gegokte zet), "fout" (past niet). Begint de oplossing met zwart, dan is dat geen
// twijfel maar een instelling: `beurt` wordt "black" en de editor start daarmee.
export function checkSolutionFit(diagram) {
  diagram.oplossingStatus = "";
  diagram.beurt = "white";
  if (!diagram.oplossingTekst || !diagram.result) return;
  const board = diagram.result.board;
  let r = parseOplossing(diagram.oplossingTekst, { board, turn: "white" });
  if (r.fout?.andereBeurt) {
    diagram.beurt = "black";
    r = parseOplossing(diagram.oplossingTekst, { board, turn: "black" });
  }
  diagram.oplossingStatus = r.volledig ? (r.betrouwbaar ? "ok" : "let-op") : "fout";
}

export function renderBulkPrepare(container, { queue, onDone, onFallback } = {}) {
  const todo = queue.diagrams.filter((d) => !d.manual && !d.result);
  container.innerHTML = `
    <h2>Diagrammen herkennen</h2>
    <div class="card" data-role="busy">
      <p>De app herkent nu alle diagrammen, zodat je straks per diagram alleen de stand hoeft te
        controleren. Laat dit scherm open staan; bij een heel boek kan dit een paar minuten duren.</p>
      <p data-role="progress" style="font-weight:600;color:#1a5c38;"></p>
      <progress data-role="bar" max="${todo.length}" value="0" style="width:100%;"></progress>
      <div class="button-row">
        <button type="button" class="secondary" data-action="stop">Stoppen en toch per diagram de hoeken bekijken</button>
      </div>
    </div>
    <div class="card" data-role="done" style="display:none;">
      <p data-role="summary" style="font-weight:600;"></p>
      <ul data-role="counts" style="margin:0.4rem 0 0.75rem 1.1rem;"></ul>
      <label style="display:block;margin:0.3rem 0;"><input type="radio" name="volgorde" value="twijfel" checked />
        Twijfelgevallen eerst (aanbevolen): eerst de diagrammen waar de app niet zeker van is, daarna de rest</label>
      <label style="display:block;margin:0.3rem 0;"><input type="radio" name="volgorde" value="boek" />
        In boekvolgorde</label>
      <div class="button-row">
        <button type="button" class="primary" data-action="start">Begin met controleren</button>
      </div>
    </div>`;

  const el = (sel) => container.querySelector(sel);
  let cancelled = false;

  el('[data-action="stop"]').addEventListener("click", () => {
    cancelled = true;
    onFallback?.();
  });

  el('[data-action="start"]').addEventListener("click", () => {
    const mode = container.querySelector('input[name="volgorde"]:checked')?.value ?? "twijfel";
    queue.diagrams = orderForReview(queue.diagrams, mode);
    queue.index = 0;
    onDone?.();
  });

  (async () => {
    const progress = el('[data-role="progress"]');
    const bar = el('[data-role="bar"]');
    let done = 0;
    for (let pi = 0; pi < queue.pages.length; pi++) {
      const mine = queue.diagrams.filter((d) => d.page === pi && !d.manual && !d.result);
      if (mine.length === 0) continue;
      let drawable;
      try {
        drawable = await loadDrawable(queue.pages[pi].file);
      } catch (err) {
        for (const d of mine) d.fout = `foto kon niet geopend worden (${err.message})`;
        done += mine.length;
        continue;
      }
      try {
        for (const d of mine) {
          if (cancelled) return;
          progress.textContent = `Diagram ${done + 1} van ${todo.length} wordt herkend (foto ${pi + 1} van ${queue.pages.length})...`;
          bar.value = done;
          await tick();
          try {
            d.result = await recognizeDiagram(drawable, d.corners, "cnn");
            checkSolutionFit(d);
          } catch (err) {
            d.fout = err.message;
          }
          done++;
        }
      } finally {
        drawable.close?.();
      }
    }
    if (cancelled) return;
    bar.value = todo.length;
    const c = reviewCounts(queue.diagrams);
    el('[data-role="busy"]').style.display = "none";
    el('[data-role="done"]').style.display = "block";
    el('[data-role="summary"]').textContent = `${c.totaal} diagram(men) herkend.`;
    const regels = [];
    regels.push(`${c.zonderTwijfel} zonder twijfel`);
    if (c.onzeker) regels.push(`${c.onzeker} met onzekere velden of een aangepaste zet`);
    if (c.oplossingFout) regels.push(`${c.oplossingFout} waarbij de geplakte oplossing niet past op de herkende stand`);
    if (c.handwerk) regels.push(`${c.handwerk} die je zelf moet aanwijzen of die niet herkend konden worden`);
    el('[data-role="counts"]').innerHTML = regels.map((r) => `<li>${r}</li>`).join("");
  })();
}
