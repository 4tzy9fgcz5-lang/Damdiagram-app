import { renderDiagramSVG } from "../diagram/render.js?v=20260921ar";
import { isValidField } from "../core/board.js?v=20260921ar";
import {
  getLegalMoves,
  applyMove,
  opposite,
  moveToNotation,
  plyColor,
  plyMoveNumber,
  formatZettenSequence,
} from "../core/draughtsMoves.js?v=20260921ar";

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
  // Bordstand per hoofdzet (index 0 = beginstand), voor het terugbladeren
  // hieronder. Wordt herbouwd zodra `zetten` verandert (zie refreshCandidates).
  let snapshots = [];
  // Welke stap er nu getoond wordt: 0..zetten.length. Staat 'ie op zetten.length
  // (de "live" stand), dan is het bord gewoon klikbaar om verder te gaan; staat
  // 'ie ergens eerder, dan is het bord alleen-lezen (bekijken van een eerdere
  // zet) — zo kun je door een al ingevoerde oplossing bladeren zonder per se
  // zetten weg te gooien met "Zet ongedaan maken".
  let browseStep = 0;

  const boardHost = document.createElement("div");
  const statusHost = document.createElement("div");
  statusHost.className = "solution-status";
  const navRow = document.createElement("div");
  navRow.className = "solution-nav";
  navRow.style.justifyContent = "flex-start";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "solution-nav-btn";
  prevBtn.innerHTML = "&#9664;";
  prevBtn.setAttribute("aria-label", "Vorige zet bekijken");
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "solution-nav-btn";
  nextBtn.innerHTML = "&#9654;";
  nextBtn.setAttribute("aria-label", "Volgende zet bekijken");
  navRow.append(prevBtn, nextBtn);
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
  container.append(boardHost, statusHost, navRow, notationHost, variantListHost, buttonRow, variantHost);

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

  function buildSnapshots() {
    const snaps = [startBoard];
    for (const m of zetten) snaps.push(applyMove(snaps[snaps.length - 1], m));
    return snaps;
  }

  function resetPartial() {
    partialFrom = null;
    partialPath = [];
  }

  // Na elke wijziging van `zetten` (zet gespeeld, ongedaan gemaakt, gewist):
  // snapshots herbouwen en teruggaan naar "live" bladeren (de nieuwe laatste
  // zet), zodat je meteen weer verder kunt klikken.
  function refreshCandidates() {
    liveBoard = replay();
    liveTurn = turnAt(zetten.length);
    candidates = getLegalMoves(liveBoard, liveTurn);
    resetPartial();
    snapshots = buildSnapshots();
    browseStep = zetten.length;
  }

  function candidatesAt(step) {
    const b = step === zetten.length ? liveBoard : snapshots[step];
    return getLegalMoves(b, turnAt(step));
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

  // Bouwt de notatie met per hoofdzet een aanklikbare <span data-ply> (om
  // terug/vooruit te bladeren — zie navRow hieronder), plus de zijvarianten
  // tussen haakjes op hun plek. De zijvarianten zelf zijn hier niet aanklikbaar
  // — die bewerk je via de lijst eronder (renderVariantList).
  function buildEntryNotationHTML() {
    if (zetten.length === 0 && zijvarianten.length === 0) return "";
    const perVanaf = new Map();
    for (const v of zijvarianten) {
      const lijst = perVanaf.get(v.vanaf) ?? [];
      lijst.push(v);
      perVanaf.set(v.vanaf, lijst);
    }
    const pieces = [];
    for (let i = 0; i < zetten.length; i++) {
      if (plyColor(startTurn, i) === "white") pieces.push(`${plyMoveNumber(startTurn, i)}.`);
      else if (i === 0) pieces.push(`${plyMoveNumber(startTurn, i)}. ...`);
      const ply = i + 1;
      pieces.push(
        `<span class="solution-ply${browseStep === ply ? " current" : ""}" data-ply="${ply}">${escapeHtml(
          moveToNotation(zetten[i])
        )}</span>`
      );
      for (const v of perVanaf.get(i) ?? []) {
        pieces.push(
          `<span class="solution-variant-group">(${escapeHtml(formatZettenSequence(v.zetten, startTurn, v.vanaf))})</span>`
        );
      }
    }
    for (const v of perVanaf.get(zetten.length) ?? []) {
      pieces.push(
        `<span class="solution-variant-group">(${escapeHtml(formatZettenSequence(v.zetten, startTurn, v.vanaf))})</span>`
      );
    }
    return pieces.join(" ");
  }

  function render() {
    const live = browseStep === zetten.length;
    const displayBoard = live ? liveBoard : snapshots[browseStep];
    boardHost.innerHTML = renderDiagramSVG(displayBoard, { size: 320 });
    if (live) {
      const svg = boardHost.querySelector("svg");
      svg.style.touchAction = "manipulation";
      svg.style.userSelect = "none";
      svg.style.cursor = "pointer";
      svg.addEventListener("click", handleClick);
      drawMarkers(svg);
    }

    if (!live) {
      statusHost.textContent = `Zet ${browseStep} van ${zetten.length} bekeken — klik op de laatste zet of op ▶ om verder te gaan met invoeren.`;
    } else {
      const kleur = liveTurn === "white" ? "wit" : "zwart";
      if (candidates.length === 0) {
        statusHost.textContent = `Geen zetten meer mogelijk voor ${kleur} — einde van de oplossing.`;
      } else if (partialFrom == null && candidates.some((c) => c.geslagen.length > 0)) {
        statusHost.textContent = `Slaan is verplicht (${kleur} aan zet).`;
      } else {
        statusHost.textContent = `${kleur === "wit" ? "Wit" : "Zwart"} aan zet.`;
      }
    }

    notationHost.innerHTML = buildEntryNotationHTML() || "Nog geen zetten ingevoerd.";
    for (const el of notationHost.querySelectorAll("[data-ply]")) {
      el.addEventListener("click", () => {
        browseStep = Number.parseInt(el.dataset.ply, 10);
        render();
      });
    }

    prevBtn.disabled = browseStep === 0;
    nextBtn.disabled = live;
    // "Zet ongedaan maken" haalt specifiek de láátste zet weg, dus alleen
    // zinnig als je daar ook naar kijkt (live). "Wis oplossing" wist altijd
    // alles, ongeacht welke stap je op dat moment bekijkt — dat mag dus
    // overal, anders moest je eerst terug naar het einde bladeren om te
    // kunnen wissen.
    undoBtn.disabled = zetten.length === 0 || !live;
    clearBtn.disabled = zetten.length === 0;
    addVariantBtn.disabled = candidatesAt(browseStep).length === 0;
    renderVariantList();
  }

  prevBtn.addEventListener("click", () => {
    if (browseStep === 0) return;
    browseStep -= 1;
    render();
  });
  nextBtn.addEventListener("click", () => {
    if (browseStep === zetten.length) return;
    browseStep += 1;
    render();
  });

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

  // Opent een geneste, eigen klik-invoer vanaf de bekeken stap (of, bij
  // bewerken, de opgeslagen positie) — zonder zelf weer een "Zijvariant
  // toevoegen"-knop (allowVariations: false), want varianten-op-varianten
  // zijn bewust niet ondersteund. Bij een nieuwe variant is `vanaf` de stap
  // die op dat moment bekeken wordt (zie browseStep/navRow hierboven): zo kun
  // je eerst naar een eerdere zet terugbladeren en daar een variant invoegen
  // zonder de latere hoofdzetten kwijt te raken.
  function openVariantEditor(existingVariant) {
    const vanaf = existingVariant ? existingVariant.vanaf : browseStep;
    const branchBoard = zetten.slice(0, vanaf).reduce((b, m) => applyMove(b, m), startBoard);
    const branchTurn = turnAt(vanaf);

    boardHost.style.display = "none";
    statusHost.style.display = "none";
    navRow.style.display = "none";
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
      navRow.style.display = "";
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
