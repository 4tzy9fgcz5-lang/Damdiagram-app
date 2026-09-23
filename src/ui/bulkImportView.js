// Bulk-import, stap 1: een of meer foto's van boekpagina's met meerdere diagrammen erop.
// De foto's worden één voor één ingelezen (diagrammen zoeken, nummer boven elk diagram lezen);
// dit scherm is puur een controle: klopt het aantal gevonden diagrammen per foto en kloppen de
// nummers? Hoeken preciezer afstellen gebeurt straks per diagram, in de vertrouwde hoeken-stap
// (diagramCaptureView.js) — hier alleen verwijderen wat niet hoort en zelf toevoegen wat gemist is.
//
// Geheugen: van een foto wordt alleen tijdens het inlezen de volle resolutie vastgehouden; daarna
// blijft een klein voorbeeldplaatje (voor de kaders) en het bestand zelf over. De volle foto wordt
// pas weer geladen als een diagram van die foto aan de beurt is (zie app.js).

import { loadDrawable, drawableSize } from "./imageInput.js?v=20260923i";
import { detectBulkBoards } from "../recognition/bulkDetect.js?v=20260923i";
import { getList, addListValue } from "../db/lijsten.js?v=20260923i";
import { getAllCategorieen } from "../db/categorieen.js?v=20260923i";
import { createNumberReader, fillMissingNumbers } from "../recognition/numberOcr.js?v=20260923i";
import { splitOplossingenTekst } from "../core/solutionParser.js?v=20260923i";
import { OPLOSSING_OPDRACHT, kopieerNaarKlembord } from "./oplossingOpdracht.js?v=20260923i";
import { getOplossingenTekst, setOplossingenTekst } from "../db/uiSettings.js?v=20260923i";
import { setDefaultDoel } from "./editorView.js?v=20260923i";

const COLORS = ["#d1495b", "#1a5c38", "#3a6ea5", "#e0a800", "#8854d0", "#009688"];
const THUMB_MAX_SIDE = 700;

// Een redelijke standaardplek voor een handmatig toegevoegd diagram. De
// gebruiker plaatst 'm pas echt zodra dát diagram aan de beurt is — daar krijgt
// hij (anders dan een automatisch gevonden diagram) de hele pagina te zien om de
// hoeken vrij naartoe te kunnen slepen, niet een klein uitsnedegebied.
function defaultBoxCorners(fullWidth, fullHeight, index) {
  const size = Math.min(fullWidth, fullHeight) * 0.22;
  const offset = (index % 5) * size * 0.15;
  const cx = fullWidth / 2 + offset;
  const cy = fullHeight / 2 + offset;
  return [
    { x: cx - size / 2, y: cy - size / 2 },
    { x: cx + size / 2, y: cy - size / 2 },
    { x: cx + size / 2, y: cy + size / 2 },
    { x: cx - size / 2, y: cy + size / 2 },
  ];
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function renderBulkImportView(container, { onConfirmed } = {}) {
  container.innerHTML = `
    <h2>Nieuwe stand toevoegen</h2>
    <div class="card" style="margin-bottom:1rem;">
      <label style="margin:0;">Opslaan bij</label>
      <div class="quick-actions" style="margin-top:0.3rem;">
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="radio" name="doel" value="combinatie" checked /> Combinaties
        </label>
        <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
          <input type="radio" name="doel" value="eindspel" /> Eindspelen
        </label>
      </div>
      <p style="font-size:0.85rem;color:#666;margin:0.4rem 0 0;">
        Geldt voor alles wat je hierna op dit scherm toevoegt (foto's, bulk-import of zelf invoeren).
      </p>
    </div>
    <div class="card" data-role="pick">
      <p>Kies één of meer foto's van boekpagina's met meerdere diagrammen erop (selecteer er gerust
        een heleboel tegelijk), of maak een foto. De app zoekt daarna per foto zelf de diagrammen en
        leest het nummer erboven.</p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="gallery">Kies foto's uit galerij</button>
        <button type="button" class="secondary" data-action="camera">Maak foto</button>
      </div>
      <input type="file" accept="image/*" capture="environment" data-role="camera-input" style="display:none" />
      <input type="file" accept="image/*" multiple data-role="gallery-input" style="display:none" />
      <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid #e3e3e3;">
        <span style="font-size:0.9rem;color:#555;">Liever op een andere manier?</span>
        <div class="button-row" style="margin-top:0.4rem;">
          <button type="button" class="secondary" data-go="#/foto">Eén foto van één diagram</button>
          <button type="button" class="secondary" data-go="#/zelf">Zelf een stand invoeren</button>
        </div>
      </div>
    </div>

    <div class="card" data-role="overview" style="display:none;">
      <p>Controleer per foto of alle diagrammen gevonden zijn en of de nummers kloppen. Verwijder wat
        niet hoort; voeg zelf iets toe als er een gemist is. De hoeken van elk diagram stel je zo
        meteen, per diagram, precies af.</p>
      <p data-role="progress" style="font-size:0.9rem;font-weight:600;color:#1a5c38;"></p>
      <p data-role="number-status" style="color:#666;font-size:0.85rem;margin-top:-0.5rem;"></p>
      <div data-role="pages" style="display:flex;flex-direction:column;gap:1rem;"></div>
      <div class="button-row" style="margin-top:0.75rem;">
        <button type="button" class="secondary" data-action="add-photos">+ Meer foto's toevoegen</button>
        <button type="button" class="secondary" data-action="restart">Alles wissen en opnieuw beginnen</button>
      </div>

      <div style="margin-top:1rem;padding:0.75rem;border:1px solid #cfd8cf;border-radius:8px;background:#f6faf6;">
        <strong>Oplossingen erbij (optioneel)</strong>
        <p style="font-size:0.85rem;color:#555;margin:0.35rem 0;">
          Staan de oplossingen op andere pagina's van het boek? Laat Claude die overschrijven: kopieer de
          opdracht, plak hem in een Claude-chat met de foto's van de oplossingenpagina's, en plak het
          antwoord hieronder. De app koppelt elke oplossing aan het diagram met hetzelfde nummer en vult
          hem in zodra je de stand controleert.
        </p>
        <div class="button-row" style="margin-top:0;align-items:center;">
          <button type="button" class="secondary" data-action="copy-prompt">Kopieer opdracht voor Claude</button>
          <span data-role="copy-status" style="font-size:0.85rem;color:#1a5c38;"></span>
        </div>
        <details style="margin:0.4rem 0;font-size:0.8rem;color:#555;">
          <summary>Toon de opdracht</summary>
          <pre style="white-space:pre-wrap;margin:0.3rem 0;" data-role="prompt-text"></pre>
        </details>
        <textarea data-field="oplossingen" rows="5" placeholder="Plak hier het antwoord van Claude (één oplossing per regel, beginnend met het nummer)"></textarea>
        <p data-role="solution-status" style="font-size:0.85rem;margin:0.3rem 0 0;"></p>
        <button type="button" class="secondary" data-action="clear-solutions" style="margin-top:0.4rem;">Wis geplakte tekst</button>
      </div>

      <p style="font-size:0.9rem;color:#555;margin:0.75rem 0 0;">Wat hieronder ingevuld of gekozen wordt, geldt voor <strong>alle</strong> diagrammen
        van deze import (per diagram kun je het straks nog aanpassen).</p>
      <label style="margin-top:0.5rem;">Auteur (leeg = uit de oplossing halen als die daar bij staat)</label>
      <input type="text" data-field="auteur" placeholder="bijv. M. Fabre" />

      <label style="margin-top:0.75rem;">Publicatie</label>
      <input type="text" data-field="publicatie" placeholder="boek, tijdschrift of website" />

      <div data-role="categorieen"></div>

      <label style="margin-top:0.75rem;">Werkwijze</label>
      <label style="display:block;margin:0.2rem 0;font-weight:normal;"><input type="radio" name="werkwijze" value="auto" checked />
        Automatisch (aanbevolen): de app herkent alle diagrammen alvast; jij controleert per diagram alleen de stand</label>
      <label style="display:block;margin:0.2rem 0;font-weight:normal;"><input type="radio" name="werkwijze" value="hoeken" />
        Per diagram eerst de hoeken bekijken (langzamer, meer controle)</label>

      <div class="button-row">
        <button type="button" class="primary" data-action="confirm">Doorgaan</button>
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const pickCard = el('[data-role="pick"]');
  const overviewCard = el('[data-role="overview"]');
  const pagesHost = el('[data-role="pages"]');
  const progress = el('[data-role="progress"]');
  const numberStatus = el('[data-role="number-status"]');
  const confirmBtn = el('[data-action="confirm"]');
  const oplossingenField = el('[data-field="oplossingen"]');
  const solutionStatus = el('[data-role="solution-status"]');
  const galleryInput = el('[data-role="gallery-input"]');
  const cameraInput = el('[data-role="camera-input"]');
  el('[data-role="prompt-text"]').textContent = OPLOSSING_OPDRACHT;
  oplossingenField.value = getOplossingenTekst();
  const categorieenHost = el('[data-role="categorieen"]');

  // pages: { id, file, name, width, height, status: "wacht"|"bezig"|"klaar"|"fout", melding,
  //          base (klein voorbeeldplaatje), thumb (voorbeeld met kaders), scale }
  let pages = [];
  // items: { id, pageId, corners: [{x,y} x4] in VOLLEDIGE-RESOLUTIE coördinaten van de foto, manual,
  //   nummer (tekst, het nummer boven het diagram in het boek),
  //   nummerBron: "" | "gelezen" | "afgeleid" | "zelf" }
  let items = [];
  let nextId = 1;
  let nextPageId = 1;
  // Telt op bij "alles wissen", zodat een inleesronde die nog loopt stopt en niets meer toevoegt.
  let runToken = 0;
  let processing = false;
  // Gekozen speelsysteem/type/... voor alle diagrammen: { [categorie-key]: string[] }
  const selectedCategorieen = {};

  // ---------- combinaties of eindspelen ----------
  // De keuze bovenaan dit scherm geldt voor de hele import: bulk (via
  // onConfirmed), en ook "Eén foto van één diagram"/"Zelf invoeren" hieronder
  // (die navigeren meteen weg, dus die lezen 'm niet uit onConfirmed maar uit
  // setDefaultDoel, dat de editor er hierna zelf vandaan haalt).
  let doel = "combinatie";
  function updateDoelUI() {
    setDefaultDoel(doel);
    // Speelsysteem/Type horen bij combinaties (stap 3 van de eindspelen-
    // uitbreiding geeft eindspelen hun eigen categorie) — tonen ze hier bij
    // Eindspelen is verwarrend, dus dan blijft het rijtje weg.
    categorieenHost.style.display = doel === "eindspel" ? "none" : "";
  }
  updateDoelUI();
  for (const radio of container.querySelectorAll('input[name="doel"]')) {
    radio.addEventListener("change", (e) => {
      if (!e.target.checked) return;
      doel = e.target.value;
      updateDoelUI();
    });
  }

  // ---------- speelsysteem, type (en andere categorieën) ----------
  // Zelfde keuzelijsten als op het invoerscherm (Instellingen -> Database beheert welke categorieën er
  // zijn): kies wat voor alle diagrammen van deze import geldt.
  async function renderCategorieen() {
    const categorieen = await getAllCategorieen();
    categorieenHost.innerHTML = categorieen
      .map((cat) => `<label style="margin-top:0.75rem;">${escapeHtml(cat.label)}</label><div class="tag-list" data-cat="${escapeHtml(cat.key)}"></div>`)
      .join("");
    for (const cat of categorieen) {
      selectedCategorieen[cat.key] ??= [];
      const host = categorieenHost.querySelector(`[data-cat="${cat.key}"]`);
      const draw = async () => {
        const values = await getList(cat.key);
        host.innerHTML = "";
        for (const value of values) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "tag";
          btn.textContent = value;
          if (selectedCategorieen[cat.key].includes(value)) btn.classList.add("selected");
          btn.addEventListener("click", () => {
            const list = selectedCategorieen[cat.key];
            const i = list.indexOf(value);
            if (i >= 0) list.splice(i, 1);
            else list.push(value);
            btn.classList.toggle("selected");
          });
          host.appendChild(btn);
        }
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "tag";
        addBtn.textContent = "+ nieuw";
        addBtn.addEventListener("click", async () => {
          const naam = prompt("Nieuwe waarde:");
          if (!naam || !naam.trim()) return;
          await addListValue(cat.key, naam.trim());
          await draw();
        });
        host.appendChild(addBtn);
      };
      await draw();
    }
  }
  await renderCategorieen();

  container.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.go;
    });
  });

  // ---------- oplossingen ----------
  // Hoeveel van de geplakte oplossingen bij een diagram in deze import horen.
  function updateSolutionStatus() {
    const text = oplossingenField.value;
    if (!text.trim()) {
      solutionStatus.textContent = "";
      return;
    }
    const { perNummer, volgorde, dubbel } = splitOplossingenTekst(text, { verwacht: items.map((it) => it.nummer).filter(Boolean) });
    if (volgorde.length === 0) {
      solutionStatus.style.color = "#b00020";
      solutionStatus.textContent =
        "Er is geen oplossing in de tekst gevonden. Elke oplossing moet op een eigen regel staan, beginnend met het nummer, bijvoorbeeld: 570. 1. 21 - 17 22 x 11 ...";
      return;
    }
    const zonder = items.filter((it) => !(it.nummer && perNummer[it.nummer] !== undefined)).map((it) => it.nummer || "(zonder nummer)");
    const gevonden = items.length - zonder.length;
    solutionStatus.style.color = zonder.length ? "#8a4b00" : "#1a5c38";
    const kort = zonder.length > 12 ? `${zonder.slice(0, 12).join(", ")} en ${zonder.length - 12} andere` : zonder.join(", ");
    solutionStatus.textContent =
      `${volgorde.length} oplossing(en) in de tekst; gevonden voor ${gevonden} van ${items.length} diagrammen.` +
      (zonder.length ? ` Geen oplossing voor: ${kort}.` : "") +
      (dubbel.length ? ` Let op: nummer ${dubbel.join(", ")} staat dubbel in de tekst (de laatste telt).` : "");
  }

  oplossingenField.addEventListener("input", () => {
    setOplossingenTekst(oplossingenField.value);
    updateSolutionStatus();
  });
  el('[data-action="clear-solutions"]').addEventListener("click", () => {
    oplossingenField.value = "";
    setOplossingenTekst("");
    updateSolutionStatus();
  });
  el('[data-action="copy-prompt"]').addEventListener("click", async () => {
    const ok = await kopieerNaarKlembord(OPLOSSING_OPDRACHT);
    const copyStatus = el('[data-role="copy-status"]');
    copyStatus.style.color = ok ? "#1a5c38" : "#b00020";
    copyStatus.textContent = ok
      ? "Gekopieerd. Plak dit in een Claude-chat, voeg de foto's toe en plak het antwoord hieronder."
      : "Kopiëren lukte niet: open “Toon de opdracht” en kopieer de tekst zelf.";
  });

  // ---------- voorbeeldplaatje met kaders ----------
  function redrawPage(page) {
    if (!page.thumb) return;
    const ctx = page.thumb.getContext("2d");
    ctx.clearRect(0, 0, page.thumb.width, page.thumb.height);
    ctx.drawImage(page.base, 0, 0);
    const pageItems = items.filter((it) => it.pageId === page.id);
    pageItems.forEach((item, index) => {
      const color = COLORS[index % COLORS.length];
      const corners = item.corners.map((p) => ({ x: p.x * page.scale, y: p.y * page.scale }));
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, page.thumb.width * 0.004);
      if (item.manual) ctx.setLineDash([page.thumb.width * 0.012, page.thumb.width * 0.008]);
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(page.thumb.width * 0.035)}px sans-serif`;
      ctx.fillText(item.nummer || String(index + 1), corners[0].x + 4, corners[0].y + page.thumb.width * 0.035);
      ctx.restore();
    });
  }

  // ---------- aanwijzingen bij de nummers ----------
  function updateHints() {
    const counts = new Map();
    for (const it of items) if (it.nummer) counts.set(it.nummer, (counts.get(it.nummer) ?? 0) + 1);
    for (const it of items) {
      const hint = container.querySelector(`[data-hint="${it.id}"]`);
      if (!hint) continue;
      if (it.nummer && counts.get(it.nummer) > 1) {
        hint.textContent = "komt dubbel voor";
        hint.style.color = "#b00020";
      } else if (it.nummerBron === "afgeleid") {
        hint.textContent = "afgeleid, controleer";
        hint.style.color = "#8a4b00";
      } else if (!it.nummer && !it.manual) {
        hint.textContent = processing ? "" : "niet gelezen";
        hint.style.color = "#8a4b00";
      } else {
        hint.textContent = "";
      }
    }
    updateSolutionStatus();
  }

  // ---------- overzicht per foto ----------
  function pageStatusText(page) {
    const n = items.filter((it) => it.pageId === page.id).length;
    if (page.status === "wacht") return "wacht op inlezen...";
    if (page.status === "bezig") return page.melding || "wordt ingelezen...";
    if (page.status === "fout") return page.melding || "kon niet worden ingelezen";
    return n > 0
      ? `${n} diagram(men) gevonden — controleer of dit klopt.`
      : "Geen diagrammen automatisch gevonden. Voeg ze zelf toe met “+ Diagram toevoegen”.";
  }

  function updatePageStatus(page) {
    const node = pagesHost.querySelector(`[data-page="${page.id}"] [data-role="page-status"]`);
    if (node) node.textContent = pageStatusText(page);
  }

  function renderPageSection(page) {
    if (!pages.includes(page)) return; // foto is intussen verwijderd (of alles gewist)
    let section = pagesHost.querySelector(`[data-page="${page.id}"]`);
    if (!section) {
      section = document.createElement("section");
      section.dataset.page = String(page.id);
      section.style.cssText = "border:1px solid #ddd;border-radius:8px;padding:0.6rem 0.75rem;";
      pagesHost.appendChild(section);
    }
    const pageItems = items.filter((it) => it.pageId === page.id);
    const index = pages.indexOf(page) + 1;
    section.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
        <strong>Foto ${index} van ${pages.length}: ${escapeHtml(page.name)}</strong>
        <button type="button" class="secondary" data-remove-page="${page.id}" ${page.status === "bezig" ? "disabled" : ""}>Foto verwijderen</button>
      </div>
      <p data-role="page-status" style="color:#666;font-size:0.85rem;margin:0.3rem 0;">${escapeHtml(pageStatusText(page))}</p>
      <div data-role="thumb-host" style="position:relative;display:inline-block;max-width:100%;"></div>
      <div class="button-row" style="margin-top:0.5rem;">
        <button type="button" class="secondary" data-add-diagram="${page.id}" ${page.status !== "klaar" ? "disabled" : ""}>+ Diagram toevoegen</button>
      </div>
      <div data-role="page-list" style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.4rem;"></div>`;

    if (page.thumb) {
      page.thumb.style.cssText = "width:100%;max-width:420px;height:auto;display:block;border-radius:8px;";
      section.querySelector('[data-role="thumb-host"]').appendChild(page.thumb);
      redrawPage(page);
    }

    const listHost = section.querySelector('[data-role="page-list"]');
    pageItems.forEach((item, i) => {
      const color = COLORS[i % COLORS.length];
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:0.5rem;";
      row.innerHTML = `
        <span style="display:inline-block;width:0.9rem;height:0.9rem;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="flex:1;">Diagram ${i + 1}${item.manual ? " (zelf toegevoegd — hoeken zelf plaatsen op de hele pagina)" : ""}</span>
        <label style="margin:0;font-size:0.85rem;color:#666;">Nr.</label>
        <input type="text" inputmode="numeric" data-nummer="${item.id}" value="${escapeHtml(item.nummer)}" placeholder="?" style="width:5rem;margin:0;" />
        <span data-hint="${item.id}" style="font-size:0.8rem;min-width:6.5rem;"></span>
        <button type="button" class="secondary" data-remove="${item.id}">Verwijderen</button>`;
      listHost.appendChild(row);
    });

    section.querySelectorAll("[data-nummer]").forEach((input) => {
      input.addEventListener("input", () => {
        const item = items.find((it) => it.id === Number(input.dataset.nummer));
        if (!item) return;
        item.nummer = input.value.trim();
        item.nummerBron = item.nummer ? "zelf" : "";
        updateHints();
        redrawPage(page);
      });
    });
    section.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        items = items.filter((it) => it.id !== Number(btn.dataset.remove));
        renderPageSection(page);
      });
    });
    section.querySelector("[data-add-diagram]").addEventListener("click", () => {
      items.push({
        id: nextId++,
        pageId: page.id,
        corners: defaultBoxCorners(page.width, page.height, pageItems.length),
        manual: true,
        nummer: "",
        nummerBron: "",
      });
      progress.textContent = "Diagram toegevoegd (gestippeld) — zodra het aan de beurt is, sleep je de hoeken op de hele pagina naar de juiste plek.";
      renderPageSection(page);
    });
    section.querySelector("[data-remove-page]").addEventListener("click", () => removePage(page));
    updateHints();
  }

  function renumberHeadings() {
    pages.forEach((page, i) => {
      const strong = pagesHost.querySelector(`[data-page="${page.id}"] strong`);
      if (strong) strong.textContent = `Foto ${i + 1} van ${pages.length}: ${page.name}`;
    });
  }

  function removePage(page) {
    if (page.status === "bezig") return;
    pages = pages.filter((p) => p !== page);
    items = items.filter((it) => it.pageId !== page.id);
    pagesHost.querySelector(`[data-page="${page.id}"]`)?.remove();
    if (pages.length === 0) {
      showPick();
      return;
    }
    renumberHeadings();
    updateHints();
    updateConfirm();
  }

  function updateConfirm() {
    confirmBtn.disabled = processing;
    confirmBtn.textContent = processing ? "Even geduld: foto's worden ingelezen..." : "Doorgaan";
  }

  function showPick() {
    runToken++;
    processing = false;
    pages = [];
    items = [];
    pagesHost.innerHTML = "";
    progress.textContent = "";
    numberStatus.textContent = "";
    pickCard.style.display = "block";
    overviewCard.style.display = "none";
    galleryInput.value = "";
    cameraInput.value = "";
    updateConfirm();
  }

  // ---------- foto's inlezen ----------
  function makeThumb(page, drawable) {
    const { width, height } = drawableSize(drawable);
    page.width = width;
    page.height = height;
    page.scale = Math.min(1, THUMB_MAX_SIDE / Math.max(width, height));
    page.base = document.createElement("canvas");
    page.base.width = Math.round(width * page.scale);
    page.base.height = Math.round(height * page.scale);
    page.base.getContext("2d").drawImage(drawable, 0, 0, page.base.width, page.base.height);
    page.thumb = document.createElement("canvas");
    page.thumb.width = page.base.width;
    page.thumb.height = page.base.height;
  }

  // Alle nummers nog eens tegen elkaar leggen, over alle foto's heen (foto voor foto, per foto rij voor
  // rij): een nummer dat niet gelezen is of niet in de doorlopende reeks past, wordt afgeleid.
  function applyGlobalFill() {
    const flat = [];
    pages.forEach((page, pi) => {
      for (const it of items.filter((x) => x.pageId === page.id)) {
        const xs = it.corners.map((p) => p.x);
        const ys = it.corners.map((p) => p.y);
        const n = it.nummer ? Number(it.nummer) : null;
        flat.push({
          item: it,
          nummer: Number.isFinite(n) ? n : null,
          cx: pi * 1e6 + (Math.min(...xs) + Math.max(...xs)) / 2,
          cy: (Math.min(...ys) + Math.max(...ys)) / 2,
          breedte: Math.max(...xs) - Math.min(...xs),
        });
      }
    });
    const filled = fillMissingNumbers(flat.map(({ nummer, cx, cy, breedte }) => ({ nummer, cx, cy, breedte })));
    // Wat over de foto's heen niet te bepalen was (bv. het laatste diagram van een foto: het nummer
    // daarna is van de volgende foto), nog één keer per foto apart proberen.
    pages.forEach((page, pi) => {
      const idx = flat.map((f, i) => (f.item.pageId === page.id ? i : -1)).filter((i) => i >= 0);
      if (!idx.some((i) => filled[i].nummer == null)) return;
      const own = fillMissingNumbers(idx.map((i) => ({ nummer: flat[i].nummer, cx: flat[i].cx, cy: flat[i].cy, breedte: flat[i].breedte })));
      idx.forEach((i, k) => {
        if (filled[i].nummer == null && own[k].nummer != null) filled[i] = own[k];
      });
    });
    flat.forEach((f, i) => {
      const it = f.item;
      if (it.nummerBron === "zelf") return;
      const res = filled[i];
      it.nummer = res.nummer != null ? String(res.nummer) : "";
      it.nummerBron = res.nummer == null ? "" : res.afgeleid ? "afgeleid" : "gelezen";
    });
    for (const it of items) {
      const input = container.querySelector(`[data-nummer="${it.id}"]`);
      if (input && document.activeElement !== input) input.value = it.nummer;
    }
    const auto = items.filter((it) => !it.manual);
    const gelezen = auto.filter((it) => it.nummerBron === "gelezen").length;
    const afgeleid = auto.filter((it) => it.nummerBron === "afgeleid").length;
    numberStatus.textContent =
      `Nummers gelezen: ${gelezen} van ${auto.length}` + (afgeleid ? `, ${afgeleid} afgeleid uit de reeks` : "") + ". Controleer ze en vul aan wat ontbreekt.";
    for (const page of pages) redrawPage(page);
    updateHints();
  }

  // Leest alle nog wachtende foto's achter elkaar in. Loopt op de achtergrond; je kunt ondertussen
  // al controleren wat klaar is.
  async function processQueue() {
    if (processing) return;
    processing = true;
    updateConfirm();
    const token = runToken;
    let reader = null;
    let readerError = "";
    try {
      for (;;) {
        const page = pages.find((p) => p.status === "wacht");
        if (!page) break;
        page.status = "bezig";
        const position = pages.indexOf(page) + 1;
        const progressText = (detail) => {
          progress.textContent = `Foto ${position} van ${pages.length} wordt ingelezen${detail ? `: ${detail}` : "..."}`;
          page.melding = detail ? `${detail}...` : "wordt ingelezen...";
          updatePageStatus(page);
        };
        renderPageSection(page);
        progressText("foto laden");
        let drawable = null;
        try {
          drawable = await loadDrawable(page.file);
        } catch (err) {
          if (token !== runToken) return;
          page.status = "fout";
          page.melding = "Kon deze foto niet openen: " + err.message;
          renderPageSection(page);
          continue;
        }
        if (token !== runToken) {
          drawable.close?.();
          return;
        }
        try {
          makeThumb(page, drawable);
          progressText("diagrammen zoeken");
          await tick();
          let detected = [];
          try {
            detected = detectBulkBoards(drawable);
          } catch {
            detected = [];
          }
          if (token !== runToken) return;
          const mine = detected.map((corners) => ({ id: nextId++, pageId: page.id, corners, manual: false, nummer: "", nummerBron: "" }));
          items.push(...mine);
          renderPageSection(page);

          if (mine.length > 0 && !readerError) {
            try {
              progressText("tekstlezer starten");
              reader ??= await createNumberReader();
              const nums = await reader.read(
                drawable,
                mine.map((it) => it.corners),
                { onProgress: (i, n) => i < n && token === runToken && progressText(`nummers lezen (${i + 1} van ${n})`) }
              );
              if (token !== runToken) return;
              mine.forEach((it, i) => {
                if (nums[i] != null) {
                  it.nummer = String(nums[i]);
                  it.nummerBron = "gelezen";
                }
              });
            } catch (err) {
              if (token !== runToken) return;
              readerError = err.message;
              reader = null;
            }
          }
          page.status = "klaar";
          page.melding = "";
          renderPageSection(page);
        } finally {
          drawable.close?.();
        }
      }
      if (token !== runToken) return;
      progress.textContent = `Klaar: ${items.length} diagram(men) op ${pages.length} foto('s) gevonden.`;
      if (readerError) {
        numberStatus.textContent = `De nummers konden niet automatisch gelezen worden (${readerError}). Vul ze zelf in, of laat ze leeg.`;
        updateHints();
      } else {
        applyGlobalFill();
      }
    } finally {
      if (reader) await reader.close().catch(() => {});
      if (token === runToken) {
        processing = false;
        updateConfirm();
        updateHints();
        // foto's die tijdens het inlezen zijn toegevoegd
        if (pages.some((p) => p.status === "wacht")) processQueue();
      }
    }
  }

  function addFiles(fileList, { sortByName } = {}) {
    let files = [...fileList].filter((f) => f && (f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png)$/i.test(f.name)));
    if (files.length === 0) return;
    // De namen lopen bij foto's van een telefoon op in de volgorde van maken (IMG_0664, IMG_0665, ...):
    // zo staan de pagina's in boekvolgorde, ook als de galerij ze door elkaar aanbiedt.
    if (sortByName) files = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    pickCard.style.display = "none";
    overviewCard.style.display = "block";
    for (const file of files) {
      const page = { id: nextPageId++, file, name: file.name || "foto", status: "wacht", melding: "", width: 0, height: 0 };
      pages.push(page);
      renderPageSection(page);
    }
    renumberHeadings();
    processQueue();
  }

  galleryInput.addEventListener("change", (e) => {
    addFiles(e.target.files, { sortByName: true });
    e.target.value = "";
  });
  cameraInput.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });
  el('[data-action="gallery"]').addEventListener("click", () => galleryInput.click());
  el('[data-action="camera"]').addEventListener("click", () => cameraInput.click());
  el('[data-action="add-photos"]').addEventListener("click", () => galleryInput.click());
  el('[data-action="restart"]').addEventListener("click", () => {
    if (items.length > 3 && !confirm("Alle foto's en nummers hier worden gewist. Doorgaan?")) return;
    showPick();
  });

  confirmBtn.addEventListener("click", () => {
    if (processing) return;
    if (items.length === 0) {
      progress.textContent = "Voeg eerst minstens één diagram toe.";
      return;
    }
    const oplossingen = splitOplossingenTekst(oplossingenField.value, { verwacht: items.map((it) => it.nummer).filter(Boolean) });
    // Alleen foto's met diagrammen doen mee; `page` is de plek in die lijst.
    const usedPages = pages.filter((p) => items.some((it) => it.pageId === p.id));
    const pageIndex = new Map(usedPages.map((p, i) => [p.id, i]));
    const diagrams = [];
    for (const page of usedPages) {
      for (const item of items.filter((it) => it.pageId === page.id)) {
        diagrams.push({
          page: pageIndex.get(page.id),
          corners: item.corners,
          manual: item.manual,
          nummer: item.nummer,
          oplossingTekst: (item.nummer && oplossingen.perNummer[item.nummer]) || "",
        });
      }
    }
    onConfirmed?.({
      auto: container.querySelector('input[name="werkwijze"]:checked')?.value !== "hoeken",
      pages: usedPages.map((p) => ({ file: p.file, name: p.name })),
      diagrams,
      auteur: el('[data-field="auteur"]').value.trim(),
      publicatie: el('[data-field="publicatie"]').value.trim(),
      categorieen: Object.fromEntries(Object.entries(selectedCategorieen).filter(([, v]) => v.length > 0).map(([k, v]) => [k, [...v]])),
      doel,
    });
  });

  updateConfirm();
}
