import { renderDiagramSVG } from "../diagram/render.js?v=20260923n";
import { plyColor, plyMoveNumber } from "../core/draughtsMoves.js?v=20260923n";
import { knoopOpPad, standBijPad, notatieMetVoorloopnul } from "../core/zettenboom.js?v=20260923n";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function samePad(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// Bouwt de hele boom als klikbare HTML-notatie: de hoofdlijn (steeds het eerste kind van een
// knoop) gewoon achter elkaar, en elke andere kant (variant) direct ná de zet die hij vervangt,
// tussen haakjes — precies de plek waar `src/core/pdn.js` zo'n `(...)` ook weer terugverwacht.
// Varianten mogen zelf weer varianten hebben (onbeperkt genest, zie CLAUDE.md); deze functie is
// dus recursief, in tegenstelling tot de gelijknamige opbouw in `solutionPlayer.js` (die maar één
// laag zijvarianten kent). Commentaar bij een zet staat er direct achter, tussen accolades.
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
    // Een <div> (blok-element) i.p.v. een <span>: begint vanzelf op een eigen regel, ook al
    // staat hij tussen de andere, inline zet-<span>s in dezelfde lopende tekst — precies wat Jan
    // vroeg (zoals bij damkunst.nl: commentaar op een eigen regel, niet tussen haakjes/accolades
    // midden in de zetten).
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
      schrijfZet(variantKind, variantPad, true); // altijd het zetnummer erbij: context ontbreekt hier
      schrijfReeks(variantKind, variantPad);
      stukken.push(")</span>");
    }
    schrijfReeks(hoofdKind, hoofdPad);
  }

  schrijfReeks(wortel, []);
  return stukken.length ? stukken.join(" ") : '<span class="solution-empty">Nog geen zetten.</span>';
}

// Alleen-lezen weergave van een hele zettenboom (stap 1-3 van de uitbreiding): bord +
// pijltjesnavigatie zoals `solutionPlayer.js`, met ernaast de volledige, klikbare notatie —
// hoofdlijn én alle varianten (ook genest), met commentaar. "Vorige"/"Volgende" stappen één zet
// op de tak waar je nu op staat; "Eerste"/"Laatste" gaan naar het begin/eind van DIE tak (sta je
// in een variant, dan blijft "Laatste" in die variant — niet terug naar de hoofdlijn). Op elke
// zet in de notatie klikken (ook diep in een variant) springt er direct naartoe.
export function createZettenboomPlayer(container, { wortel, bord, beurt, startPad = [] } = {}) {
  let huidigPad = knoopOpPad(wortel, startPad) ? [...startPad] : [];
  let keydownHandler = null;

  function stopListeningForKeys() {
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
  }

  function ga(nieuwPad) {
    if (!knoopOpPad(wortel, nieuwPad)) return; // bestaat niet (meer) — niets doen i.p.v. crashen
    huidigPad = nieuwPad;
    draw();
  }

  function eersteZet() {
    ga([]);
  }
  function laatsteZet() {
    let knoop = knoopOpPad(wortel, huidigPad);
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
    const knoop = knoopOpPad(wortel, huidigPad);
    if (knoop.kinderen.length > 0) ga([...huidigPad, knoop.kinderen[0].id]);
  }

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
      </div>
      <div class="boom-notation-col">
        <div data-role="notation" class="solution-notation-text"></div>
      </div>
    </div>
  `;
  const boardHost = container.querySelector('[data-role="board"]');
  const notationHost = container.querySelector('[data-role="notation"]');
  const firstBtn = container.querySelector('[data-action="first"]');
  const prevBtn = container.querySelector('[data-action="prev"]');
  const nextBtn = container.querySelector('[data-action="next"]');
  const lastBtn = container.querySelector('[data-action="last"]');
  firstBtn.addEventListener("click", eersteZet);
  prevBtn.addEventListener("click", vorigeZet);
  nextBtn.addEventListener("click", volgendeZet);
  lastBtn.addEventListener("click", laatsteZet);

  function draw() {
    const { bord: huidigBord } = standBijPad(wortel, bord, beurt, huidigPad);
    boardHost.innerHTML = renderDiagramSVG(huidigBord, { size: 320 });

    notationHost.innerHTML = bouwNotatieHtml(wortel, beurt, huidigPad);
    for (const el of notationHost.querySelectorAll("[data-pad]")) {
      el.addEventListener("click", () => ga(el.dataset.pad.split(",")));
    }

    const huidigeKnoop = knoopOpPad(wortel, huidigPad);
    firstBtn.disabled = huidigPad.length === 0;
    prevBtn.disabled = huidigPad.length === 0;
    nextBtn.disabled = huidigeKnoop.kinderen.length === 0;
    lastBtn.disabled = huidigeKnoop.kinderen.length === 0;
  }

  draw();

  stopListeningForKeys();
  keydownHandler = (e) => {
    if (!container.isConnected) {
      stopListeningForKeys();
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      vorigeZet();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      volgendeZet();
    }
  };
  document.addEventListener("keydown", keydownHandler);
}
