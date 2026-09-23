import { renderDiagramSVG } from "../diagram/render.js?v=20260923q";
import { isValidField } from "../core/board.js?v=20260923q";
import { getLegalMoves, plyColor, plyMoveNumber } from "../core/draughtsMoves.js?v=20260923q";
import { knoopOpPad, standBijPad, notatieMetVoorloopnul, voegZetToe } from "../core/zettenboom.js?v=20260923q";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function samePad(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

const TEKENS = ["", "!", "?", "!?", "?!", "!!", "??"];

// Zelfde recursieve notatie-opbouw als `zettenboomPlayer.js` (bouwNotatieHtml) — klikbaar om
// naartoe te springen, dat spring-doel is hier meteen ook "de geselecteerde zet" voor het
// annotatiepaneel hieronder (zie CLAUDE.md, "Achteraf annoteren").
function bouwNotatieHtml(wortel, startBeurt, huidigPad) {
  const stukken = [];

  function schrijfZet(knoop, eigenPad, forceerZetnummer) {
    const ply = eigenPad.length - 1;
    const kleur = plyColor(startBeurt, ply);
    if (kleur === "white") stukken.push(`${plyMoveNumber(startBeurt, ply)}.`);
    else if (forceerZetnummer) stukken.push(`${plyMoveNumber(startBeurt, ply)}. ...`);
    const tekst = notatieMetVoorloopnul(knoop.zet) + (knoop.teken ?? "");
    const huidig = samePad(eigenPad, huidigPad);
    stukken.push(`<span class="solution-ply${huidig ? " current" : ""}" data-pad="${eigenPad.join(",")}">${escapeHtml(tekst)}</span>`);
    if (knoop.commentaar) stukken.push(`<div class="boom-commentaar">${escapeHtml(knoop.commentaar)}</div>`);
  }

  function schrijfReeks(ouderKnoop, pad) {
    if (ouderKnoop.kinderen.length === 0) return;
    const [hoofdKind, ...varianten] = ouderKnoop.kinderen;
    const hoofdPad = [...pad, hoofdKind.id];
    schrijfZet(hoofdKind, hoofdPad, false);
    for (const variantKind of varianten) {
      const variantPad = [...pad, variantKind.id];
      stukken.push('<span class="solution-variant-group">(');
      schrijfZet(variantKind, variantPad, true);
      schrijfReeks(variantKind, variantPad);
      stukken.push(")</span>");
    }
    schrijfReeks(hoofdKind, hoofdPad);
  }

  schrijfReeks(wortel, []);
  return stukken.length ? stukken.join(" ") : '<span class="solution-empty">Nog geen zetten.</span>';
}

// Interactieve annotator (fase 2-vervolg, CLAUDE.md "Achteraf annoteren", 2026-09-23): bord +
// klikbare notatie zoals `zettenboomPlayer.js`, maar bewerkbaar — vergelijkbaar met hoe Jan het
// op lidraughts.org kent. Bewust een NIEUW bestand i.p.v. `zettenboomPlayer.js` uit te breiden:
// die wordt ook alleen-lezend gebruikt (partij-detailpagina, invoerscherm-voorbeeld, proefscherm)
// en dat moet zo blijven; dit is qua opzet eerder het spiegelbeeld van hoe `solutionInput.js`
// een eigen, bewerkbaar bestand is naast het alleen-lezende `solutionPlayer.js`.
//
// Verschil met `solutionInput.js`: dat bouwt één platte reeks (`zetten`) stap voor stap op; dit
// bewerkt een boom die al bestaat — klikken op het bord voegt vanaf de GESELECTEERDE knoop een
// zet toe (wordt de hoofdvoortzetting als die knoop nog geen kinderen had, anders een nieuwe
// variant — dat regelt `voegZetToe` zelf al, zie zettenboom.js), ongeacht waar in de boom je
// staat. `wortel` wordt in-place gewijzigd (de aanroeper geeft een eigen kopie mee als "niet
// opgeslagen totdat je op Opslaan klikt" nodig is, zie `partijAnnoterenView.js`).
export function createZettenboomAnnotator(container, { wortel, bord, beurt, onChange } = {}) {
  let huidigPad = [];
  let partialFrom = null;
  let partialPath = [];

  // Het annotatiepaneel (toelichting/teken/verwijderen) staat in de bordkolom, niet in de
  // notatiekolom — die laatste scrolt onafhankelijk bij een lange partij (.boom-notation-col,
  // zie styles.css) en zou het paneel dan uit beeld duwen. De bordkolom is altijd zichtbaar
  // (position: sticky), dus zo hoef je nooit te scrollen om erbij te kunnen (Jans melding,
  // 2026-09-24: "ik moet nu scrollen om het tekstvak zichtbaar te krijgen").
  container.innerHTML = `
    <div class="boom-layout">
      <div class="boom-board-col">
        <div data-role="board"></div>
        <div class="solution-nav">
          <button type="button" class="solution-nav-btn" data-action="first" aria-label="Eerste zet">&#9198;</button>
          <button type="button" class="solution-nav-btn" data-action="prev" aria-label="Vorige zet">&#9664;&#9664;</button>
          <button type="button" class="solution-nav-btn" data-action="next" aria-label="Volgende zet">&#9654;&#9654;</button>
          <button type="button" class="solution-nav-btn" data-action="last" aria-label="Laatste zet">&#9197;</button>
        </div>
        <p data-role="status" class="solution-status"></p>
        <div class="card" style="margin-top:0.5rem;text-align:left;">
          <label>Toelichting bij de geselecteerde zet</label>
          <textarea data-role="commentaar" rows="3" style="width:100%;"></textarea>
          <div style="display:flex;gap:0.75rem;align-items:center;margin-top:0.5rem;flex-wrap:wrap;">
            <label style="margin:0;">Waarderingsteken</label>
            <select data-role="teken"></select>
          </div>
          <div class="button-row" style="margin-top:0.5rem;">
            <button type="button" class="secondary" data-action="verwijder">Verwijder deze zet (en wat erna komt)</button>
          </div>
        </div>
      </div>
      <div class="boom-notation-col">
        <div data-role="notation" class="solution-notation-text"></div>
      </div>
    </div>
  `;

  const boardHost = container.querySelector('[data-role="board"]');
  const notationHost = container.querySelector('[data-role="notation"]');
  const statusHost = container.querySelector('[data-role="status"]');
  const firstBtn = container.querySelector('[data-action="first"]');
  const prevBtn = container.querySelector('[data-action="prev"]');
  const nextBtn = container.querySelector('[data-action="next"]');
  const lastBtn = container.querySelector('[data-action="last"]');
  const commentaarHost = container.querySelector('[data-role="commentaar"]');
  const tekenHost = container.querySelector('[data-role="teken"]');
  const verwijderBtn = container.querySelector('[data-action="verwijder"]');

  tekenHost.innerHTML = TEKENS.map((t) => `<option value="${t}">${t || "(geen)"}</option>`).join("");

  function huidigeStand() {
    return standBijPad(wortel, bord, beurt, huidigPad);
  }
  function huidigeKnoop() {
    return knoopOpPad(wortel, huidigPad);
  }
  function ouderVanHuidige() {
    return knoopOpPad(wortel, huidigPad.slice(0, -1));
  }

  function resetPartial() {
    partialFrom = null;
    partialPath = [];
  }

  function ga(nieuwPad) {
    if (!knoopOpPad(wortel, nieuwPad)) return;
    huidigPad = nieuwPad;
    resetPartial();
    render();
  }

  function eersteZet() {
    ga([]);
  }
  function laatsteZet() {
    let knoop = huidigeKnoop();
    const pad = [...huidigPad];
    while (knoop.kinderen.length > 0) {
      knoop = knoop.kinderen[0];
      pad.push(knoop.id);
    }
    ga(pad);
  }
  function vorigeZet() {
    ga(huidigPad.slice(0, -1));
  }
  function volgendeZet() {
    const knoop = huidigeKnoop();
    if (knoop.kinderen.length > 0) ga([...huidigPad, knoop.kinderen[0].id]);
  }

  function ownFieldsWithMoves(candidates) {
    return new Set(candidates.map((c) => c.van));
  }
  function nextTargets(candidates) {
    const matching = candidates.filter((c) => c.van === partialFrom && partialPath.every((v, idx) => c.pad[idx] === v));
    return { matching, targets: new Set(matching.map((c) => c.pad[partialPath.length])) };
  }

  function drawMarkers(svg, candidates) {
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
    if (partialFrom != null) {
      const { targets } = nextTargets(candidates);
      for (const field of targets) mark(field, "#e0a800");
    }
  }

  // Voegt één zet toe vanaf de HUIDIGE knoop (wordt hoofdvoortzetting of variant, zie
  // `voegZetToe`) en springt de selectie meteen mee naar de nieuwe knoop, zodat je meteen door
  // kunt klikken voor een langere variant.
  function commitZet(zetObj) {
    const { bord: b, beurt: t } = huidigeStand();
    const resultaat = voegZetToe(huidigeKnoop(), b, t, zetObj);
    if (!resultaat.ok) return; // kan niet gebeuren (zetObj komt uit getLegalMoves), defensief
    huidigPad = [...huidigPad, resultaat.knoop.id];
    resetPartial();
    onChange?.();
    render();
  }

  function autoCompleteIfForced() {
    for (let guard = 0; guard < 500; guard++) {
      const { bord: b, beurt: t } = huidigeStand();
      const candidates = getLegalMoves(b, t);
      const relevant =
        partialFrom == null ? candidates : candidates.filter((c) => c.van === partialFrom && partialPath.every((v, idx) => c.pad[idx] === v));
      if (relevant.length !== 1) return;
      commitZet(relevant[0]);
    }
  }

  function handleClick(evt) {
    const target = evt.target.closest("[data-field]");
    if (!target) return;
    const field = Number.parseInt(target.dataset.field, 10);
    if (!isValidField(field)) return;

    const { bord: b, beurt: t } = huidigeStand();
    const candidates = getLegalMoves(b, t);

    if (partialFrom == null) {
      if (ownFieldsWithMoves(candidates).has(field)) {
        partialFrom = field;
        partialPath = [];
        autoCompleteIfForced();
        render();
        return;
      }
      const landing = candidates.filter((c) => c.pad[c.pad.length - 1] === field);
      if (landing.length === 1) {
        commitZet(landing[0]);
        autoCompleteIfForced();
      }
      return;
    }

    if (field === partialFrom) {
      resetPartial();
      render();
      return;
    }
    if (ownFieldsWithMoves(candidates).has(field) && !nextTargets(candidates).targets.has(field)) {
      partialFrom = field;
      partialPath = [];
      autoCompleteIfForced();
      render();
      return;
    }

    const { targets } = nextTargets(candidates);
    if (!targets.has(field)) return;
    partialPath = [...partialPath, field];
    autoCompleteIfForced();
    render();
  }

  firstBtn.addEventListener("click", eersteZet);
  prevBtn.addEventListener("click", vorigeZet);
  nextBtn.addEventListener("click", volgendeZet);
  lastBtn.addEventListener("click", laatsteZet);

  commentaarHost.addEventListener("input", () => {
    const knoop = huidigeKnoop();
    if (huidigPad.length === 0) return; // de beginstand zelf heeft geen zet om te annoteren
    knoop.commentaar = commentaarHost.value;
    onChange?.();
  });
  tekenHost.addEventListener("change", () => {
    const knoop = huidigeKnoop();
    if (huidigPad.length === 0) return;
    knoop.teken = tekenHost.value;
    onChange?.();
    render(); // teken staat ook in de notatie zelf
  });
  verwijderBtn.addEventListener("click", () => {
    if (huidigPad.length === 0) return;
    const ouder = ouderVanHuidige();
    const knoop = huidigeKnoop();
    if (!confirm("Deze zet (en alles wat erna komt, in deze tak) verwijderen?")) return;
    ouder.kinderen = ouder.kinderen.filter((k) => k.id !== knoop.id);
    huidigPad = huidigPad.slice(0, -1);
    resetPartial();
    onChange?.();
    render();
  });

  function render() {
    const { bord: huidigBord } = huidigeStand();
    boardHost.innerHTML = renderDiagramSVG(huidigBord, { size: 320 });
    const svg = boardHost.querySelector("svg");
    svg.style.touchAction = "manipulation";
    svg.style.userSelect = "none";
    svg.style.cursor = "pointer";
    svg.addEventListener("click", handleClick);
    const { bord: b, beurt: t } = huidigeStand();
    const candidates = getLegalMoves(b, t);
    drawMarkers(svg, candidates);

    if (partialFrom != null) {
      statusHost.textContent = "Kies het volgende veld (of klik nogmaals op het gekozen stuk om te annuleren).";
    } else if (candidates.length === 0) {
      statusHost.textContent = "Geen zetten meer mogelijk vanaf deze stand.";
    } else {
      statusHost.textContent = `Klik op het bord om hier een zet toe te voegen (${huidigeKnoop().kinderen.length > 0 ? "wordt een variant" : "wordt de voortzetting"}).`;
    }

    notationHost.innerHTML = bouwNotatieHtml(wortel, beurt, huidigPad);
    for (const el of notationHost.querySelectorAll("[data-pad]")) {
      el.addEventListener("click", () => ga(el.dataset.pad.split(",")));
    }

    const knoop = huidigeKnoop();
    commentaarHost.value = huidigPad.length === 0 ? "" : knoop.commentaar ?? "";
    commentaarHost.disabled = huidigPad.length === 0;
    commentaarHost.placeholder = huidigPad.length === 0 ? "Selecteer eerst een zet in de notatie." : "";
    tekenHost.value = huidigPad.length === 0 ? "" : knoop.teken ?? "";
    tekenHost.disabled = huidigPad.length === 0;
    verwijderBtn.disabled = huidigPad.length === 0;

    firstBtn.disabled = huidigPad.length === 0;
    prevBtn.disabled = huidigPad.length === 0;
    nextBtn.disabled = knoop.kinderen.length === 0;
    lastBtn.disabled = knoop.kinderen.length === 0;
  }

  render();
}
