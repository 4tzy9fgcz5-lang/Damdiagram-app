import { renderDiagramSVG } from "../diagram/render.js?v=20260915j";
import { applyMove, moveToNotation } from "../core/draughtsMoves.js?v=20260915j";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Bouwt de volledige damnotatie als HTML, met één <span data-ply> per zet zodat de
// huidige stap gemarkeerd (en aangeklikt) kan worden — net als bij toernooibase.
function buildNotationHTML(zetten, firstTurn, currentStep) {
  if (!zetten.length) return '<span class="solution-empty">Nog geen oplossing ingevoerd.</span>';

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
// gemarkeerd en ook aanklikbaar).
export function createSolutionPlayer(container, { board, zetten = [], turn = "white" } = {}) {
  const snapshots = [board];
  for (const move of zetten) snapshots.push(applyMove(snapshots[snapshots.length - 1], move));

  let step = 0;
  let playTimer = null;

  container.innerHTML = `
    <div class="solution-layout">
      <div class="solution-board-col">
        <div data-role="board"></div>
        <div class="solution-nav">
          <button type="button" class="solution-nav-btn" data-action="prev" aria-label="Vorige zet">&#9664;&#9664;</button>
          <button type="button" class="solution-nav-btn" data-action="play" aria-label="Automatisch afspelen">&#9654;</button>
          <button type="button" class="solution-nav-btn" data-action="next" aria-label="Volgende zet">&#9654;&#9654;</button>
        </div>
      </div>
      <div class="solution-notation-col">
        <div data-role="notation" class="solution-notation-text"></div>
      </div>
    </div>
  `;

  const boardHost = container.querySelector('[data-role="board"]');
  const notationHost = container.querySelector('[data-role="notation"]');
  const prevBtn = container.querySelector('[data-action="prev"]');
  const nextBtn = container.querySelector('[data-action="next"]');
  const playBtn = container.querySelector('[data-action="play"]');

  function stopPlaying() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function render() {
    boardHost.innerHTML = renderDiagramSVG(snapshots[step], { size: 320 });
    notationHost.innerHTML = buildNotationHTML(zetten, turn, step);
    for (const el of notationHost.querySelectorAll("[data-ply]")) {
      el.addEventListener("click", () => {
        stopPlaying();
        step = Number.parseInt(el.dataset.ply, 10);
        render();
      });
    }
    prevBtn.disabled = step === 0;
    nextBtn.disabled = step === zetten.length;
    playBtn.disabled = zetten.length === 0;
    playBtn.innerHTML = playTimer ? "&#9208;" : "&#9654;";
    playBtn.setAttribute("aria-label", playTimer ? "Pauzeren" : "Automatisch afspelen");
  }

  prevBtn.addEventListener("click", () => {
    stopPlaying();
    if (step > 0) {
      step--;
      render();
    }
  });
  nextBtn.addEventListener("click", () => {
    stopPlaying();
    if (step < zetten.length) {
      step++;
      render();
    }
  });
  playBtn.addEventListener("click", () => {
    if (playTimer) {
      stopPlaying();
      render();
      return;
    }
    if (step >= zetten.length) step = 0;
    playTimer = setInterval(() => {
      if (step >= zetten.length) {
        stopPlaying();
        render();
        return;
      }
      step++;
      render();
    }, PLAY_INTERVAL_MS);
    render();
  });

  render();
}
