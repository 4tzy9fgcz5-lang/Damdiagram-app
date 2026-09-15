import { renderDiagramSVG } from "../diagram/render.js?v=20260915a";
import { applyMove, moveToNotation } from "../core/draughtsMoves.js?v=20260915a";

// Alleen-lezen stap-voor-stap weergave van een opgeslagen oplossing (klikbare
// invoer gebeurt in solutionInput.js op de invoerpagina).
export function createSolutionPlayer(container, { board, zetten = [] } = {}) {
  const snapshots = [board];
  for (const move of zetten) snapshots.push(applyMove(snapshots[snapshots.length - 1], move));

  let step = 0;

  const boardHost = document.createElement("div");
  const labelHost = document.createElement("div");
  labelHost.className = "solution-status";
  const buttonRow = document.createElement("div");
  buttonRow.className = "button-row";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "secondary";
  prevBtn.textContent = "◀ Vorige";
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "secondary";
  nextBtn.textContent = "Volgende ▶";
  buttonRow.append(prevBtn, nextBtn);

  container.innerHTML = "";
  container.append(boardHost, labelHost, buttonRow);

  function render() {
    boardHost.innerHTML = renderDiagramSVG(snapshots[step], { size: 320 });
    labelHost.textContent =
      step === 0
        ? zetten.length
          ? "Beginstand — klik op Volgende om de oplossing te bekijken."
          : "Beginstand."
        : `Zet ${step} van ${zetten.length}: ${moveToNotation(zetten[step - 1])}`;
    prevBtn.disabled = step === 0;
    nextBtn.disabled = step === zetten.length;
  }

  prevBtn.addEventListener("click", () => {
    if (step > 0) {
      step--;
      render();
    }
  });
  nextBtn.addEventListener("click", () => {
    if (step < zetten.length) {
      step++;
      render();
    }
  });

  render();
}
