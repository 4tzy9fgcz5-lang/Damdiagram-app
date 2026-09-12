import { createBoardEditor, createPalette } from "./boardEditor.js";
import { createEmptyBoard, createStartBoard, mirrorBoard } from "../core/board.js";
import { parseFen, boardToFen, FenParseError } from "../core/fen.js";
import { parseQuickText, QuickTextParseError } from "../core/quicktext.js";
import { validateBoard } from "../core/validate.js";
import { saveStand, getStand, findDuplicates } from "../db/standen.js";
import { getList, addListValue } from "../db/lijsten.js";
import { logHerkenningCorrectie } from "../db/herkenningLog.js";
import { CONFIDENCE_THRESHOLD } from "../recognition/classify.js";

const MOEILIJKHEID_MAX = 5;

export async function renderEditorView(
  container,
  { standId, onSaved, initialBoard, confidences, photoDataUrl } = {}
) {
  container.innerHTML = `
    <h2>Nieuwe stand invoeren</h2>
    <div class="card editor-layout">
      <div class="editor-board-col">
        ${
          photoDataUrl
            ? `<div data-role="photoBlock" style="margin-bottom:0.75rem;">
                <p style="font-size:0.85rem;color:#666;margin:0 0 0.3rem;">Rechtgetrokken foto — velden met een <span style="color:#e0a800;font-weight:600;">gele rand</span> op het bord zijn onzeker, vergelijk ze even.</p>
                <img src="${photoDataUrl}" style="width:100%;max-width:320px;border-radius:8px;border:1px solid #d0d0d0;display:block;" />
              </div>`
            : ""
        }
        <div data-role="board"></div>
        <div data-role="palette"></div>
        <div class="quick-actions">
          <a href="#/foto" class="secondary">📷 Foto van diagram</a>
          <button type="button" class="secondary" data-action="leeg">Leeg bord</button>
          <button type="button" class="secondary" data-action="beginstand">Beginstand</button>
          <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
            <input type="radio" name="turn" value="white" checked /> Wit aan zet
          </label>
          <label style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:normal;margin:0;">
            <input type="radio" name="turn" value="black" /> Zwart aan zet
          </label>
        </div>
        <div data-role="warnings"></div>

        <label>FEN plakken</label>
        <input type="text" data-field="fenInput" placeholder="W:W31,32,33,K45:B1,2,3,K7" />
        <div class="button-row">
          <button type="button" class="secondary" data-action="apply-fen">FEN toepassen</button>
        </div>

        <label>Snelle tekstinvoer</label>
        <textarea data-field="quickText" placeholder="wit 27 28 32 d45 zwart 12 13 19"></textarea>
        <div class="button-row">
          <button type="button" class="secondary" data-action="apply-quicktext">Tekst toepassen</button>
        </div>
      </div>

      <div class="editor-form-col">
        <label>Opdracht (leeg = standaard)</label>
        <input type="text" data-field="opdracht" placeholder="bijv. Wit speelt en wint" />

        <label>Oplossing</label>
        <textarea data-field="oplossing" placeholder="1. 33-28 22x33 2. 38x29 ..."></textarea>

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
  const warningsHost = el('[data-role="warnings"]');
  const dupWarningHost = el('[data-role="duplicateWarning"]');
  const gebruiktInHost = el('[data-role="gebruiktIn"]');
  const starsHost = el('[data-role="stars"]');
  const speelsysteemHost = el('[data-role="speelsysteem"]');
  const typeHost = el('[data-role="type"]');

  let existingStand = null;
  let turn = "white";
  let selectedSpeelsystemen = [];
  let selectedTypes = [];
  let selectedMoeilijkheid = null;

  if (standId) {
    existingStand = await getStand(standId);
    if (existingStand) {
      const parsed = parseFen(existingStand.fen);
      turn = parsed.turn;
      selectedSpeelsystemen = [...existingStand.speelsystemen];
      selectedTypes = [...existingStand.types];
      selectedMoeilijkheid = existingStand.moeilijkheid;
      el('[data-field="opdracht"]').value = existingStand.opdracht;
      el('[data-field="oplossing"]').value = existingStand.oplossing;
      el('[data-field="auteur"]').value = existingStand.auteur;
      el('[data-field="jaartal"]').value = existingStand.jaartal ?? "";
      el('[data-field="publicatie"]').value = existingStand.publicatie;
      el('[data-field="notities"]').value = existingStand.notities;
      if (existingStand.gebruiktIn.length) {
        gebruiktInHost.textContent = `Gebruikt in ${existingStand.gebruiktIn.length} stencil(s).`;
      }
    }
  }

  const uncertainFields = confidences
    ? confidences.reduce((acc, c, f) => (f >= 1 && c < CONFIDENCE_THRESHOLD ? [...acc, f] : acc), [])
    : [];

  const boardEditor = createBoardEditor(boardHost, {
    board: existingStand ? parseFen(existingStand.fen).board : initialBoard ?? createEmptyBoard(),
    onChange: renderWarnings,
    highlightFields: uncertainFields,
  });
  createPalette(paletteHost, { onSelect: (tool) => boardEditor.setTool(tool) });

  for (const radio of container.querySelectorAll('input[name="turn"]')) {
    radio.checked = radio.value === turn;
    radio.addEventListener("change", (e) => {
      if (e.target.checked) turn = e.target.value;
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

  el('[data-action="leeg"]').addEventListener("click", () => {
    boardEditor.setBoard(createEmptyBoard());
  });
  el('[data-action="beginstand"]').addEventListener("click", () => {
    boardEditor.setBoard(createStartBoard());
  });

  el('[data-action="apply-fen"]').addEventListener("click", () => {
    const value = el('[data-field="fenInput"]').value.trim();
    if (!value) return;
    try {
      const parsed = parseFen(value);
      boardEditor.setBoard(parsed.board);
      turn = parsed.turn;
      for (const radio of container.querySelectorAll('input[name="turn"]')) {
        radio.checked = radio.value === turn;
      }
    } catch (err) {
      if (err instanceof FenParseError) alert(`Kon de FEN niet lezen: ${err.message}`);
      else throw err;
    }
  });

  el('[data-action="apply-quicktext"]').addEventListener("click", () => {
    const value = el('[data-field="quickText"]').value.trim();
    if (!value) return;
    try {
      const parsed = parseQuickText(value, turn);
      boardEditor.setBoard(parsed.board);
    } catch (err) {
      if (err instanceof QuickTextParseError) alert(`Kon de tekst niet lezen: ${err.message}`);
      else throw err;
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
      oplossing: el('[data-field="oplossing"]').value.trim(),
      auteur: el('[data-field="auteur"]').value.trim(),
      jaartal: jaartalRaw ? Number.parseInt(jaartalRaw, 10) : null,
      publicatie: el('[data-field="publicatie"]').value.trim(),
      speelsystemen: [...selectedSpeelsystemen],
      types: [...selectedTypes],
      moeilijkheid: selectedMoeilijkheid,
      notities: el('[data-field="notities"]').value.trim(),
      foto: photoDataUrl ?? existingStand?.foto ?? null,
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
