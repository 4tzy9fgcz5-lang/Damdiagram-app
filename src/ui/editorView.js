import { createBoardEditor, createPalette } from "./boardEditor.js?v=20260916h";
import { createSolutionInput } from "./solutionInput.js?v=20260916h";
import { createEmptyBoard, countPieces, isWhite, isBlack } from "../core/board.js?v=20260916h";
import { parseFen, boardToFen, FenParseError } from "../core/fen.js?v=20260916h";
import { parseStandInput, QuickTextParseError } from "../core/quicktext.js?v=20260916h";
import { validateBoard } from "../core/validate.js?v=20260916h";
import { saveStand, getStand, findDuplicates } from "../db/standen.js?v=20260916h";
import { getList, addListValue } from "../db/lijsten.js?v=20260916h";
import { logHerkenningCorrectie } from "../db/herkenningLog.js?v=20260916h";

const MOEILIJKHEID_MAX = 5;

export async function renderEditorView(
  container,
  {
    standId,
    onSaved,
    initialBoard,
    confidences,
    uncertainFields: uncertainFieldsProp,
    photoDataUrl,
    modelVersion,
    initialBoekstijl,
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

        <label>Speelsysteem</label>
        <div class="tag-list" data-role="speelsysteem"></div>

        <label>Type</label>
        <div class="tag-list" data-role="type"></div>

        <label>Moeilijkheid</label>
        <div class="stars" data-role="stars"></div>

        <label>Notities</label>
        <textarea data-field="notities"></textarea>

        <div data-role="gebruiktIn" style="font-size:0.8rem;color:#666;margin-top:0.5rem;"></div>
        <div data-role="duplicateWarning"></div>

        <div class="button-row">
          <button type="button" class="primary" data-action="save">Opslaan in database</button>
          <button type="button" class="secondary" data-action="save-stencil">Opslaan en toevoegen aan stencil</button>
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
  const speelsysteemHost = el('[data-role="speelsysteem"]');
  const typeHost = el('[data-role="type"]');
  const solutionInputHost = el('[data-role="solutionInput"]');
  const legacyOplossingRefHost = el('[data-role="legacyOplossingRef"]');
  const boekstijlHost = el('[data-role="boekstijl"]');

  let existingStand = null;
  let turn = "white";
  let selectedSpeelsystemen = [];
  let selectedTypes = [];
  let selectedMoeilijkheid = null;
  let solutionZetten = [];
  // Bij bulk-import komt hier de éénmalig voor de hele pagina gekozen boekstijl
  // binnen (zie bulkImportView.js), zodat je die niet per diagram hoeft te
  // herhalen — nog wel per stand aan te passen voor uitzonderingen.
  let selectedBoekstijl = initialBoekstijl || "";

  if (standId) {
    existingStand = await getStand(standId);
    if (existingStand) {
      const parsed = parseFen(existingStand.fen);
      turn = parsed.turn;
      selectedSpeelsystemen = [...existingStand.speelsystemen];
      selectedTypes = [...existingStand.types];
      selectedMoeilijkheid = existingStand.moeilijkheid;
      selectedBoekstijl = existingStand.boekstijl || "";
      solutionZetten = existingStand.zetten ? existingStand.zetten.map((m) => ({ ...m })) : [];
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
        gebruiktInHost.textContent = `Gebruikt in ${existingStand.gebruiktIn.length} stencil(s).`;
      }
    }
  }

  // Welke velden onzeker zijn (gele rand) hangt af van wélke classifier de foto
  // herkende — dat bepaalt en levert photoImportView al aan, dit scherm hoeft de
  // drempel van de gebruikte classifier niet te kennen.
  const uncertainFields = uncertainFieldsProp ?? [];

  const boardEditor = createBoardEditor(boardHost, {
    board: existingStand ? parseFen(existingStand.fen).board : initialBoard ?? createEmptyBoard(),
    onChange: () => {
      renderWarnings();
      renderPieceCount();
      reinitSolutionInput(true);
    },
    highlightFields: uncertainFields,
  });
  createPalette(paletteHost, { onSelect: (tool) => boardEditor.setTool(tool) });

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
    });
  }

  function renderWarnings() {
    const warnings = validateBoard(boardEditor.getBoard());
    warningsHost.innerHTML = warnings.length
      ? `<div class="warnings"><strong>Let op:</strong><ul>${warnings
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join("")}</ul></div>`
      : "";
    dupWarningHost.innerHTML = "";
  }
  renderWarnings();

  function reinitSolutionInput(resetZetten) {
    if (resetZetten) solutionZetten = [];
    createSolutionInput(solutionInputHost, {
      board: boardEditor.getBoard(),
      turn,
      initialZetten: solutionZetten,
      onChange: (zetten) => {
        solutionZetten = zetten;
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

  await renderTagList(speelsysteemHost, "speelsysteem", selectedSpeelsystemen, (value, btn) => {
    toggleInArray(selectedSpeelsystemen, value);
    btn.classList.toggle("selected");
  });
  await renderTagList(typeHost, "type", selectedTypes, (value, btn) => {
    toggleInArray(selectedTypes, value);
    btn.classList.toggle("selected");
  });

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
      auteur: el('[data-field="auteur"]').value.trim(),
      jaartal: jaartalRaw ? Number.parseInt(jaartalRaw, 10) : null,
      publicatie: el('[data-field="publicatie"]').value.trim(),
      speelsystemen: [...selectedSpeelsystemen],
      types: [...selectedTypes],
      moeilijkheid: selectedMoeilijkheid,
      notities: el('[data-field="notities"]').value.trim(),
      foto: photoDataUrl ?? existingStand?.foto ?? null,
      boekstijl: selectedBoekstijl || existingStand?.boekstijl || "",
      gebruiktIn: existingStand?.gebruiktIn ?? [],
    };
  }

  async function doSave({ addToStencil }) {
    const input = collectStandInput();
    if (!input.fen.includes("W") && !input.fen.includes("B")) {
      alert("De stand is verplicht.");
      return;
    }

    if (!existingStand) {
      const { exact, mirrored } = await findDuplicates(input.fen);
      if (exact.length > 0 || mirrored.length > 0) {
        const soort = exact.length > 0 ? "dezelfde stand" : "de gespiegelde versie van deze stand";
        const doorgaan = confirm(
          `Deze stand lijkt al in de database te staan (${soort} gevonden). Toch opslaan?`
        );
        if (!doorgaan) return;
      }
    }

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
