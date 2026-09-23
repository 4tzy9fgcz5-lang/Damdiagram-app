import { createStartBoard } from "../core/board.js?v=20260923k";
import { leesPartijTekst } from "../core/pdn.js?v=20260923k";
import { savePartij, getPartij } from "../db/partijen.js?v=20260923k";
import { createZettenboomPlayer } from "./zettenboomPlayer.js?v=20260923k";

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

// Fase 2, stap 2 (uitbreiding): een partij invoeren. `partijId` gegeven -> bewerkt een bestaande
// partij (het plakvak begint dan leeg; "Lees in en toon" vervangt de boom pas als je zelf iets
// plakt — een keer opslaan zonder te plakken laat de bestaande boom dus met rust). Hergebruikt
// dezelfde tekstlezer (`pdn.js`) en viewer (`zettenboomPlayer.js`) als het proefscherm uit fase 1.
export async function renderPartijInvoer(container, { partijId, onSaved, onCancel } = {}) {
  const bestaand = partijId ? await getPartij(partijId) : null;
  let huidigeBoom = bestaand?.wortel ?? null;

  container.innerHTML = `
    <h2>${bestaand ? "Partij bewerken" : "Nieuwe partij"}</h2>
    <div class="card">
      <label>Wit</label>
      <input type="text" data-field="wit" />
      <label>Zwart</label>
      <input type="text" data-field="zwart" />
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">
          <label>Datum</label>
          <input type="text" data-field="datum" placeholder="jjjj-mm-dd" />
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Uitslag</label>
          <input type="text" data-field="uitslag" placeholder="1-0 / 0-1 / ½-½" />
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">
          <label>Toernooi</label>
          <input type="text" data-field="toernooi" />
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Ronde</label>
          <input type="text" data-field="ronde" />
        </div>
      </div>
      <label>Bron</label>
      <input type="text" data-field="bron" placeholder="boek, tijdschrift of website" />
      <label>Notities</label>
      <textarea data-field="notities" rows="2"></textarea>
    </div>
    <div class="card">
      <label>Partijtekst</label>
      <p style="font-size:0.85rem;color:#666;margin-top:0;">
        Plak hier alleen de zetten (begint met "1. ..."), met eventueel <code>{commentaar}</code>
        en geneste <code>(varianten)</code>. Spelersnamen en datum vul je hierboven in — een
        kopregel ervoor (zoals damkunst.nl die toont) wordt vanzelf overgeslagen.
      </p>
      <textarea data-role="tekst" rows="6" style="width:100%;font-family:ui-monospace,monospace;"></textarea>
      <div class="button-row">
        <button type="button" class="secondary" data-action="lees-in">Lees in en toon</button>
      </div>
      <div data-role="meldingen"></div>
      <div data-role="speler" style="margin-top:1rem;"></div>
    </div>
    <div class="button-row">
      <button type="button" class="primary" data-action="opslaan">Opslaan</button>
      <button type="button" class="secondary" data-action="annuleren">Annuleren</button>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  if (bestaand) {
    el('[data-field="wit"]').value = bestaand.wit;
    el('[data-field="zwart"]').value = bestaand.zwart;
    el('[data-field="datum"]').value = bestaand.datum;
    el('[data-field="uitslag"]').value = bestaand.uitslag;
    el('[data-field="toernooi"]').value = bestaand.toernooi;
    el('[data-field="ronde"]').value = bestaand.ronde;
    el('[data-field="bron"]').value = bestaand.bron;
    el('[data-field="notities"]').value = bestaand.notities;
  }

  function toonSpeler(boom) {
    const spelerHost = el('[data-role="speler"]');
    spelerHost.innerHTML = "";
    if (!boom || boom.kinderen.length === 0) return;
    createZettenboomPlayer(spelerHost, { wortel: boom, bord: createStartBoard(), beurt: "white" });
  }
  if (huidigeBoom) toonSpeler(huidigeBoom);

  el('[data-action="lees-in"]').addEventListener("click", () => {
    const { boom, meldingen } = leesPartijTekst(el('[data-role="tekst"]').value);
    toonMeldingen(el('[data-role="meldingen"]'), meldingen);
    huidigeBoom = boom;
    toonSpeler(boom);
  });

  el('[data-action="opslaan"]').addEventListener("click", async () => {
    const saved = await savePartij({
      id: bestaand?.id,
      wit: el('[data-field="wit"]').value.trim(),
      zwart: el('[data-field="zwart"]').value.trim(),
      datum: el('[data-field="datum"]').value.trim(),
      uitslag: el('[data-field="uitslag"]').value.trim(),
      toernooi: el('[data-field="toernooi"]').value.trim(),
      ronde: el('[data-field="ronde"]').value.trim(),
      bron: el('[data-field="bron"]').value.trim(),
      notities: el('[data-field="notities"]').value.trim(),
      wortel: huidigeBoom ?? undefined,
    });
    onSaved?.(saved);
  });
  el('[data-action="annuleren"]').addEventListener("click", () => onCancel?.());
}
