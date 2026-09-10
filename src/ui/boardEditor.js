import { renderDiagramSVG, pieceIconSVG } from "../diagram/render.js";
import { cloneBoard, PIECE_TYPES, isValidField } from "../core/board.js";

const CYCLE = [
  null,
  PIECE_TYPES.WHITE_PIECE,
  PIECE_TYPES.BLACK_PIECE,
  PIECE_TYPES.WHITE_KING,
  PIECE_TYPES.BLACK_KING,
];

export function createBoardEditor(container, { board, onChange } = {}) {
  let current = board ? cloneBoard(board) : cloneBoard(board);
  let tool = "cycle";

  function renderBoard() {
    container.innerHTML = renderDiagramSVG(current, { size: container.dataset.size || 320 });
    const svg = container.querySelector("svg");
    svg.style.touchAction = "manipulation";
    svg.style.userSelect = "none";
    svg.style.cursor = "pointer";
    svg.addEventListener("click", handleClick);
  }

  function handleClick(evt) {
    const target = evt.target.closest("[data-field]");
    if (!target) return;
    const field = Number.parseInt(target.dataset.field, 10);
    if (!isValidField(field)) return;
    applyToolToField(field);
  }

  function applyToolToField(field) {
    if (tool === "cycle") {
      const currentPiece = current[field];
      const idx = CYCLE.indexOf(currentPiece);
      const nextIdx = (idx + 1) % CYCLE.length;
      current[field] = CYCLE[nextIdx];
    } else {
      current[field] = tool === "empty" ? null : tool;
    }
    renderBoard();
    onChange?.(cloneBoard(current));
  }

  renderBoard();

  return {
    getBoard: () => cloneBoard(current),
    setBoard: (newBoard) => {
      current = cloneBoard(newBoard);
      renderBoard();
      onChange?.(cloneBoard(current));
    },
    setTool: (newTool) => {
      tool = newTool;
    },
  };
}

export function createPalette(container, { onSelect } = {}) {
  const items = [
    { tool: "cycle", label: "Tikken wisselt" },
    { tool: "empty", label: "Leeg" },
    { tool: PIECE_TYPES.WHITE_PIECE, label: "Witte schijf" },
    { tool: PIECE_TYPES.BLACK_PIECE, label: "Zwarte schijf" },
    { tool: PIECE_TYPES.WHITE_KING, label: "Witte dam" },
    { tool: PIECE_TYPES.BLACK_KING, label: "Zwarte dam" },
  ];

  container.innerHTML = "";
  container.classList.add("palette");

  let selected = "cycle";

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-item";
    btn.dataset.tool = item.tool;
    btn.title = item.label;
    btn.setAttribute("aria-label", item.label);

    if (item.tool === "cycle") {
      btn.innerHTML = `<span class="palette-cycle-icon">↻</span>`;
    } else if (item.tool === "empty") {
      btn.innerHTML = `<span class="palette-empty-icon"></span>`;
    } else {
      btn.innerHTML = pieceIconSVG(item.tool, 40);
    }

    btn.addEventListener("click", () => {
      selected = item.tool;
      for (const el of container.querySelectorAll(".palette-item")) {
        el.classList.toggle("selected", el.dataset.tool === selected);
      }
      onSelect?.(selected);
    });

    if (item.tool === selected) btn.classList.add("selected");
    container.appendChild(btn);
  }
}
