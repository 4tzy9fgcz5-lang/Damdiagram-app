import { createStartBoard } from "../core/board.js?v=20260925b";
import { parseFen } from "../core/fen.js?v=20260925b";
import { applyMove, plyColor, plyMoveNumber, moveToNotation } from "../core/draughtsMoves.js?v=20260925b";
import { hoofdlijnKnopen } from "../core/zettenboom.js?v=20260925b";
import { renderDiagramSVG } from "../diagram/render.js?v=20260925b";
import { naamWeergave } from "../core/namen.js?v=20260925b";
import { getPartij, savePartij } from "../db/partijen.js?v=20260925b";
import { buildFilmDocxBlob } from "../export/filmDocx.js?v=20260925b";
import { downloadBlob } from "../export/docx.js?v=20260925b";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fase 2, stap 5 (uitbreiding); herzien 2026-09-24 (Jans melding): de filmmomenten kiezen ging
// eerst via een lijst met elke zet op zijn eigen rij (aanvinken), lastig te overzien in een lange
// partij. Nu: bord + navigatieknoppen zoals de gewone partij-viewer, met de notatie ernaast als
// doorlopende, klikbare tekst — klikken op een zet springt daar meteen naartoe (net als
// zettenboomPlayer.js) EN schakelt 'm aan/uit als filmmoment (een geselecteerde zet krijgt een
// stip ervoor). Navigeren met de knoppen verandert niets aan de selectie.
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
  // Welke stand het bord nu toont: 0 = beginstand (vóór zet 1), k = na zet k (1-based), dus
  // hoofdlijn[k-1] is de laatst gespeelde zet. Begint bij de eerst gekozen zet als die er al is
  // (bewerken van een bestaande filmopdracht), anders bij het begin.
  let huidigStandIndex = gekozen.size ? Math.min(...gekozen) + 1 : 0;

  const titel =
    [naamWeergave(partij.witVoornaam, partij.witAchternaam), naamWeergave(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  container.innerHTML = `
    <button type="button" class="secondary" data-action="back" style="margin-bottom:0.75rem;">&#8592; Terug naar de partij</button>
    <h2>Filmmodule — ${escapeHtml(titel)}</h2>
    <div class="card">
      <p style="font-size:0.85rem;color:#666;">
        Navigeer met de knoppen (of klik in de notatie) door de partij. Klik op een zet om die
        aan of uit te zetten als filmmoment — een gekozen zet krijgt een stip ervoor. Op het
        opdrachtvel staan die momenten als lege diagrammen (de speler zoekt ze zelf); op het
        antwoordvel staan ze ingevuld, met het zetnummer en — als je die bij die zet hebt staan —
        de toelichting.
      </p>
      <label>Aantal diagrammen</label>
      <select data-role="aantal">
        ${[4, 6, 8].map((n) => `<option value="${n}"${n === aantal ? " selected" : ""}>${n}</option>`).join("")}
      </select>
      <p data-role="teller" style="margin-top:0.5rem;font-weight:600;"></p>
      <div class="boom-layout">
        <div class="boom-board-col">
          <div data-role="board"></div>
          <div class="solution-nav">
            <button type="button" class="solution-nav-btn" data-action="first" aria-label="Eerste zet">&#9198;</button>
            <button type="button" class="solution-nav-btn" data-action="prev" aria-label="Vorige zet">&#9664;&#9664;</button>
            <button type="button" class="solution-nav-btn" data-action="next" aria-label="Volgende zet">&#9654;&#9654;</button>
            <button type="button" class="solution-nav-btn" data-action="last" aria-label="Laatste zet">&#9197;</button>
          </div>
        </div>
        <div class="boom-notation-col">
          <div data-role="notation" class="solution-notation-text"></div>
        </div>
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
  const boardHost = el('[data-role="board"]');
  const notationHost = el('[data-role="notation"]');
  const teller = el('[data-role="teller"]');
  const firstBtn = el('[data-action="first"]');
  const prevBtn = el('[data-action="prev"]');
  const nextBtn = el('[data-action="next"]');
  const lastBtn = el('[data-action="last"]');

  function ga(nieuweIndex) {
    huidigStandIndex = Math.max(0, Math.min(hoofdlijn.length, nieuweIndex));
    render();
  }

  function toggleSelectie(ply) {
    if (gekozen.has(ply)) {
      gekozen.delete(ply);
    } else if (gekozen.size < aantal) {
      gekozen.add(ply);
    } else {
      teller.textContent = `Al ${aantal} gekozen — klik een gekozen zet aan om die eerst te laten vervallen.`;
      return;
    }
    render();
  }

  function render() {
    boardHost.innerHTML = renderDiagramSVG(standen[huidigStandIndex], { size: 320 });

    teller.textContent = `${gekozen.size} van ${aantal} gekozen`;
    notationHost.innerHTML = hoofdlijn
      .map((knoop, ply) => {
        const kleur = plyColor(turn, ply);
        const nummer = kleur === "white" ? `${plyMoveNumber(turn, ply)}. ` : "";
        const huidig = ply === huidigStandIndex - 1;
        const stip = gekozen.has(ply) ? "&#9679; " : "";
        return `${nummer}<span class="solution-ply${huidig ? " current" : ""}" data-ply="${ply}">${stip}${escapeHtml(moveToNotation(knoop.zet))}</span>`;
      })
      .join(" ");
    for (const span of notationHost.querySelectorAll("[data-ply]")) {
      span.addEventListener("click", () => {
        const ply = Number.parseInt(span.dataset.ply, 10);
        ga(ply + 1);
        toggleSelectie(ply);
      });
    }

    firstBtn.disabled = huidigStandIndex === 0;
    prevBtn.disabled = huidigStandIndex === 0;
    nextBtn.disabled = huidigStandIndex === hoofdlijn.length;
    lastBtn.disabled = huidigStandIndex === hoofdlijn.length;
  }

  firstBtn.addEventListener("click", () => ga(0));
  prevBtn.addEventListener("click", () => ga(huidigStandIndex - 1));
  nextBtn.addEventListener("click", () => ga(huidigStandIndex + 1));
  lastBtn.addEventListener("click", () => ga(hoofdlijn.length));

  el('[data-role="aantal"]').addEventListener("change", (e) => {
    aantal = Number.parseInt(e.target.value, 10);
    render();
  });

  render();

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
