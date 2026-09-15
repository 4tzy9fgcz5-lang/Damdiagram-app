import { renderDiagramSVG } from "../diagram/render.js?v=20260915a";
import { isValidField } from "../core/board.js?v=20260915a";
import { getLegalMoves, applyMove, formatZetten } from "../core/draughtsMoves.js?v=20260915a";

function opposite(color) {
  return color === "white" ? "black" : "white";
}

// Interactieve oplossing-invoer: klikken op het bord tikt de zetten in, verplichte
// slagen (en de meeste-slaan-regel) worden automatisch afgedwongen door alleen de
// geldige vervolgvelden klikbaar te maken. Geen damnotatie typen nodig.
export function createSolutionInput(container, { board, turn, initialZetten, onChange } = {}) {
  const startBoard = board;
  const startTurn = turn === "black" ? "black" : "white";
  let zetten = (initialZetten ?? []).map((m) => ({ ...m }));
  let liveBoard;
  let liveTurn;
  let candidates;
  let partialFrom = null;
  let partialPath = [];

  const boardHost = document.createElement("div");
  const statusHost = document.createElement("div");
  statusHost.className = "solution-status";
  const notationHost = document.createElement("div");
  notationHost.className = "solution-notation";
  const buttonRow = document.createElement("div");
  buttonRow.className = "button-row";
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "secondary";
  undoBtn.textContent = "Zet ongedaan maken";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "secondary";
  clearBtn.textContent = "Wis oplossing";
  buttonRow.append(undoBtn, clearBtn);

  container.innerHTML = "";
  container.append(boardHost, statusHost, notationHost, buttonRow);

  function turnAt(index) {
    return index % 2 === 0 ? startTurn : opposite(startTurn);
  }

  function replay() {
    return zetten.reduce((b, m) => applyMove(b, m), startBoard);
  }

  function resetPartial() {
    partialFrom = null;
    partialPath = [];
  }

  function refreshCandidates() {
    liveBoard = replay();
    liveTurn = turnAt(zetten.length);
    candidates = getLegalMoves(liveBoard, liveTurn);
    resetPartial();
  }

  function ownFieldsWithMoves() {
    return new Set(candidates.map((c) => c.van));
  }

  function nextTargets() {
    const matching = candidates.filter(
      (c) =>
        c.van === partialFrom &&
        partialPath.every((v, idx) => c.pad[idx] === v)
    );
    return { matching, targets: new Set(matching.map((c) => c.pad[partialPath.length])) };
  }

  function drawMarkers(svg) {
    const ns = "http://www.w3.org/2000/svg";
    const mark = (field, color) => {
      const square = svg.querySelector(`rect[data-field="${field}"]`);
      if (!square) return;
      const marker = document.createElementNS(ns, "rect");
      marker.setAttribute("x", square.getAttribute("x"));
      marker.setAttribute("y", square.getAttribute("y"));
      marker.setAttribute("width", square.getAttribute("width"));
      marker.setAttribute("height", square.getAttribute("height"));
      marker.setAttribute("fill", "none");
      marker.setAttribute("stroke", color);
      marker.setAttribute("stroke-width", "3");
      marker.setAttribute("pointer-events", "none");
      svg.appendChild(marker);
    };
    if (partialFrom == null) {
      for (const field of ownFieldsWithMoves()) mark(field, "#1a5c38");
    } else {
      mark(partialFrom, "#1a5c38");
      const { targets } = nextTargets();
      for (const field of targets) mark(field, "#e0a800");
    }
  }

  function render() {
    boardHost.innerHTML = renderDiagramSVG(liveBoard, { size: 320 });
    const svg = boardHost.querySelector("svg");
    svg.style.touchAction = "manipulation";
    svg.style.userSelect = "none";
    svg.style.cursor = "pointer";
    svg.addEventListener("click", handleClick);
    drawMarkers(svg);

    const kleur = liveTurn === "white" ? "wit" : "zwart";
    if (candidates.length === 0) {
      statusHost.textContent = `Geen zetten meer mogelijk voor ${kleur} — einde van de oplossing.`;
    } else if (partialFrom == null && candidates.some((c) => c.geslagen.length > 0)) {
      statusHost.textContent = `Slaan is verplicht (${kleur} aan zet).`;
    } else {
      statusHost.textContent = `${kleur === "wit" ? "Wit" : "Zwart"} aan zet.`;
    }

    notationHost.textContent = formatZetten(zetten, startTurn) || "Nog geen zetten ingevoerd.";
    undoBtn.disabled = zetten.length === 0;
    clearBtn.disabled = zetten.length === 0;
  }

  function finishIfComplete() {
    const { matching } = nextTargets();
    const stillOpen = matching.some((c) => c.pad.length > partialPath.length);
    if (stillOpen) return false;
    const move = matching.find((c) => c.pad.length === partialPath.length);
    if (!move) return false;
    zetten = [...zetten, move];
    refreshCandidates();
    onChange?.(zetten.map((m) => ({ ...m })));
    return true;
  }

  function handleClick(evt) {
    const target = evt.target.closest("[data-field]");
    if (!target) return;
    const field = Number.parseInt(target.dataset.field, 10);
    if (!isValidField(field)) return;

    if (partialFrom == null) {
      if (ownFieldsWithMoves().has(field)) {
        partialFrom = field;
        partialPath = [];
        render();
      }
      return;
    }

    if (field === partialFrom) {
      resetPartial();
      render();
      return;
    }
    if (ownFieldsWithMoves().has(field) && !nextTargets().targets.has(field)) {
      partialFrom = field;
      partialPath = [];
      render();
      return;
    }

    const { targets } = nextTargets();
    if (!targets.has(field)) return;
    partialPath = [...partialPath, field];
    finishIfComplete();
    render();
  }

  undoBtn.addEventListener("click", () => {
    zetten = zetten.slice(0, -1);
    refreshCandidates();
    render();
    onChange?.(zetten.map((m) => ({ ...m })));
  });

  clearBtn.addEventListener("click", () => {
    zetten = [];
    refreshCandidates();
    render();
    onChange?.(zetten.map((m) => ({ ...m })));
  });

  refreshCandidates();
  render();

  return {
    getZetten: () => zetten.map((m) => ({ ...m })),
  };
}
