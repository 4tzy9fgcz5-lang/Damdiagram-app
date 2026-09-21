// Bulk-import, stap 1: een foto van een hele boekpagina met meerdere diagrammen
// erop. Dit scherm is puur een controle: klopt het aantal gevonden diagrammen?
// Hoeken preciezer afstellen gebeurt straks per diagram, in de vertrouwde
// hoeken-stap (diagramCaptureView.js) — hier alleen verwijderen wat niet hoort en
// zelf toevoegen wat gemist is.

import { loadDrawable, drawableSize, WORKING_MAX_SIDE } from "./imageInput.js?v=20260921as";
import { detectBulkBoards } from "../recognition/bulkDetect.js?v=20260921as";
import { getList, addListValue } from "../db/lijsten.js?v=20260921as";
import { readDiagramNumbers, fillMissingNumbers } from "../recognition/numberOcr.js?v=20260921as";
import { splitOplossingenTekst } from "../core/solutionParser.js?v=20260921as";
import { OPLOSSING_OPDRACHT, kopieerNaarKlembord } from "./oplossingOpdracht.js?v=20260921as";
import { getOplossingenTekst, setOplossingenTekst } from "../db/uiSettings.js?v=20260921as";

const COLORS = ["#d1495b", "#1a5c38", "#3a6ea5", "#e0a800", "#8854d0", "#009688"];

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

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderBulkImportView(container, { onConfirmed } = {}) {
  container.innerHTML = `
    <h2>Bulk-import: pagina met meerdere diagrammen</h2>
    <div class="card" data-role="pick">
      <p>Maak een foto van een hele boekpagina met meerdere diagrammen erop, of kies
        een bestaande foto. De app zoekt daarna zelf hoeveel diagrammen erop staan.</p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="camera">Maak foto</button>
        <button type="button" class="secondary" data-action="gallery">Kies uit galerij</button>
      </div>
      <input type="file" accept="image/*" capture="environment" data-role="camera-input" style="display:none" />
      <input type="file" accept="image/*" data-role="gallery-input" style="display:none" />
    </div>

    <div class="card" data-role="overview" style="display:none;">
      <p>Controleer of alle diagrammen op de foto gevonden zijn. Verwijder wat niet
        hoort; voeg zelf iets toe als er een gemist is. De hoeken van elk diagram
        stel je zo meteen, per diagram, precies af.</p>
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
      <p data-role="number-status" style="color:#666;font-size:0.85rem;margin-top:-0.5rem;"></p>
      <div style="position:relative;display:inline-block;max-width:100%;">
        <canvas data-role="canvas" style="width:100%;max-width:620px;height:auto;display:block;border-radius:8px;"></canvas>
      </div>
      <div class="button-row" style="margin-top:0.75rem;">
        <button type="button" class="secondary" data-action="add">+ Diagram toevoegen</button>
        <button type="button" class="secondary" data-action="restart">Andere foto</button>
      </div>
      <div data-role="list" style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.4rem;"></div>

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

      <label style="margin-top:0.75rem;">Auteur (leeg = niet invullen) — geldt voor alle diagrammen op deze pagina</label>
      <input type="text" data-field="auteur" placeholder="bijv. M. Fabre" />

      <label style="margin-top:0.75rem;">Boekstijl (voor training van de fotoherkenning) — geldt voor alle diagrammen op deze pagina</label>
      <div class="tag-list" data-role="boekstijl"></div>

      <div class="button-row">
        <button type="button" class="primary" data-action="confirm">Doorgaan</button>
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const pickCard = el('[data-role="pick"]');
  const overviewCard = el('[data-role="overview"]');
  const canvas = el('[data-role="canvas"]');
  const ctx = canvas.getContext("2d");
  const status = el('[data-role="status"]');
  const numberStatus = el('[data-role="number-status"]');
  const confirmBtn = el('[data-action="confirm"]');
  const oplossingenField = el('[data-field="oplossingen"]');
  const solutionStatus = el('[data-role="solution-status"]');
  el('[data-role="prompt-text"]').textContent = OPLOSSING_OPDRACHT;
  oplossingenField.value = getOplossingenTekst();
  const list = el('[data-role="list"]');
  const boekstijlHost = el('[data-role="boekstijl"]');

  let drawable = null;
  let scale = 1;
  // { id, corners: [{x,y} x4] in VOLLEDIGE-RESOLUTIE coördinaten van drawable, manual,
  //   nummer (tekst, het nummer boven het diagram in het boek), nummerBron: "" | "gelezen" | "afgeleid" | "zelf" }
  let items = [];
  // Telt mee bij elke nieuwe foto, zodat een nummerlezing van een vorige foto niets meer overschrijft.
  let readToken = 0;
  let numbersBusy = false;
  let nextId = 1;
  let selectedBoekstijl = "";

  // Zelfde patroon als de boekstijl-kiezer in editorView.js: één keuze, geldt nu
  // voor de hele pagina in plaats van per stand, zodat je dit niet per diagram
  // hoeft te herhalen.
  async function renderBoekstijlPicker() {
    const values = await getList("boekstijl");
    boekstijlHost.innerHTML = "";
    for (const value of values) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = value;
      if (selectedBoekstijl === value) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        selectedBoekstijl = selectedBoekstijl === value ? "" : value;
        renderBoekstijlPicker();
      });
      boekstijlHost.appendChild(btn);
    }
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tag";
    addBtn.textContent = "+ nieuw";
    addBtn.addEventListener("click", async () => {
      const naam = prompt("Uit welk boek of tijdschrift komen deze diagrammen?");
      if (!naam || !naam.trim()) return;
      await addListValue("boekstijl", naam.trim());
      selectedBoekstijl = naam.trim();
      renderBoekstijlPicker();
    });
    boekstijlHost.appendChild(addBtn);
  }
  await renderBoekstijlPicker();

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

    items.forEach((item, index) => {
      const color = COLORS[index % COLORS.length];
      const displayCorners = item.corners.map((p) => ({ x: p.x * scale, y: p.y * scale }));
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, canvas.width * 0.004);
      if (item.manual) ctx.setLineDash([canvas.width * 0.012, canvas.width * 0.008]);
      ctx.beginPath();
      displayCorners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();

      const label = displayCorners[0];
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(canvas.width * 0.03)}px sans-serif`;
      ctx.fillText(item.nummer || String(index + 1), label.x + 4, label.y + canvas.width * 0.03);
      ctx.restore();
    });
  }

  // Hoeveel van de geplakte oplossingen bij een diagram van deze pagina horen.
  function updateSolutionStatus() {
    const text = oplossingenField.value;
    if (!text.trim()) {
      solutionStatus.textContent = "";
      return;
    }
    const { perNummer, volgorde, dubbel } = splitOplossingenTekst(text);
    if (volgorde.length === 0) {
      solutionStatus.style.color = "#b00020";
      solutionStatus.textContent =
        "Er is geen oplossing in de tekst gevonden. Elke oplossing moet op een eigen regel staan, beginnend met het nummer, bijvoorbeeld: 570. 1. 21 - 17 22 x 11 ...";
      return;
    }
    const zonder = items.filter((it) => !(it.nummer && perNummer[it.nummer] !== undefined)).map((it) => it.nummer || "(zonder nummer)");
    const gevonden = items.length - zonder.length;
    solutionStatus.style.color = zonder.length ? "#8a4b00" : "#1a5c38";
    solutionStatus.textContent =
      `${volgorde.length} oplossing(en) in de tekst; gevonden voor ${gevonden} van ${items.length} diagrammen.` +
      (zonder.length ? ` Geen oplossing voor: ${zonder.join(", ")}.` : "") +
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

  // Zet achter elk nummer een korte aanwijzing: afgeleid uit de reeks, of dubbel gebruikt.
  function updateHints() {
    const counts = new Map();
    for (const it of items) if (it.nummer) counts.set(it.nummer, (counts.get(it.nummer) ?? 0) + 1);
    for (const it of items) {
      const hint = list.querySelector(`[data-hint="${it.id}"]`);
      if (!hint) continue;
      if (it.nummer && counts.get(it.nummer) > 1) {
        hint.textContent = "komt dubbel voor";
        hint.style.color = "#b00020";
      } else if (it.nummerBron === "afgeleid") {
        hint.textContent = "afgeleid, controleer";
        hint.style.color = "#8a4b00";
      } else if (!it.nummer && !it.manual) {
        hint.textContent = numbersBusy ? "" : "niet gelezen";
        hint.style.color = "#8a4b00";
      } else {
        hint.textContent = "";
      }
    }
    updateSolutionStatus();
  }

  // Het nummer boven elk (automatisch gevonden) diagram lezen. Duurt even (de tekstlezer moet
  // eerst geladen worden) en loopt daarom op de achtergrond: je kunt ondertussen al controleren.
  async function readNumbers() {
    const auto = items.filter((it) => !it.manual);
    if (auto.length === 0) return;
    const token = ++readToken;
    numbersBusy = true;
    confirmBtn.disabled = true;
    numberStatus.textContent = "Nummers boven de diagrammen lezen...";
    updateHints();
    try {
      const nums = await readDiagramNumbers(
        drawable,
        auto.map((it) => it.corners),
        {
          onProgress: (i, n) => {
            if (token === readToken && i < n) numberStatus.textContent = `Nummers boven de diagrammen lezen... (${i + 1} van ${n})`;
          },
        }
      );
      if (token !== readToken) return;
      const filled = fillMissingNumbers(
        auto.map((it, i) => {
          const xs = it.corners.map((p) => p.x);
          const ys = it.corners.map((p) => p.y);
          return { nummer: nums[i], cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, breedte: Math.max(...xs) - Math.min(...xs) };
        })
      );
      auto.forEach((it, i) => {
        if (it.nummerBron === "zelf") return; // zelf ingevuld terwijl de lezer bezig was
        const f = filled[i];
        it.nummer = f.nummer != null ? String(f.nummer) : "";
        it.nummerBron = f.nummer == null ? "" : f.afgeleid ? "afgeleid" : "gelezen";
      });
      const gelezen = auto.filter((it) => it.nummerBron === "gelezen").length;
      const afgeleid = auto.filter((it) => it.nummerBron === "afgeleid").length;
      numberStatus.textContent =
        `Nummers gelezen: ${gelezen} van ${auto.length}` +
        (afgeleid ? `, ${afgeleid} afgeleid uit de reeks` : "") +
        ". Controleer ze en vul aan wat ontbreekt.";
    } catch (err) {
      if (token !== readToken) return;
      numberStatus.textContent = `De nummers konden niet automatisch gelezen worden (${err.message}). Vul ze zelf in, of laat ze leeg.`;
    } finally {
      if (token === readToken) {
        numbersBusy = false;
        confirmBtn.disabled = false;
        for (const it of items) {
          const input = list.querySelector(`[data-nummer="${it.id}"]`);
          if (input && document.activeElement !== input) input.value = it.nummer;
        }
        updateHints();
        redraw();
      }
    }
  }

  function renderList() {
    list.innerHTML = "";
    if (items.length === 0) {
      list.innerHTML = '<p style="color:#666;font-size:0.85rem;">Geen diagrammen (meer) — voeg er zo nodig zelf een toe.</p>';
      return;
    }
    items.forEach((item, index) => {
      const color = COLORS[index % COLORS.length];
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "0.5rem";
      row.innerHTML = `
        <span style="display:inline-block;width:0.9rem;height:0.9rem;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="flex:1;">Diagram ${index + 1}${item.manual ? " (zelf toegevoegd — hoeken zelf plaatsen op de hele pagina)" : ""}</span>
        <label style="margin:0;font-size:0.85rem;color:#666;">Nr.</label>
        <input type="text" inputmode="numeric" data-nummer="${item.id}" value="${escapeAttr(item.nummer)}" placeholder="?" style="width:5rem;margin:0;" />
        <span data-hint="${item.id}" style="font-size:0.8rem;min-width:6.5rem;"></span>
        <button type="button" class="secondary" data-remove="${item.id}">Verwijderen</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll("[data-nummer]").forEach((input) => {
      input.addEventListener("input", () => {
        const item = items.find((it) => it.id === Number(input.dataset.nummer));
        if (!item) return;
        item.nummer = input.value.trim();
        item.nummerBron = item.nummer ? "zelf" : "";
        updateHints();
        redraw();
      });
    });
    updateHints();
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.remove);
        items = items.filter((it) => it.id !== id);
        renderList();
        redraw();
      });
    });
  }

  async function handleFile(file) {
    if (!file) return;
    status.textContent = "Foto wordt geladen...";
    try {
      drawable = await loadDrawable(file);
      const { width, height } = drawableSize(drawable);
      scale = Math.min(1, WORKING_MAX_SIDE / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      status.textContent = "Diagrammen zoeken...";
      pickCard.style.display = "none";
      overviewCard.style.display = "block";
      await new Promise((r) => setTimeout(r, 0));

      let detected = [];
      try {
        detected = detectBulkBoards(drawable);
      } catch {
        detected = [];
      }
      items = detected.map((corners) => ({ id: nextId++, corners, manual: false, nummer: "", nummerBron: "" }));
      numberStatus.textContent = "";

      status.textContent =
        items.length > 0
          ? `${items.length} diagram(men) gevonden — controleer of dit klopt en verwijder wat niet hoort.`
          : "Geen diagrammen automatisch gevonden. Voeg ze zelf toe met “+ Diagram toevoegen”.";
      renderList();
      redraw();
      readNumbers();
    } catch (err) {
      status.textContent = "Kon deze foto niet openen: " + err.message;
    }
  }

  el('[data-role="camera-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-role="gallery-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-action="camera"]').addEventListener("click", () => el('[data-role="camera-input"]').click());
  el('[data-action="gallery"]').addEventListener("click", () => el('[data-role="gallery-input"]').click());

  el('[data-action="restart"]').addEventListener("click", () => {
    readToken++;
    numbersBusy = false;
    confirmBtn.disabled = false;
    drawable = null;
    items = [];
    pickCard.style.display = "block";
    overviewCard.style.display = "none";
    el('[data-role="camera-input"]').value = "";
    el('[data-role="gallery-input"]').value = "";
  });

  el('[data-action="add"]').addEventListener("click", () => {
    const { width, height } = drawableSize(drawable);
    items.push({ id: nextId++, corners: defaultBoxCorners(width, height, items.length), manual: true, nummer: "", nummerBron: "" });
    status.textContent = 'Diagram toegevoegd (gestippeld) — zodra het aan de beurt is, sleep je de hoeken op de hele pagina naar de juiste plek.';
    renderList();
    redraw();
  });

  confirmBtn.addEventListener("click", () => {
    if (items.length === 0) {
      status.textContent = "Voeg eerst minstens één diagram toe.";
      return;
    }
    const oplossingen = splitOplossingenTekst(oplossingenField.value);
    onConfirmed?.({
      drawable,
      boekstijl: selectedBoekstijl,
      auteur: el('[data-field="auteur"]').value.trim(),
      diagrams: items.map((item) => ({
        corners: item.corners,
        manual: item.manual,
        nummer: item.nummer,
        oplossingTekst: (item.nummer && oplossingen.perNummer[item.nummer]) || "",
      })),
    });
  });
}
