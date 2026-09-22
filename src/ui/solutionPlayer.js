import { renderDiagramSVG } from "../diagram/render.js?v=20260921bb";
import { applyMove, moveToNotation, plyColor, plyMoveNumber } from "../core/draughtsMoves.js?v=20260921bb";
import { createSolutionInput } from "./solutionInput.js?v=20260921bb";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Bouwt de volledige damnotatie als HTML: de hoofdlijn met één <span data-ply>
// per zet (zodat de huidige stap gemarkeerd en aangeklikt kan worden — net als
// bij toernooibase), en eventuele zijvarianten direct ná de hoofdzet waar ze een
// alternatief voor zijn, tussen haakjes en met eigen klikbare <span data-vindex>-
// zetten. `position` is `{ mode: "main", step }` of `{ mode: "variant",
// variantIndex, vIndex }` en bepaalt welke zet als "current" gemarkeerd wordt.
function buildNotationHTML(zetten, firstTurn, zijvarianten, position) {
  if (!zetten.length)
    return '<span class="solution-empty">Nog geen oplossing ingevoerd. <a href="#" class="solution-start-entry" data-action="start-entry">Oplossing invoeren</a></span>';

  const mainPly = (globalPly, text) =>
    `<span class="solution-ply${
      position.mode === "main" && position.step === globalPly ? " current" : ""
    }" data-ply="${globalPly}">${escapeHtml(text)}</span>`;

  const variantPly = (variantIndex, vIndex, text) =>
    `<span class="solution-ply solution-variant-ply${
      position.mode === "variant" && position.variantIndex === variantIndex && position.vIndex === vIndex
        ? " current"
        : ""
    }" data-variant-index="${variantIndex}" data-vindex="${vIndex}">${escapeHtml(text)}</span>`;

  const perVanaf = new Map();
  zijvarianten.forEach((v, variantIndex) => {
    const lijst = perVanaf.get(v.vanaf) ?? [];
    lijst.push({ variant: v, variantIndex });
    perVanaf.set(v.vanaf, lijst);
  });

  function variantGroupHtml(variant, variantIndex) {
    const pieces = [];
    let j = 0;
    if (plyColor(firstTurn, variant.vanaf) === "black") {
      pieces.push(`${plyMoveNumber(firstTurn, variant.vanaf)}. ...`);
      pieces.push(variantPly(variantIndex, 1, moveToNotation(variant.zetten[0])));
      j = 1;
    }
    for (; j < variant.zetten.length; j++) {
      const globalPly = variant.vanaf + j;
      if (plyColor(firstTurn, globalPly) === "white") pieces.push(`${plyMoveNumber(firstTurn, globalPly)}.`);
      pieces.push(variantPly(variantIndex, j + 1, moveToNotation(variant.zetten[j])));
    }
    return `<span class="solution-variant-group">(${pieces.join(" ")})</span>`;
  }

  const pieces = [];
  for (let i = 0; i < zetten.length; i++) {
    if (plyColor(firstTurn, i) === "white") pieces.push(`${plyMoveNumber(firstTurn, i)}.`);
    else if (i === 0) pieces.push(`${plyMoveNumber(firstTurn, i)}. ...`);
    pieces.push(mainPly(i + 1, moveToNotation(zetten[i])));
    for (const { variant, variantIndex } of perVanaf.get(i) ?? []) pieces.push(variantGroupHtml(variant, variantIndex));
  }
  for (const { variant, variantIndex } of perVanaf.get(zetten.length) ?? []) pieces.push(variantGroupHtml(variant, variantIndex));
  return pieces.join(" ");
}

const PLAY_INTERVAL_MS = 1100;

// Alleen-lezen weergave van een opgeslagen oplossing: bord + pijltjes eronder om
// een zet heen en weer te stappen, plus een afspeelknop om automatisch door te
// lopen (zoals toernooibase) — met de volledige notatie ernaast (huidige zet
// gemarkeerd en ook aanklikbaar). Staat er nog geen oplossing, dan is er in
// plaats van het bord een "Oplossing invoeren"-link te zien; die schakelt om
// naar dezelfde aanklikbare bordinvoer als op het gewone invoerscherm
// (solutionInput.js), en `onSolutionChange` geeft elke wijziging door zodat de
// aanroeper (de detailpagina) die meteen kan opslaan.
//
// Zijvarianten: sta je aan het eind van de hoofdlijn en druk je nogmaals op
// "volgende" (knop of pijltjestoets), dan springt het bord terug naar het
// aftakkingspunt van de eerste zijvariant en speel je die verder af; na het
// eind van die variant (indien aanwezig) naar de volgende, enzovoort.
// "Vorige" vanuit een zijvariant loopt eerst terug door de eigen zetten van die
// variant, en pas daarna terug naar het aftakkingspunt in de hoofdlijn. Het
// automatische afspelen (de klok-knop) blijft altijd binnen de hoofdlijn en
// stopt aan het eind daarvan — zijvarianten bereik je dan alleen handmatig,
// zodat je nooit per ongeluk denkt dat een zijvariant de hoofdlijn is.
//
// `startHidden`: voor de instelling "oplossing verbergen tot ik erop klik"
// (instellingen -> database). Het bord (de opgave zelf) blijft altijd zichtbaar
// — verborgen wordt alleen de navigatie en de zettenlijst, want juist dáármee
// zou je de oplossing per ongeluk al zien voor je zelf hebt kunnen puzzelen.
export function createSolutionPlayer(
  container,
  { board, zetten = [], zijvarianten = [], turn = "white", onSolutionChange, startHidden = false } = {}
) {
  let currentZetten = zetten.map((m) => ({ ...m }));
  // Defensief: een zijvariant die verwijst naar een punt voorbij het huidige
  // eind van de hoofdlijn (kan in theorie ontstaan door een "zet ongedaan
  // maken" ná het toevoegen van een variant) wordt genegeerd in plaats van de
  // pagina te laten crashen.
  let currentZijvarianten = zijvarianten
    .filter((v) => v.vanaf >= 0 && v.vanaf <= currentZetten.length && v.zetten?.length > 0)
    .map((v) => ({ id: v.id, vanaf: v.vanaf, zetten: v.zetten.map((m) => ({ ...m })) }));
  let mainSnapshots = buildMainSnapshots();
  let variantSnapshots = buildVariantSnapshots();
  let position = { mode: "main", step: 0 };
  let playTimer = null;
  // Niets te verbergen als er nog geen oplossing is ingevoerd — dan moet de
  // "Oplossing invoeren"-link gewoon meteen bereikbaar blijven.
  let revealed = !startHidden || currentZetten.length === 0;
  let keydownHandler = null;

  // Geen aparte "destroy"-aanroep vanuit de aanroeper (die bestaat nergens in
  // deze app) — de handler schakelt zichzelf uit zodra de container niet meer
  // in de pagina zit (na navigeren weg van de standdetailpagina).
  function stopListeningForKeys() {
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
  }

  function buildMainSnapshots() {
    const snaps = [board];
    for (const move of currentZetten) snaps.push(applyMove(snaps[snaps.length - 1], move));
    return snaps;
  }

  function buildVariantSnapshots() {
    return currentZijvarianten.map((variant) => {
      const snaps = [mainSnapshots[variant.vanaf]];
      for (const move of variant.zetten) snaps.push(applyMove(snaps[snaps.length - 1], move));
      return snaps;
    });
  }

  function currentBoard() {
    return position.mode === "main" ? mainSnapshots[position.step] : variantSnapshots[position.variantIndex][position.vIndex];
  }

  function canGoNext() {
    if (position.mode === "main") {
      if (position.step < currentZetten.length) return true;
      return currentZijvarianten.length > 0;
    }
    const variant = currentZijvarianten[position.variantIndex];
    if (position.vIndex < variant.zetten.length) return true;
    return position.variantIndex + 1 < currentZijvarianten.length;
  }

  function canGoPrev() {
    if (position.mode === "variant") return true;
    return position.step > 0;
  }

  function goNext() {
    if (position.mode === "main") {
      if (position.step < currentZetten.length) {
        position = { mode: "main", step: position.step + 1 };
      } else if (currentZijvarianten.length > 0) {
        position = { mode: "variant", variantIndex: 0, vIndex: 1 };
      }
      return;
    }
    const variant = currentZijvarianten[position.variantIndex];
    if (position.vIndex < variant.zetten.length) {
      position = { ...position, vIndex: position.vIndex + 1 };
    } else if (position.variantIndex + 1 < currentZijvarianten.length) {
      position = { mode: "variant", variantIndex: position.variantIndex + 1, vIndex: 1 };
    }
  }

  function goPrev() {
    if (position.mode === "variant") {
      if (position.vIndex > 1) {
        position = { ...position, vIndex: position.vIndex - 1 };
      } else {
        position = { mode: "main", step: currentZijvarianten[position.variantIndex].vanaf };
      }
      return;
    }
    if (position.step > 0) position = { mode: "main", step: position.step - 1 };
  }

  function stopPlaying() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function renderView() {
    container.innerHTML = `
      <div class="solution-layout">
        <div class="solution-board-col">
          <div data-role="board"></div>
          <div data-role="navHost"></div>
        </div>
        <div class="solution-notation-col">
          <div data-role="notation" class="solution-notation-text"></div>
        </div>
      </div>
    `;

    const boardHost = container.querySelector('[data-role="board"]');
    const notationHost = container.querySelector('[data-role="notation"]');
    const navHost = container.querySelector('[data-role="navHost"]');
    let prevBtn, nextBtn, playBtn;

    function wireNav() {
      navHost.innerHTML = `
        <div class="solution-nav">
          <button type="button" class="solution-nav-btn" data-action="prev" aria-label="Vorige zet">&#9664;&#9664;</button>
          <button type="button" class="solution-nav-btn" data-action="play" aria-label="Automatisch afspelen">&#9654;</button>
          <button type="button" class="solution-nav-btn" data-action="next" aria-label="Volgende zet">&#9654;&#9654;</button>
        </div>
      `;
      prevBtn = navHost.querySelector('[data-action="prev"]');
      nextBtn = navHost.querySelector('[data-action="next"]');
      playBtn = navHost.querySelector('[data-action="play"]');

      prevBtn.addEventListener("click", () => {
        stopPlaying();
        if (canGoPrev()) {
          goPrev();
          draw();
        }
      });
      nextBtn.addEventListener("click", () => {
        stopPlaying();
        if (canGoNext()) {
          goNext();
          draw();
        }
      });
      playBtn.addEventListener("click", () => {
        if (playTimer) {
          stopPlaying();
          draw();
          return;
        }
        // Automatisch afspelen blijft altijd binnen de hoofdlijn: begin bij het
        // begin als je al (voorbij) het eind zit, of nog in een zijvariant staat.
        if (position.mode !== "main" || position.step >= currentZetten.length) position = { mode: "main", step: 0 };
        playTimer = setInterval(() => {
          if (position.step >= currentZetten.length) {
            stopPlaying();
            draw();
            return;
          }
          position = { mode: "main", step: position.step + 1 };
          draw();
        }, PLAY_INTERVAL_MS);
        draw();
      });
    }

    function wireRevealPrompt() {
      navHost.innerHTML = `
        <div class="solution-nav">
          <button type="button" class="secondary" data-action="reveal">Oplossing tonen</button>
        </div>
      `;
      navHost.querySelector('[data-action="reveal"]').addEventListener("click", () => {
        revealed = true;
        wireNav();
        draw();
      });
    }

    function draw() {
      boardHost.innerHTML = renderDiagramSVG(currentBoard(), { size: 320 });
      if (!revealed) {
        notationHost.innerHTML =
          '<span class="solution-empty">Oplossing verborgen — klik op "Oplossing tonen" als je zelf hebt geprobeerd te puzzelen.</span>';
        return;
      }
      notationHost.innerHTML = buildNotationHTML(currentZetten, turn, currentZijvarianten, position);
      for (const el of notationHost.querySelectorAll("[data-ply]")) {
        el.addEventListener("click", () => {
          stopPlaying();
          position = { mode: "main", step: Number.parseInt(el.dataset.ply, 10) };
          draw();
        });
      }
      for (const el of notationHost.querySelectorAll("[data-vindex]")) {
        el.addEventListener("click", () => {
          stopPlaying();
          position = {
            mode: "variant",
            variantIndex: Number.parseInt(el.dataset.variantIndex, 10),
            vIndex: Number.parseInt(el.dataset.vindex, 10),
          };
          draw();
        });
      }
      const startEntryLink = notationHost.querySelector('[data-action="start-entry"]');
      startEntryLink?.addEventListener("click", (e) => {
        e.preventDefault();
        renderEdit();
      });
      prevBtn.disabled = !canGoPrev();
      nextBtn.disabled = !canGoNext();
      playBtn.disabled = currentZetten.length === 0;
      playBtn.innerHTML = playTimer ? "&#9208;" : "&#9654;";
      playBtn.setAttribute("aria-label", playTimer ? "Pauzeren" : "Automatisch afspelen");
    }

    if (revealed) wireNav();
    else wireRevealPrompt();
    draw();

    stopListeningForKeys();
    keydownHandler = (e) => {
      if (!container.isConnected) {
        stopListeningForKeys();
        return;
      }
      if (!revealed) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevBtn.click();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextBtn.click();
      }
    };
    document.addEventListener("keydown", keydownHandler);
  }

  function renderEdit() {
    stopPlaying();
    stopListeningForKeys();
    container.innerHTML = `<div data-role="input"></div>`;
    const inputHost = container.querySelector('[data-role="input"]');
    createSolutionInput(inputHost, {
      board,
      turn,
      initialZetten: currentZetten,
      initialZijvarianten: currentZijvarianten,
      onChange: (state) => {
        currentZetten = state.zetten;
        currentZijvarianten = state.zijvarianten;
        onSolutionChange?.({
          zetten: currentZetten.map((m) => ({ ...m })),
          zijvarianten: currentZijvarianten.map((v) => ({ id: v.id, vanaf: v.vanaf, zetten: v.zetten.map((m) => ({ ...m })) })),
        });
      },
    });
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "secondary";
    doneBtn.style.marginTop = "0.75rem";
    doneBtn.textContent = "Klaar";
    doneBtn.addEventListener("click", () => {
      mainSnapshots = buildMainSnapshots();
      variantSnapshots = buildVariantSnapshots();
      position = { mode: "main", step: currentZetten.length };
      renderView();
    });
    container.appendChild(doneBtn);
  }

  renderView();
}
