import { renderDiagramSVG } from "../diagram/render.js?v=20260917d";
import { applyMove, moveToNotation } from "../core/draughtsMoves.js?v=20260917d";
import { createSolutionInput } from "./solutionInput.js?v=20260917d";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Bouwt de volledige damnotatie als HTML, met één <span data-ply> per zet zodat de
// huidige stap gemarkeerd (en aangeklikt) kan worden — net als bij toernooibase.
function buildNotationHTML(zetten, firstTurn, currentStep) {
  if (!zetten.length)
    return '<span class="solution-empty">Nog geen oplossing ingevoerd. <a href="#" class="solution-start-entry" data-action="start-entry">Oplossing invoeren</a></span>';

  const ply = (index, text) =>
    `<span class="solution-ply${index === currentStep ? " current" : ""}" data-ply="${index}">${escapeHtml(
      text
    )}</span>`;

  const parts = [];
  let i = 0;
  let moveNumber = 1;
  if (firstTurn === "black") {
    parts.push(`${moveNumber}. ... ${ply(1, moveToNotation(zetten[0]))}`);
    i = 1;
    moveNumber++;
  }
  for (; i < zetten.length; i += 2) {
    const firstPly = i + 1;
    let part = `${moveNumber}. ${ply(firstPly, moveToNotation(zetten[i]))}`;
    if (zetten[i + 1]) part += ` ${ply(firstPly + 1, moveToNotation(zetten[i + 1]))}`;
    parts.push(part);
    moveNumber++;
  }
  return parts.join(" ");
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
// `startHidden`: voor de instelling "oplossing verbergen tot ik erop klik"
// (instellingen -> database). Het bord (de opgave zelf) blijft altijd zichtbaar
// — verborgen wordt alleen de navigatie en de zettenlijst, want juist dáármee
// zou je de oplossing per ongeluk al zien voor je zelf hebt kunnen puzzelen.
export function createSolutionPlayer(container, { board, zetten = [], turn = "white", onSolutionChange, startHidden = false } = {}) {
  let currentZetten = zetten.map((m) => ({ ...m }));
  let snapshots = buildSnapshots();
  let step = 0;
  let playTimer = null;
  // Niets te verbergen als er nog geen oplossing is ingevoerd — dan moet de
  // "Oplossing invoeren"-link gewoon meteen bereikbaar blijven.
  let revealed = !startHidden || currentZetten.length === 0;

  function buildSnapshots() {
    const snaps = [board];
    for (const move of currentZetten) snaps.push(applyMove(snaps[snaps.length - 1], move));
    return snaps;
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
        if (step > 0) {
          step--;
          draw();
        }
      });
      nextBtn.addEventListener("click", () => {
        stopPlaying();
        if (step < currentZetten.length) {
          step++;
          draw();
        }
      });
      playBtn.addEventListener("click", () => {
        if (playTimer) {
          stopPlaying();
          draw();
          return;
        }
        if (step >= currentZetten.length) step = 0;
        playTimer = setInterval(() => {
          if (step >= currentZetten.length) {
            stopPlaying();
            draw();
            return;
          }
          step++;
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
      boardHost.innerHTML = renderDiagramSVG(snapshots[step], { size: 320 });
      if (!revealed) {
        notationHost.innerHTML =
          '<span class="solution-empty">Oplossing verborgen — klik op "Oplossing tonen" als je zelf hebt geprobeerd te puzzelen.</span>';
        return;
      }
      notationHost.innerHTML = buildNotationHTML(currentZetten, turn, step);
      for (const el of notationHost.querySelectorAll("[data-ply]")) {
        el.addEventListener("click", () => {
          stopPlaying();
          step = Number.parseInt(el.dataset.ply, 10);
          draw();
        });
      }
      const startEntryLink = notationHost.querySelector('[data-action="start-entry"]');
      startEntryLink?.addEventListener("click", (e) => {
        e.preventDefault();
        renderEdit();
      });
      prevBtn.disabled = step === 0;
      nextBtn.disabled = step === currentZetten.length;
      playBtn.disabled = currentZetten.length === 0;
      playBtn.innerHTML = playTimer ? "&#9208;" : "&#9654;";
      playBtn.setAttribute("aria-label", playTimer ? "Pauzeren" : "Automatisch afspelen");
    }

    if (revealed) wireNav();
    else wireRevealPrompt();
    draw();
  }

  function renderEdit() {
    stopPlaying();
    container.innerHTML = `<div data-role="input"></div>`;
    const inputHost = container.querySelector('[data-role="input"]');
    createSolutionInput(inputHost, {
      board,
      turn,
      initialZetten: currentZetten,
      onChange: (nieuweZetten) => {
        currentZetten = nieuweZetten;
        onSolutionChange?.(currentZetten.map((m) => ({ ...m })));
      },
    });
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "secondary";
    doneBtn.style.marginTop = "0.75rem";
    doneBtn.textContent = "Klaar";
    doneBtn.addEventListener("click", () => {
      snapshots = buildSnapshots();
      step = currentZetten.length;
      renderView();
    });
    container.appendChild(doneBtn);
  }

  renderView();
}
