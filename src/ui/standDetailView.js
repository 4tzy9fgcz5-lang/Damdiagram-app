import { parseFen } from "../core/fen.js?v=20260921ap";
import { getStand, saveStand, deleteStand } from "../db/standen.js?v=20260921ap";
import { getAllCategorieen } from "../db/categorieen.js?v=20260921ap";
import { createSolutionPlayer } from "./solutionPlayer.js?v=20260921ap";
import { getVerbergOplossing } from "../db/uiSettings.js?v=20260921ap";
import { renderDiagramSVG } from "../diagram/render.js?v=20260921ap";
import { svgToPngDataUrl } from "../export/rasterize.js?v=20260921ap";
import { downloadBlob } from "../export/docx.js?v=20260921ap";

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Rijen voor de infotabel onder de oplossing — alleen wat er daadwerkelijk is
// ingevuld, in een vaste volgorde: eerst elke filtercategorie die iets heeft
// staan (Speelsysteem, Type, en wat er verder via Instellingen -> Database is
// toegevoegd), dan auteur/publicatie. Moeilijkheidsgraad staat er los van (zie
// renderMoeilijkheidStars): die rij is altijd zichtbaar, ook zonder waarde,
// en is aanklikbaar.
async function metaRows(stand) {
  const rows = [];
  for (const cat of await getAllCategorieen()) {
    const waarden = stand.categorieen?.[cat.key] ?? [];
    if (waarden.length) rows.push([escapeHtml(cat.label), escapeHtml(waarden.join(", "))]);
  }
  if (stand.auteur || stand.jaartal) {
    const tekst = [stand.auteur, stand.jaartal ? `(${stand.jaartal})` : ""].filter(Boolean).join(" ");
    rows.push(["Auteur", escapeHtml(tekst)]);
  }
  if (stand.publicatie) rows.push(["Publicatie", escapeHtml(stand.publicatie)]);
  if (stand.nummer) rows.push(["Nummer", escapeHtml(stand.nummer)]);
  return rows;
}

// Focus-weergave van een opgeslagen stand: opgave, bord, oplossing, auteur. Geen
// invulvelden — bewerken gaat via de knop onderaan naar de gewone invoerpagina.
export async function renderStandDetailView(
  container,
  { standId, onEdit, onDeleted, onBack, hasNav = false, onPrev, onNext } = {}
) {
  const stand = await getStand(standId);
  if (!stand) {
    container.innerHTML = `<p>Deze stand bestaat niet (meer).</p>`;
    return;
  }

  const { board, turn } = parseFen(stand.fen);
  const basisOpgave = stand.opdracht?.trim() || (turn === "white" ? "Wit speelt en wint" : "Zwart speelt en wint");
  // Een speciaal speltype (forcing, lokzet, ...) komt vooraan te staan, zodat in
  // één oogopslag duidelijk is om wat voor soort opgave het gaat.
  const types = stand.categorieen?.type ?? [];
  const typePrefix = types.length ? types.map(capitalize).join(", ") : "";
  const opgave = typePrefix ? `${typePrefix} - ${basisOpgave}` : basisOpgave;

  const rows = await metaRows(stand);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
      <button type="button" class="secondary" data-action="back">&#8592; Terug naar overzicht</button>
      ${
        hasNav
          ? `<div class="button-row" style="margin:0;">
               <button type="button" class="secondary" data-action="prev">&#8592; Vorige</button>
               <button type="button" class="secondary" data-action="next">Volgende &#8594;</button>
             </div>`
          : ""
      }
    </div>
    <h2>${escapeHtml(opgave)}</h2>
    <div class="card" style="text-align:center;">
      <div data-role="player"></div>
      <div data-role="legacyOplossing"></div>
      <table class="stand-detail-tabel">
        <tr><th>Moeilijkheidsgraad</th><td><span class="stars" data-role="moeilijkheidStars"></span></td></tr>
        ${rows.map(([label, waarde]) => `<tr><th>${label}</th><td>${waarde}</td></tr>`).join("")}
      </table>
      <div class="button-row" style="justify-content:center;">
        <button type="button" class="secondary" data-action="png">PNG</button>
        <button type="button" class="secondary" data-action="edit">Bewerken</button>
        <button type="button" class="secondary" data-action="delete">Verwijderen</button>
      </div>
    </div>
  `;

  const playerHost = container.querySelector('[data-role="player"]');
  createSolutionPlayer(playerHost, {
    board,
    zetten: stand.zetten ?? [],
    zijvarianten: stand.zijvarianten ?? [],
    turn,
    startHidden: getVerbergOplossing(),
    onSolutionChange: async ({ zetten: nieuweZetten, zijvarianten: nieuweZijvarianten }) => {
      stand.zetten = nieuweZetten;
      stand.zijvarianten = nieuweZijvarianten;
      await saveStand(stand);
    },
  });

  // Aanklikbare sterren, ook zonder al gegeven moeilijkheidsgraad — zo hoef je niet
  // los naar "Bewerken" om standen te kunnen doorlopen en beoordelen. Nogmaals
  // klikken op de huidige waarde wist 'm weer, net als op het invoerscherm.
  const starsHost = container.querySelector('[data-role="moeilijkheidStars"]');
  function renderMoeilijkheidStars() {
    starsHost.innerHTML = [1, 2, 3, 4, 5]
      .map((i) => `<span class="star${i <= (stand.moeilijkheid ?? 0) ? " filled" : ""}" data-star="${i}">★</span>`)
      .join("");
    for (const el of starsHost.querySelectorAll("[data-star]")) {
      el.addEventListener("click", async () => {
        const waarde = Number.parseInt(el.dataset.star, 10);
        stand.moeilijkheid = stand.moeilijkheid === waarde ? null : waarde;
        await saveStand(stand);
        renderMoeilijkheidStars();
      });
    }
  }
  renderMoeilijkheidStars();

  // Een oude, vrij getypte oplossingstekst heeft geen eigen af-te-spelen zetten,
  // dus valt buiten het verbergen/tonen van de speler hierboven — hier apart
  // hetzelfde gedrag, zodat de instelling ook voor oudere standen werkt.
  const legacyHost = container.querySelector('[data-role="legacyOplossing"]');
  const heeftZetten = stand.zetten && stand.zetten.length > 0;
  if (!heeftZetten && stand.oplossing) {
    if (getVerbergOplossing()) {
      legacyHost.innerHTML = `<p><button type="button" class="secondary" data-action="reveal-legacy">Oplossing tonen</button></p>`;
      legacyHost.querySelector('[data-action="reveal-legacy"]').addEventListener("click", () => {
        legacyHost.innerHTML = `<p style="white-space:pre-wrap;text-align:left;">${escapeHtml(stand.oplossing)}</p>`;
      });
    } else {
      legacyHost.innerHTML = `<p style="white-space:pre-wrap;text-align:left;">${escapeHtml(stand.oplossing)}</p>`;
    }
  }

  container.querySelector('[data-action="back"]').addEventListener("click", () => onBack?.());
  if (hasNav) {
    const prevBtn = container.querySelector('[data-action="prev"]');
    const nextBtn = container.querySelector('[data-action="next"]');
    prevBtn.disabled = !onPrev;
    nextBtn.disabled = !onNext;
    prevBtn.addEventListener("click", () => onPrev?.());
    nextBtn.addEventListener("click", () => onNext?.());
  }
  container.querySelector('[data-action="png"]').addEventListener("click", async () => {
    const svg = renderDiagramSVG(board, { size: 900 });
    const { blob } = await svgToPngDataUrl(svg, 900);
    downloadBlob(blob, `damstand-${stand.id.slice(0, 8)}.png`);
  });
  container.querySelector('[data-action="edit"]').addEventListener("click", () => onEdit?.(stand.id));
  container.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm("Deze stand verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    await deleteStand(stand.id);
    onDeleted?.();
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
