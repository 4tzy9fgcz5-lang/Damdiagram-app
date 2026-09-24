import { createStartBoard } from "../core/board.js?v=20260925b";
import { parseFen } from "../core/fen.js?v=20260925b";
import { leesPartijTekst } from "../core/pdn.js?v=20260925b";
import { boomVanPlatteOplossing } from "../core/zettenboom.js?v=20260925b";
import { listStanden } from "../db/standen.js?v=20260925b";
import { createZettenboomPlayer } from "./zettenboomPlayer.js?v=20260925b";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const MELDING_KLASSE = { fout: "kleur-fout", "let-op": "kleur-waarschuwing", info: "kleur-info" };

function toonMeldingen(host, meldingen) {
  if (meldingen.length === 0) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<ul class="boom-proef-meldingen">${meldingen
    .map((m) => `<li class="${MELDING_KLASSE[m.type] ?? ""}">${escapeHtml(m.tekst)}</li>`)
    .join("")}</ul>`;
}

// Voorproefje van de boom-viewer (fase 1, stap 4 van de uitbreiding — zie CLAUDE.md): nog geen
// echte "partijen"/"studies" in de app (dat komt in fase 2/3), maar hiermee is nu al te
// controleren of geplakte partij-/studietekst (src/core/pdn.js) goed wordt ingelezen én goed
// wordt getoond/afgespeeld — en, als tweede controle, of een BESTAANDE stand met zijvarianten er
// via de omzetting uit stap 1 hetzelfde uitziet als in de gewone afspeler.
export async function renderZettenboomProef(container) {
  container.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;">Een partij invoeren en opslaan</h3>
      <p style="font-size:0.85rem;color:#666;">
        Dit hieronder is puur een proefscherm (leest niets, slaat niets op). Wil je een partij
        echt bewaren, met spelersnamen/toernooi erbij? Ga naar het tabblad "Partijen" bovenaan, of
        meteen naar <a href="#/partij-nieuw">Nieuwe partij</a>.
      </p>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Partij-/studietekst plakken (proef, niet opgeslagen)</h3>
      <p style="font-size:0.85rem;color:#666;">
        Plak tekst met zetnummers, <code>{commentaar}</code> en (geneste) <code>(varianten)</code> —
        zoals bij damkunst.nl, of zoals een boekfragment dat je zo hebt overgetikt of laten
        herschrijven. Begint de tekst niet vanaf de gewone beginopstelling, dan wordt de eerste zet
        vrijwel zeker afgekeurd — geef dan zelf een andere beginstand mee (nog niet in dit
        proefscherm, wel al mogelijk in de code). Een kopregel met spelersnamen/datum vóór de
        eerste zet (zoals damkunst.nl die toont) wordt automatisch overgeslagen.
      </p>
      <textarea data-role="tekst" rows="6" style="width:100%;font-family:ui-monospace,monospace;"></textarea>
      <div class="button-row">
        <button type="button" class="primary" data-action="lees-in">Lees in en toon</button>
      </div>
      <div data-role="meldingen"></div>
      <div data-role="speler-tekst" style="margin-top:1rem;"></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Of: een bestaande stand met zijvarianten</h3>
      <p style="font-size:0.85rem;color:#666;">
        Ter controle: dezelfde boom-viewer, maar dan gevuld vanuit een stand die je al hebt
        ingevoerd (via de omzetting uit stap 1) — moet er hetzelfde uitzien als op de gewone
        standpagina.
      </p>
      <select data-role="stand-kiezer"><option value="">Kies een stand…</option></select>
      <div data-role="speler-stand" style="margin-top:1rem;"></div>
    </div>
  `;

  const tekstVeld = container.querySelector('[data-role="tekst"]');
  const meldingenHost = container.querySelector('[data-role="meldingen"]');
  const spelerTekstHost = container.querySelector('[data-role="speler-tekst"]');
  container.querySelector('[data-action="lees-in"]').addEventListener("click", () => {
    const { boom, meldingen } = leesPartijTekst(tekstVeld.value);
    toonMeldingen(meldingenHost, meldingen);
    spelerTekstHost.innerHTML = "";
    if (boom.kinderen.length === 0 && meldingen.every((m) => m.type !== "fout")) return;
    createZettenboomPlayer(spelerTekstHost, { wortel: boom, bord: createStartBoard(), beurt: "white" });
  });

  const kiezer = container.querySelector('[data-role="stand-kiezer"]');
  const spelerStandHost = container.querySelector('[data-role="speler-stand"]');
  const standen = (await listStanden()).filter((s) => s.zijvarianten?.length > 0);
  kiezer.innerHTML += standen
    .map((s) => `<option value="${s.id}">${escapeHtml(s.opdracht || s.publicatie || s.id)} (${s.zijvarianten.length} zijvariant(en))</option>`)
    .join("");
  if (standen.length === 0) {
    kiezer.disabled = true;
    kiezer.innerHTML = '<option value="">(geen standen met zijvarianten in je database)</option>';
  }
  kiezer.addEventListener("change", () => {
    spelerStandHost.innerHTML = "";
    const stand = standen.find((s) => s.id === kiezer.value);
    if (!stand) return;
    const { board, turn } = parseFen(stand.fen);
    const boom = boomVanPlatteOplossing(stand);
    createZettenboomPlayer(spelerStandHost, { wortel: boom, bord: board, beurt: turn });
  });
}
