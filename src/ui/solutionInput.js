import { renderDiagramSVG } from "../diagram/render.js?v=20260917g";
import { isValidField } from "../core/board.js?v=20260917g";
import {
  getLegalMoves,
  applyMove,
  opposite,
  formatZettenMetVarianten,
  formatZettenSequence,
} from "../core/draughtsMoves.js?v=20260917g";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function newVariantId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v${Date.now()}-${Math.random()}`;
}

// Interactieve oplossing-invoer: klikken op het bord tikt de zetten in, verplichte
// slagen (en de meeste-slaan-regel) worden automatisch afgedwongen door alleen de
// geldige vervolgvelden klikbaar te maken. Geen damnotatie typen nodig.
//
// Onderweg kan een zijvariant ingevoegd worden: een alternatief voor de
// eerstvolgende hoofdzet, zelf ook met hetzelfde klikbare bordje ingevoerd
// (maar zonder de mogelijkheid om dáár weer een zijvariant in te voegen —
// `allowVariations: false` bij de geneste aanroep hieronder). `onChange`
// krijgt voortaan `{ zetten, zijvarianten }` in plaats van alleen `zetten`.
export function createSolutionInput(
  container,
  { board, turn, initialZetten, initialZijvarianten, allowVariations = true, onChange } = {}
) {
  const startBoard = board;
  const startTurn = turn === "black" ? "black" : "white";
  let zetten = (initialZetten ?? []).map((m) => ({ ...m }));
  let zijvarianten = (initialZijvarianten ?? []).map((v) => ({ id: v.id, vanaf: v.vanaf, zetten: v.zetten.map((m) => ({ ...m })) }));
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
  const variantListHost = document.createElement("div");
  variantListHost.className = "solution-variant-list";
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
  const addVariantBtn = document.createElement("button");
  addVariantBtn.type = "button";
  addVariantBtn.className = "secondary";
  addVariantBtn.textContent = "Zijvariant toevoegen";
  if (allowVariations) buttonRow.append(addVariantBtn);
  const variantHost = document.createElement("div");
  variantHost.style.display = "none";

  container.innerHTML = "";
  container.append(boardHost, statusHost, notationHost, variantListHost, buttonRow, variantHost);

  function notifyChange() {
    onChange?.({
      zetten: zetten.map((m) => ({ ...m })),
      zijvarianten: zijvarianten.map((v) => ({ id: v.id, vanaf: v.vanaf, zetten: v.zetten.map((m) => ({ ...m })) })),
    });
  }

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
    // Geen omlijning van alle zetbare stukken vooraf (dat werkte afleidend) — alleen
    // de doelvelden markeren zodra er bij een slag(keuze) iets te kiezen valt.
    if (partialFrom != null) {
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

    notationHost.textContent =
      formatZettenMetVarianten(zetten, startTurn, zijvarianten) || "Nog geen zetten ingevoerd.";
    undoBtn.disabled = zetten.length === 0;
    clearBtn.disabled = zetten.length === 0;
    addVariantBtn.disabled = candidates.length === 0;
    renderVariantList();
  }

  // Lijst van al toegevoegde zijvarianten onder de notatie, met per stuk de
  // mogelijkheid om 'm te bewerken of te verwijderen — los van de doorlopende
  // haakjes-tekst hierboven, die is puur ter controle en niet aanklikbaar.
  function renderVariantList() {
    if (zijvarianten.length === 0) {
      variantListHost.innerHTML = "";
      return;
    }
    variantListHost.innerHTML = zijvarianten
      .map(
        (v, idx) => `
        <div class="solution-variant-row">
          <span>${escapeHtml(formatZettenSequence(v.zetten, startTurn, v.vanaf))}</span>
          <button type="button" class="secondary" data-variant-edit="${idx}">Bewerken</button>
          <button type="button" class="secondary" data-variant-delete="${idx}">Verwijderen</button>
        </div>`
      )
      .join("");
    for (const btn of variantListHost.querySelectorAll("[data-variant-edit]")) {
      btn.addEventListener("click", () => openVariantEditor(zijvarianten[Number(btn.dataset.variantEdit)]));
    }
    for (const btn of variantListHost.querySelectorAll("[data-variant-delete]")) {
      btn.addEventListener("click", () => {
        zijvarianten = zijvarianten.filter((_, i) => i !== Number(btn.dataset.variantDelete));
        notifyChange();
        renderVariantList();
      });
    }
  }

  // Opent een geneste, eigen klik-invoer vanaf de huidige (of, bij bewerken, de
  // opgeslagen) stand — zonder zelf weer een "Zijvariant toevoegen"-knop
  // (allowVariations: false), want varianten-op-varianten zijn bewust niet
  // ondersteund. Bij een nieuwe variant is `vanaf` het aantal hoofdzetten dat
  // nu al is ingevoerd: de variant is dus een alternatief voor de hoofdzet die
  // hierna komt (nog te spelen, of — bij bewerken — al gespeeld).
  function openVariantEditor(existingVariant) {
    const vanaf = existingVariant ? existingVariant.vanaf : zetten.length;
    const branchBoard = zetten.slice(0, vanaf).reduce((b, m) => applyMove(b, m), startBoard);
    const branchTurn = turnAt(vanaf);

    boardHost.style.display = "none";
    statusHost.style.display = "none";
    notationHost.style.display = "none";
    variantListHost.style.display = "none";
    buttonRow.style.display = "none";
    variantHost.style.display = "";
    variantHost.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "solution-status";
    heading.textContent = `Zijvariant vanaf zet ${vanaf + 1} (${branchTurn === "white" ? "wit" : "zwart"} aan zet)`;
    const nestedHost = document.createElement("div");
    const doneRow = document.createElement("div");
    doneRow.className = "button-row";
    doneRow.style.marginTop = "0.5rem";
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = "Zijvariant opslaan";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "Annuleren";
    doneRow.append(doneBtn, cancelBtn);
    if (existingVariant) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "secondary";
      deleteBtn.textContent = "Verwijderen";
      deleteBtn.addEventListener("click", () => {
        zijvarianten = zijvarianten.filter((v) => v !== existingVariant);
        closeVariantEditor();
        notifyChange();
      });
      doneRow.append(deleteBtn);
    }
    variantHost.append(heading, nestedHost, doneRow);

    let nestedZetten = existingVariant ? existingVariant.zetten.map((m) => ({ ...m })) : [];
    createSolutionInput(nestedHost, {
      board: branchBoard,
      turn: branchTurn,
      initialZetten: nestedZetten,
      allowVariations: false,
      onChange: (state) => {
        nestedZetten = state.zetten;
      },
    });

    function closeVariantEditor() {
      variantHost.style.display = "none";
      boardHost.style.display = "";
      statusHost.style.display = "";
      notationHost.style.display = "";
      variantListHost.style.display = "";
      buttonRow.style.display = "";
      render();
    }

    doneBtn.addEventListener("click", () => {
      if (nestedZetten.length === 0) {
        closeVariantEditor();
        return;
      }
      if (existingVariant) {
        existingVariant.vanaf = vanaf;
        existingVariant.zetten = nestedZetten;
      } else {
        zijvarianten = [...zijvarianten, { id: newVariantId(), vanaf, zetten: nestedZetten }];
      }
      closeVariantEditor();
      notifyChange();
    });
    cancelBtn.addEventListener("click", () => closeVariantEditor());
  }

  addVariantBtn.addEventListener("click", () => openVariantEditor(null));

  // Zodra er nog maar één volledige zet mogelijk is — bij het begin van een beurt
  // (bv. maar één stuk kan spelen) of halverwege een slagketting (de rest van een
  // verplichte meerslag) — wordt die in één keer afgemaakt. Zo hoef je niet apart
  // op elk tussenliggend veld van een gedwongen zet te klikken. Cascadeert vanzelf
  // door naar een volgende beurt als die ook geen keuze biedt.
  function autoCompleteIfForced() {
    // Veiligheidsgrens: voorkomt dat een onwaarschijnlijke, kunstmatige stand (twee
    // dammen die elkaar eeuwig gedwongen heen-en-weer schuiven) de pagina vastzet.
    for (let guard = 0; guard < 500; guard++) {
      const relevant =
        partialFrom == null
          ? candidates
          : candidates.filter(
              (c) => c.van === partialFrom && partialPath.every((v, idx) => c.pad[idx] === v)
            );
      if (relevant.length !== 1) return;
      zetten = [...zetten, relevant[0]];
      notifyChange();
      refreshCandidates();
    }
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
        autoCompleteIfForced();
        render();
        return;
      }
      // Ook een doelveld direct aantikken (zonder eerst het stuk te kiezen) mag,
      // zolang er maar één stuk is dat daar kan komen — anders is het niet
      // eenduidig welke zet bedoeld is en gebeurt er niets.
      const landing = candidates.filter((c) => c.pad[c.pad.length - 1] === field);
      if (landing.length === 1) {
        zetten = [...zetten, landing[0]];
        notifyChange();
        refreshCandidates();
        autoCompleteIfForced();
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
      autoCompleteIfForced();
      render();
      return;
    }

    const { targets } = nextTargets();
    if (!targets.has(field)) return;
    partialPath = [...partialPath, field];
    autoCompleteIfForced();
    render();
  }

  undoBtn.addEventListener("click", () => {
    zetten = zetten.slice(0, -1);
    refreshCandidates();
    render();
    notifyChange();
  });

  clearBtn.addEventListener("click", () => {
    // Ook de zijvarianten wissen: die verwijzen naar een positie ná zoveel
    // hoofdzetten, en die hoofdzetten bestaan straks niet meer.
    zetten = [];
    zijvarianten = [];
    refreshCandidates();
    render();
    notifyChange();
  });

  refreshCandidates();
  autoCompleteIfForced();
  render();

  return {
    getZetten: () => zetten.map((m) => ({ ...m })),
    getZijvarianten: () => zijvarianten.map((v) => ({ id: v.id, vanaf: v.vanaf, zetten: v.zetten.map((m) => ({ ...m })) })),
  };
}
