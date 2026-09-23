import { createStartBoard } from "../core/board.js?v=20260923o";
import { parseFen } from "../core/fen.js?v=20260923o";
import { applyMove, plyColor, plyMoveNumber, moveToNotation } from "../core/draughtsMoves.js?v=20260923o";
import { hoofdlijnKnopen } from "../core/zettenboom.js?v=20260923o";
import { renderDiagramSVG } from "../diagram/render.js?v=20260923o";
import { naamWeergave } from "../core/namen.js?v=20260923o";
import { getPartij, savePartij } from "../db/partijen.js?v=20260923o";
import { buildFilmDocxBlob } from "../export/filmDocx.js?v=20260923o";
import { downloadBlob } from "../export/docx.js?v=20260923o";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fase 2, stap 5 (uitbreiding): de filmmodule. Zie CLAUDE.md ("Filmmodule") voor de volledige
// omschrijving — kort: de trainer kiest N (standaard 6) momenten uit de partij; die worden
// bewaard bij de partij (savePartij, veld `film`) en gebruikt om een opdrachtvel (lege
// diagrammen) en/of antwoordvel (ingevuld) te genereren (filmDocx.js).
export async function renderFilmModuleView(container, { partijId, onBack } = {}) {
  const partij = await getPartij(partijId);
  if (!partij) {
    container.innerHTML = `<p>Deze partij bestaat niet (meer).</p>`;
    return;
  }

  const { board: beginBord, turn } = partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
  const hoofdlijn = hoofdlijnKnopen(partij.wortel);
  if (hoofdlijn.length === 0) {
    container.innerHTML = `
      <button type="button" class="secondary" data-action="back" style="margin-bottom:0.75rem;">&#8592; Terug naar de partij</button>
      <p>Deze partij heeft nog geen zetten — voeg eerst de partij in voor je 'm kunt filmen.</p>
    `;
    container.querySelector('[data-action="back"]').addEventListener("click", () => onBack?.());
    return;
  }
  const standen = [beginBord];
  for (const knoop of hoofdlijn) standen.push(applyMove(standen[standen.length - 1], knoop.zet));

  let aantal = partij.film?.aantalDiagrammen ?? 6;
  const gekozen = new Set(partij.film?.zetIndices ?? []);

  const titel =
    [naamWeergave(partij.witVoornaam, partij.witAchternaam), naamWeergave(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  container.innerHTML = `
    <button type="button" class="secondary" data-action="back" style="margin-bottom:0.75rem;">&#8592; Terug naar de partij</button>
    <h2>Filmmodule — ${escapeHtml(titel)}</h2>
    <div class="card">
      <p style="font-size:0.85rem;color:#666;">
        Kies de belangrijkste momenten uit de partij. Op het opdrachtvel staan die als lege
        diagrammen (de speler zoekt ze zelf); op het antwoordvel staan ze ingevuld, met het
        zetnummer en — als je die bij die zet hebt staan — de toelichting.
      </p>
      <label>Aantal diagrammen</label>
      <select data-role="aantal">
        ${[4, 6, 8].map((n) => `<option value="${n}"${n === aantal ? " selected" : ""}>${n}</option>`).join("")}
      </select>
      <p data-role="teller" style="margin-top:0.5rem;font-weight:600;"></p>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.75rem;">
        <div data-role="voorbeeld" style="flex:0 0 auto;"></div>
        <div data-role="zetten" style="flex:1 1 260px;min-width:200px;max-height:60vh;overflow-y:auto;text-align:left;"></div>
      </div>
      <div class="button-row">
        <button type="button" class="primary" data-action="opslaan">Filmmomenten opslaan</button>
      </div>
      <div data-role="opslaan-status" style="font-size:0.85rem;color:#666;margin-top:0.4rem;"></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Downloaden</h3>
      <p style="font-size:0.85rem;color:#666;">
        Werkt pas nadat de filmmomenten hierboven zijn opgeslagen (en past zich aan als je ze
        later wijzigt en opnieuw opslaat).
      </p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="secondary" data-action="docx-opdracht">Opdrachtvel</button>
        <button type="button" class="secondary" data-action="docx-antwoord">Antwoordvel</button>
        <button type="button" class="secondary" data-action="docx-beide">Beide</button>
      </div>
      <div data-role="docx-status" style="font-size:0.85rem;color:#666;margin-top:0.4rem;"></div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const voorbeeldHost = el('[data-role="voorbeeld"]');
  const zettenHost = el('[data-role="zetten"]');
  const teller = el('[data-role="teller"]');

  function toonVoorbeeld(ply) {
    voorbeeldHost.innerHTML = renderDiagramSVG(standen[ply + 1], { size: 240 });
  }

  function tekenZetten() {
    teller.textContent = `${gekozen.size} van ${aantal} gekozen`;
    zettenHost.innerHTML = hoofdlijn
      .map((knoop, ply) => {
        const kleur = plyColor(turn, ply);
        const nummer = kleur === "white" ? `${plyMoveNumber(turn, ply)}. ` : "";
        const vol = gekozen.size >= aantal && !gekozen.has(ply);
        return `
          <label style="display:flex;align-items:center;gap:0.4rem;padding:0.15rem 0;font-weight:normal;${vol ? "color:#aaa;" : ""}">
            <input type="checkbox" data-ply="${ply}" ${gekozen.has(ply) ? "checked" : ""} ${vol ? "disabled" : ""} />
            <span data-toon-ply="${ply}" style="cursor:pointer;">${nummer}${escapeHtml(moveToNotation(knoop.zet))}</span>
          </label>
        `;
      })
      .join("");

    for (const checkbox of zettenHost.querySelectorAll("[data-ply]")) {
      checkbox.addEventListener("change", () => {
        const ply = Number.parseInt(checkbox.dataset.ply, 10);
        if (checkbox.checked) gekozen.add(ply);
        else gekozen.delete(ply);
        tekenZetten();
        toonVoorbeeld(ply);
      });
    }
    for (const span of zettenHost.querySelectorAll("[data-toon-ply]")) {
      span.addEventListener("click", () => toonVoorbeeld(Number.parseInt(span.dataset.toonPly, 10)));
    }
  }

  el('[data-role="aantal"]').addEventListener("change", (e) => {
    aantal = Number.parseInt(e.target.value, 10);
    tekenZetten();
  });

  toonVoorbeeld(gekozen.size ? Math.min(...gekozen) : 0);
  tekenZetten();

  el('[data-action="back"]').addEventListener("click", () => onBack?.());

  const opslaanStatus = el('[data-role="opslaan-status"]');
  el('[data-action="opslaan"]').addEventListener("click", async () => {
    if (gekozen.size !== aantal) {
      opslaanStatus.textContent = `Kies precies ${aantal} momenten (nu ${gekozen.size}) voor je opslaat.`;
      return;
    }
    await savePartij({ ...partij, film: { aantalDiagrammen: aantal, zetIndices: [...gekozen].sort((a, b) => a - b) } });
    opslaanStatus.textContent = "Opgeslagen. Je kunt hieronder downloaden.";
  });

  const docxStatus = el('[data-role="docx-status"]');
  async function exportDocx(mode) {
    const huidige = await getPartij(partijId);
    if (!huidige.film?.zetIndices?.length) {
      docxStatus.textContent = "Sla eerst de filmmomenten hierboven op.";
      return;
    }
    docxStatus.textContent = "Word-bestand wordt gemaakt...";
    try {
      const blob = await buildFilmDocxBlob(huidige, mode);
      downloadBlob(blob, `film-${titel}-${mode}.docx`.replace(/[^\w.\-]+/g, "_"));
      docxStatus.textContent = "Word-bestand gedownload.";
    } catch (err) {
      docxStatus.textContent = "Er ging iets mis: " + err.message;
      throw err;
    }
  }
  el('[data-action="docx-opdracht"]').addEventListener("click", () => exportDocx("opdracht"));
  el('[data-action="docx-antwoord"]').addEventListener("click", () => exportDocx("antwoord"));
  el('[data-action="docx-beide"]').addEventListener("click", () => exportDocx("beide"));
}
