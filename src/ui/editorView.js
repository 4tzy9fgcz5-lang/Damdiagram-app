import { createBoardEditor, createPalette } from "./boardEditor.js?v=20260921c";
import { createSolutionInput } from "./solutionInput.js?v=20260921c";
import { createEmptyBoard, countPieces, isWhite, isBlack } from "../core/board.js?v=20260921c";
import { parseFen, boardToFen, FenParseError } from "../core/fen.js?v=20260921c";
import { parseStandInput, QuickTextParseError } from "../core/quicktext.js?v=20260921c";
import { validateBoard } from "../core/validate.js?v=20260921c";
import { saveStand, getStand, findDuplicates } from "../db/standen.js?v=20260921c";
import { getList, addListValue } from "../db/lijsten.js?v=20260921c";
import { getAllCategorieen } from "../db/categorieen.js?v=20260921c";
import { logHerkenningCorrectie } from "../db/herkenningLog.js?v=20260921c";
import { reclassifyFromDataUrl } from "./diagramCaptureView.js?v=20260921c";
import { RECOGNITION_VERSION as NEW_MODEL_VERSION } from "../recognition/newClassify.js?v=20260921c";

const MOEILIJKHEID_MAX = 5;

export async function renderEditorView(
  container,
  {
    standId,
    onSaved,
    onSkip,
    initialBoard,
    confidences,
    uncertainFields: uncertainFieldsProp,
    photoDataUrl,
    modelVersion,
    initialBoekstijl,
    initialAuteur,
  } = {}
) {
  container.innerHTML = `
    <h2>Nieuwe stand invoeren</h2>
    <div class="card editor-layout">
      <div class="editor-board-col">
        ${
          photoDataUrl
            ? `<p style="font-size:0.85rem;color:#666;margin:0 0 0.5rem;text-align:left;">Rechtgetrokken foto — velden met een <span style="color:#e0a800;font-weight:600;">gele rand</span> op het bord zijn onzeker (of de oude en nieuwe herkenning zijn het er niet over eens), vergelijk ze even.</p>`
            : ""
        }
        <div class="editor-photo-row">
          <div class="editor-board-wrap">
            <div data-role="board"></div>
            <div data-role="palette"></div>
            <p data-role="pieceCount" class="piece-count"></p>
          </div>
          ${
            photoDataUrl
              ? `<div data-role="photoBlock" class="editor-photo-block">
                  <img src="${photoDataUrl}" style="width:100%;border-radius:8px;border:1px solid #d0d0d0;display:block;" />
                  <div class="quick-actions" style="justify-content:flex-start;margin-top:0.5rem;">
                    <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
                      <input type="radio" name="editor-classifier" value="new" /> Nieuwe herkenning
                    </label>
                    <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
                      <input type="radio" name="editor-classifier" value="old" /> Oude herkenning
                    </label>
                  </div>
                  <p style="font-size:0.8rem;color:#666;margin:0.2rem 0 0;">
                    Ander resultaat nodig? Wisselen herkent dezelfde foto opnieuw en vervangt het bord hierboven.
                  </p>
                  <label style="margin-top:0.5rem;">Boekstijl (voor training van de fotoherkenning)</label>
                  <div class="tag-list" data-role="boekstijl"></div>
                </div>`
              : ""
          }
        </div>
        <div class="quick-actions">
          <a href="#/foto" class="secondary">📷 Foto van diagram</a>
          <button type="button" class="secondary" data-action="leeg">Leeg bord</button>
          <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
            <input type="radio" name="turn" value="white" checked /> Wit aan zet
          </label>
          <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
            <input type="radio" name="turn" value="black" /> Zwart aan zet
          </label>
        </div>
        <div data-role="warnings"></div>
        <div data-role="duplicateWarning"></div>

        <label>Stand invoeren</label>
        <textarea
          data-field="standInput"
          placeholder="W:W31,32,33,K45:B1,2,3,K7  of  wit 27 28 32 d45 zwart 12 13 19"
        ></textarea>
        <div class="button-row">
          <button type="button" class="secondary" data-action="apply-stand">Toepassen</button>
        </div>
      </div>

      <div class="editor-form-col">
        <label>Opdracht (leeg = standaard)</label>
        <input type="text" data-field="opdracht" placeholder="bijv. Wit speelt en wint" />

        <label>Oplossing</label>
        <p style="font-size:0.85rem;color:#666;margin:0.25rem 0;">
          Klik op een eigen stuk en dan op het doelveld om de oplossing in te tikken. Verplichte slagen
          worden automatisch afgehandeld.
        </p>
        <div data-role="legacyOplossingRef"></div>
        <div data-role="solutionInput"></div>

        <div class="field-row">
          <div>
            <label>Auteur</label>
            <input type="text" data-field="auteur" />
          </div>
          <div>
            <label>Jaartal</label>
            <input type="number" data-field="jaartal" />
          </div>
        </div>

        <label>Publicatie</label>
        <input type="text" data-field="publicatie" placeholder="boek, tijdschrift of website" />

        <div data-role="categorieen"></div>

        <label>Moeilijkheid</label>
        <div class="stars" data-role="stars"></div>

        <label>Notities</label>
        <textarea data-field="notities"></textarea>

        <div data-role="gebruiktIn" style="font-size:0.8rem;color:#666;margin-top:0.5rem;"></div>

        <div class="button-row">
          <button type="button" class="primary" data-action="save">Opslaan in database</button>
          <button type="button" class="secondary" data-action="save-stencil">Opslaan en toevoegen aan opgaveblad</button>
        </div>
      </div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  const boardHost = el('[data-role="board"]');
  const paletteHost = el('[data-role="palette"]');
  const pieceCountHost = el('[data-role="pieceCount"]');
  const warningsHost = el('[data-role="warnings"]');
  const dupWarningHost = el('[data-role="duplicateWarning"]');
  const gebruiktInHost = el('[data-role="gebruiktIn"]');
  const starsHost = el('[data-role="stars"]');
  const categorieenHost = el('[data-role="categorieen"]');
  const solutionInputHost = el('[data-role="solutionInput"]');
  const legacyOplossingRefHost = el('[data-role="legacyOplossingRef"]');
  const boekstijlHost = el('[data-role="boekstijl"]');

  let existingStand = null;
  let turn = "white";
  // Per categorie-key (speelsysteem, type, en wat Jan er zelf bij maakt in
  // Instellingen -> Database) de gekozen waarden voor déze stand.
  let selectedCategorieen = {};
  let selectedMoeilijkheid = null;
  let solutionZetten = [];
  let solutionZijvarianten = [];
  // Bij bulk-import komt hier de éénmalig voor de hele pagina gekozen boekstijl
  // binnen (zie bulkImportView.js), zodat je die niet per diagram hoeft te
  // herhalen — nog wel per stand aan te passen voor uitzonderingen.
  let selectedBoekstijl = initialBoekstijl || "";
  // Zelfde bulk-import-gedachte als boekstijl hierboven: éénmalig voor de hele
  // pagina ingevulde auteur, als startwaarde voor elk diagram — een bestaande
  // stand (bewerken) overschrijft dit hieronder met zijn eigen auteur.
  if (initialAuteur) el('[data-field="auteur"]').value = initialAuteur;

  if (standId) {
    existingStand = await getStand(standId);
    if (existingStand) {
      const parsed = parseFen(existingStand.fen);
      turn = parsed.turn;
      selectedCategorieen = {};
      for (const [key, waarden] of Object.entries(existingStand.categorieen ?? {})) {
        selectedCategorieen[key] = [...waarden];
      }
      selectedMoeilijkheid = existingStand.moeilijkheid;
      selectedBoekstijl = existingStand.boekstijl || "";
      solutionZetten = existingStand.zetten ? existingStand.zetten.map((m) => ({ ...m })) : [];
      solutionZijvarianten = existingStand.zijvarianten
        ? existingStand.zijvarianten.map((v) => ({ id: v.id, vanaf: v.vanaf, zetten: v.zetten.map((m) => ({ ...m })) }))
        : [];
      if (solutionZetten.length === 0 && existingStand.oplossing) {
        legacyOplossingRefHost.innerHTML = `<p style="font-size:0.85rem;color:#666;">Bestaande oplossingstekst (ter referentie): ${escapeHtml(
          existingStand.oplossing
        )}</p>`;
      }
      el('[data-field="opdracht"]').value = existingStand.opdracht;
      el('[data-field="auteur"]').value = existingStand.auteur;
      el('[data-field="jaartal"]').value = existingStand.jaartal ?? "";
      el('[data-field="publicatie"]').value = existingStand.publicatie;
      el('[data-field="notities"]').value = existingStand.notities;
      if (existingStand.gebruiktIn.length) {
        gebruiktInHost.textContent = `Gebruikt in ${existingStand.gebruiktIn.length} opgaveblad(en).`;
      }
    }
  }

  // Welke velden onzeker zijn (gele rand) hangt af van wélke classifier de foto
  // herkende — dat bepaalt en levert photoImportView al aan, dit scherm hoeft de
  // drempel van de gebruikte classifier niet te kennen. Alle drie hieronder zijn
  // herschrijfbaar (geen const): bij het wisselen van classifier (zie
  // switchClassifier) vervangen ze de oorspronkelijke fotoherkenning, ook als
  // basis voor het trainingslogboek bij opslaan.
  let uncertainFields = uncertainFieldsProp ?? [];

  const boardEditor = createBoardEditor(boardHost, {
    board: existingStand ? parseFen(existingStand.fen).board : initialBoard ?? createEmptyBoard(),
    onChange: () => {
      renderWarnings();
      renderPieceCount();
      reinitSolutionInput(true);
      checkDuplicates();
    },
    highlightFields: uncertainFields,
  });
  createPalette(paletteHost, { onSelect: (tool) => boardEditor.setTool(tool) });

  // Schakelaar op het correctiescherm zelf: soms is de gekozen classifier
  // duidelijk mis (of "crasht" met een rare, foutieve stand) en scheelt het
  // tijd om meteen — zonder terug te gaan naar de foto-stap — dezelfde foto met
  // de andere classifier te laten herkennen. Vervangt het bord; eventuele eigen
  // correcties tot dat moment gaan daarbij verloren (vandaar de bevestiging).
  if (photoDataUrl) {
    const classifierRadios = container.querySelectorAll('input[name="editor-classifier"]');
    const isCurrentlyNew = modelVersion === NEW_MODEL_VERSION;
    for (const radio of classifierRadios) {
      radio.checked = radio.value === (isCurrentlyNew ? "new" : "old");
    }
    for (const radio of classifierRadios) {
      radio.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        const useNew = e.target.value === "new";
        const doorgaan = confirm(
          "Dit herkent dezelfde foto opnieuw en vervangt het bord. Eigen correcties die je al gemaakt hebt, gaan daarbij verloren. Doorgaan?"
        );
        if (!doorgaan) {
          for (const r of classifierRadios) r.checked = r.value === (useNew ? "old" : "new");
          return;
        }
        try {
          const result = await reclassifyFromDataUrl(photoDataUrl, useNew);
          initialBoard = result.board;
          confidences = result.confidences;
          uncertainFields = result.uncertainFields;
          modelVersion = result.modelVersion;
          boardEditor.setBoard(result.board);
          boardEditor.setHighlights(uncertainFields);
        } catch (err) {
          alert("Opnieuw herkennen is mislukt: " + err.message);
        }
      });
    }
  }

  function renderPieceCount() {
    const board = boardEditor.getBoard();
    const white = countPieces(board, isWhite);
    const black = countPieces(board, isBlack);
    pieceCountHost.textContent = `Wit: ${white} · Zwart: ${black}`;
  }
  renderPieceCount();

  for (const radio of container.querySelectorAll('input[name="turn"]')) {
    radio.checked = radio.value === turn;
    radio.addEventListener("change", (e) => {
      if (e.target.checked) turn = e.target.value;
      reinitSolutionInput(true);
      checkDuplicates();
    });
  }

  function renderWarnings() {
    const warnings = validateBoard(boardEditor.getBoard());
    warningsHost.innerHTML = warnings.length
      ? `<div class="warnings"><strong>Let op:</strong><ul>${warnings
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join("")}</ul></div>`
      : "";
  }
  renderWarnings();

  // Meteen na het intikken van de stand controleren of hij (of de gespiegelde
  // versie) al in de database staat — vóór je auteur, oplossing en de rest
  // hebt ingevuld, zodat dat werk niet voor niets is. `dupCheckToken`
  // voorkomt dat een trage, oudere controle een nieuwere nog overschrijft als
  // je snel achter elkaar aan het bord verandert.
  let dupCheckToken = 0;
  async function checkDuplicates() {
    const myToken = ++dupCheckToken;
    if (existingStand) {
      dupWarningHost.innerHTML = "";
      return;
    }
    const board = boardEditor.getBoard();
    // Let op: de FEN begint altijd met "W:" of "B:" (wie er aan zet is), dus
    // fen.includes("W"/"B") checkt dat nooit betrouwbaar — echt op stukken
    // tellen in plaats van op de tekst zoeken.
    if (countPieces(board, isWhite) === 0 && countPieces(board, isBlack) === 0) {
      dupWarningHost.innerHTML = "";
      return;
    }
    const fen = boardToFen(board, turn);
    const { exact, mirrored } = await findDuplicates(fen);
    if (myToken !== dupCheckToken) return;
    if (exact.length === 0 && mirrored.length === 0) {
      dupWarningHost.innerHTML = "";
      return;
    }
    const soort = exact.length > 0 ? "Deze stand" : "De gespiegelde versie van deze stand";
    dupWarningHost.innerHTML = `
      <div class="warnings">
        <strong>Let op:</strong> ${soort} staat al in de database.
        <div class="button-row" style="margin-top:0.5rem;">
          <button type="button" class="secondary" data-action="skip-diagram">Diagram overslaan</button>
        </div>
      </div>
    `;
    dupWarningHost.querySelector('[data-action="skip-diagram"]').addEventListener("click", () => onSkip?.());
  }
  checkDuplicates();

  function reinitSolutionInput(resetZetten) {
    if (resetZetten) {
      solutionZetten = [];
      solutionZijvarianten = [];
    }
    createSolutionInput(solutionInputHost, {
      board: boardEditor.getBoard(),
      turn,
      initialZetten: solutionZetten,
      initialZijvarianten: solutionZijvarianten,
      onChange: (state) => {
        solutionZetten = state.zetten;
        solutionZijvarianten = state.zijvarianten;
      },
    });
  }
  reinitSolutionInput(false);

  el('[data-action="leeg"]').addEventListener("click", () => {
    boardEditor.setBoard(createEmptyBoard());
  });

  el('[data-action="apply-stand"]').addEventListener("click", () => {
    const value = el('[data-field="standInput"]').value.trim();
    if (!value) return;
    try {
      const parsed = parseStandInput(value, turn);
      boardEditor.setBoard(parsed.board);
      turn = parsed.turn;
      for (const radio of container.querySelectorAll('input[name="turn"]')) {
        radio.checked = radio.value === turn;
      }
      reinitSolutionInput(true);
    } catch (err) {
      if (err instanceof FenParseError || err instanceof QuickTextParseError) {
        alert(`Kon de stand niet lezen: ${err.message}`);
      } else {
        throw err;
      }
    }
  });

  async function renderTagList(host, listName, selectedRef, onToggle) {
    const values = await getList(listName);
    host.innerHTML = "";
    for (const value of values) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = value;
      if (selectedRef.includes(value)) btn.classList.add("selected");
      btn.addEventListener("click", () => onToggle(value, btn));
      host.appendChild(btn);
    }
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tag";
    addBtn.textContent = "+ nieuw";
    addBtn.addEventListener("click", async () => {
      const naam = prompt("Nieuwe waarde:");
      if (!naam) return;
      await addListValue(listName, naam);
      await renderTagList(host, listName, selectedRef, onToggle);
    });
    host.appendChild(addBtn);
  }

  // Eén tag-lijst per filtercategorie (Speelsysteem, Type, en wat er verder
  // via Instellingen -> Database is toegevoegd) — volledig dynamisch, want
  // welke categorieën er zijn ligt niet meer vast in de code.
  async function renderCategorieenTagLists() {
    const categorieen = await getAllCategorieen();
    categorieenHost.innerHTML = categorieen
      .map((cat) => `<label>${escapeHtml(cat.label)}</label><div class="tag-list" data-cat="${cat.key}"></div>`)
      .join("");
    for (const cat of categorieen) {
      if (!selectedCategorieen[cat.key]) selectedCategorieen[cat.key] = [];
      const host = categorieenHost.querySelector(`[data-cat="${cat.key}"]`);
      await renderTagList(host, cat.key, selectedCategorieen[cat.key], (value, btn) => {
        toggleInArray(selectedCategorieen[cat.key], value);
        btn.classList.toggle("selected");
      });
    }
  }
  await renderCategorieenTagLists();

  // Alleen bij een via-foto herkende stand: uit welk boek dit diagram komt, als
  // trainingsmateriaal voor de fotoherkenning (zie herkenningLog.js). Eén keuze per
  // stand — geen los tekstveld, zodat dezelfde boeknaam altijd hetzelfde gespeld is.
  async function renderBoekstijlPicker() {
    if (!boekstijlHost) return;
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
      const naam = prompt("Uit welk boek of tijdschrift komt dit diagram?");
      if (!naam || !naam.trim()) return;
      await addListValue("boekstijl", naam.trim());
      selectedBoekstijl = naam.trim();
      renderBoekstijlPicker();
    });
    boekstijlHost.appendChild(addBtn);
  }
  await renderBoekstijlPicker();

  function renderStars() {
    starsHost.innerHTML = "";
    for (let i = 1; i <= MOEILIJKHEID_MAX; i++) {
      const span = document.createElement("span");
      span.className = "star" + (selectedMoeilijkheid && i <= selectedMoeilijkheid ? " filled" : "");
      span.textContent = "★";
      span.addEventListener("click", () => {
        selectedMoeilijkheid = selectedMoeilijkheid === i ? null : i;
        renderStars();
      });
      starsHost.appendChild(span);
    }
  }
  renderStars();

  function collectStandInput() {
    const fen = boardToFen(boardEditor.getBoard(), turn);
    const jaartalRaw = el('[data-field="jaartal"]').value;
    return {
      id: existingStand?.id,
      fen,
      opdracht: el('[data-field="opdracht"]').value.trim(),
      oplossing: existingStand?.oplossing ?? "",
      zetten: solutionZetten,
      zijvarianten: solutionZijvarianten,
      auteur: el('[data-field="auteur"]').value.trim(),
      jaartal: jaartalRaw ? Number.parseInt(jaartalRaw, 10) : null,
      publicatie: el('[data-field="publicatie"]').value.trim(),
      categorieen: Object.fromEntries(Object.entries(selectedCategorieen).map(([k, v]) => [k, [...v]])),
      moeilijkheid: selectedMoeilijkheid,
      notities: el('[data-field="notities"]').value.trim(),
      foto: photoDataUrl ?? existingStand?.foto ?? null,
      boekstijl: selectedBoekstijl || existingStand?.boekstijl || "",
      gebruiktIn: existingStand?.gebruiktIn ?? [],
    };
  }

  async function doSave({ addToStencil }) {
    const input = collectStandInput();
    const board = boardEditor.getBoard();
    if (countPieces(board, isWhite) === 0 && countPieces(board, isBlack) === 0) {
      alert("De stand is verplicht.");
      return;
    }

    // Geen aparte bevestigingsvraag meer hier — als deze stand al bestaat, is
    // dat allang zichtbaar geweest via de melding direct onder het bord (zie
    // checkDuplicates hierboven), ruim voordat je de rest was gaan invullen.
    const saved = await saveStand(input);
    existingStand = saved;

    // Alleen lokaal: bewaar wat de fotoherkenning dacht en wat het uiteindelijk werd,
    // als toekomstig trainingsmateriaal. Mag de opslag zelf nooit laten mislukken.
    if (photoDataUrl && initialBoard) {
      try {
        await logHerkenningCorrectie({
          foto: photoDataUrl,
          initialBoard,
          finalBoard: boardEditor.getBoard(),
          confidences,
          modelVersion,
          boekstijl: selectedBoekstijl || null,
        });
      } catch (err) {
        console.warn("Kon herkenningscorrectie niet loggen:", err);
      }
    }

    onSaved?.(saved, { addToStencil });
  }

  el('[data-action="save"]').addEventListener("click", () => doSave({ addToStencil: false }));
  el('[data-action="save-stencil"]').addEventListener("click", () => doSave({ addToStencil: true }));
}

function toggleInArray(arr, value) {
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else arr.splice(idx, 1);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
