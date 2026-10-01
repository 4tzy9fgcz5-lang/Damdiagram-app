import { listStencils, saveStencil } from "../db/stencils.js?v=20261001d";
import { listStanden } from "../db/standen.js?v=20261001d";
import { getAllCategorieen } from "../db/categorieen.js?v=20261001d";
import { autoOpdracht } from "../stencil/compose.js?v=20261001d";
import { PAGINA_OPTIES } from "../stencil/layout.js?v=20261001d";
import { renderDiagramSVG } from "../diagram/render.js?v=20261001d";
import { parseFen } from "../core/fen.js?v=20261001d";
import { formatMoeilijkheid } from "./starRating.js?v=20261001d";
import {
  VERDELING_OPTIES,
  niveausTussen,
  verdeelAantal,
  kiesReeks,
  verdeelReeks,
  standIdsInProgramma,
} from "../stencil/genereer.js?v=20261001d";

export async function renderStencilGenerateView(container, { onCreated, onBack } = {}) {
  const [categorieen, alleStencils] = await Promise.all([getAllCategorieen(), listStencils()]);
  const programmaNamen = [...new Set(alleStencils.map((s) => (s.programma ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "nl")
  );
  const sterOpties = [1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} ${n === 1 ? "ster" : "sterren"}</option>`).join("");

  container.innerHTML = `
    <button type="button" class="secondary" data-action="back" style="margin-bottom:0.75rem;">&#8592; Terug naar overzicht</button>
    <h2>Opgaveblad laten samenstellen</h2>
    <div class="card">
      <div class="field-row">
        <div>
          <label>Titel</label>
          <input type="text" data-field="titel" value="Opgaveblad" />
        </div>
        <div>
          <label>Aantal diagrammen per blad</label>
          <input type="number" data-field="aantal" min="1" max="60" value="12" />
        </div>
        <div>
          <label>Aantal bladen</label>
          <input type="number" data-field="bladen" min="1" max="20" value="1" />
        </div>
      </div>
      <label>Trainingsprogramma (optioneel)</label>
      <input type="text" data-field="programma" list="gen-programma-opties" placeholder="bijv. de club of speler voor wie je een reeks bladen maakt" />
      <datalist id="gen-programma-opties">${programmaNamen.map((n) => `<option value="${escapeAttr(n)}"></option>`).join("")}</datalist>
      <p data-role="programma-info" style="color:#666;font-size:0.85rem;margin:0.25rem 0 0;"></p>
      <label>Clubnaam (optioneel)</label>
      <input type="text" data-field="club" />
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Welke standen?</h3>
      <div class="field-row">
        <div>
          <label>Moeilijkheid van</label>
          <select data-field="min">${sterOpties}</select>
        </div>
        <div>
          <label>tot en met</label>
          <select data-field="max">${sterOpties}</select>
        </div>
      </div>
      <p style="color:#666;font-size:0.85rem;margin:0.25rem 0 0;">Een halve ster telt bij de hele ster eronder (2 en 2,5 sterren zijn samen niveau 2). Standen zonder sterren worden overgeslagen.</p>
      <div class="field-row" data-role="categorieen" style="margin-top:0.5rem;"></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Verdeling over de niveaus</h3>
      <select data-field="verdeling">
        ${VERDELING_OPTIES.map((o) => `<option value="${o.key}">${o.label}</option>`).join("")}
      </select>
      <div data-role="zelf" class="field-row" style="display:none;margin-top:0.5rem;"></div>
      <p data-role="verdeling-tekst" style="font-size:0.9rem;margin:0.5rem 0 0;"></p>
      <label style="display:flex;gap:0.5rem;align-items:center;margin-top:0.75rem;">
        <input type="checkbox" data-field="aanvullen" style="width:auto;" />
        Bij een tekort aanvullen uit het dichtstbijzijnde niveau
      </label>
    </div>

    <div class="card">
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="samenstellen">Samenstellen</button>
      </div>
      <div data-role="resultaat" style="margin-top:1rem;"></div>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);
  el('[data-action="back"]').addEventListener("click", () => onBack?.());
  el('[data-field="min"]').value = "1";
  el('[data-field="max"]').value = "4";

  // Categorie-keuzevakken (zelfde categorieën als in de database).
  const catHost = el('[data-role="categorieen"]');
  for (const c of categorieen) {
    if (!c.waarden.length) continue;
    const wrap = document.createElement("div");
    wrap.innerHTML = `<label>${escapeHtml(c.label)}</label>
      <select data-cat="${escapeAttr(c.key)}">
        <option value="">(alle)</option>
        ${c.waarden.map((w) => `<option value="${escapeAttr(w)}">${escapeHtml(w)}</option>`).join("")}
      </select>`;
    catHost.appendChild(wrap);
  }

  const veld = (naam) => el(`[data-field="${naam}"]`);
  const niveaus = () => {
    const min = Number(veld("min").value);
    const max = Number(veld("max").value);
    return niveausTussen(Math.min(min, max), Math.max(min, max));
  };
  const handmatig = {};

  const aantalBladen = () => Math.max(1, Math.min(20, Math.floor(Number(veld("bladen").value) || 1)));

  // Verdeling van één blad (bij "oplopend" is dat het gemiddelde: gelijkmatig).
  function huidigeAantallen() {
    const modus = veld("verdeling").value;
    return verdeelAantal(Number(veld("aantal").value) || 0, niveaus(), modus === "oplopend" ? "gelijk" : modus, handmatig);
  }

  // Verdeling per blad: bij "oplopend" schuift elk blad op naar moeilijker, anders is elk blad gelijk.
  function aantallenPerBlad() {
    const n = aantalBladen();
    if (veld("verdeling").value === "oplopend") return verdeelReeks(n, Number(veld("aantal").value) || 0, niveaus());
    return Array.from({ length: n }, () => huidigeAantallen());
  }

  function werkVerdelingBij() {
    const modus = veld("verdeling").value;
    const nv = niveaus();
    const zelfHost = el('[data-role="zelf"]');
    zelfHost.style.display = modus === "zelf" ? "" : "none";
    veld("aantal").readOnly = modus === "zelf";
    if (modus === "zelf") {
      zelfHost.innerHTML = nv
        .map(
          (n) => `<div><label>${n} ${n === 1 ? "ster" : "sterren"}</label>
            <input type="number" min="0" max="60" data-zelf="${n}" value="${handmatig[n] ?? 0}" /></div>`
        )
        .join("");
      zelfHost.querySelectorAll("[data-zelf]").forEach((inp) =>
        inp.addEventListener("input", () => {
          handmatig[inp.dataset.zelf] = Math.max(0, Math.floor(Number(inp.value) || 0));
          werkZelfTotaalBij();
        })
      );
      veld("aantal").value = String(nv.reduce((som, n) => som + (handmatig[n] ?? 0), 0));
    }
    toonVerdelingTekst();
  }

  function toonVerdelingTekst() {
    const nv = niveaus();
    const reeks = aantallenPerBlad();
    const regel = (aant) => nv.map((n) => `${n}★ ${aant[n]}`).join(" · ");
    el('[data-role="verdeling-tekst"]').innerHTML =
      reeks.length > 1 && veld("verdeling").value === "oplopend"
        ? reeks.map((aant, i) => `Blad ${i + 1}: ${regel(aant)}`).join("<br>")
        : "Verdeling per blad: " + regel(reeks[0]);
  }

  // Bij "zelf bepalen": alleen het totaal bijwerken, niet de invoervakjes opnieuw tekenen (anders raak je de focus kwijt).
  function werkZelfTotaalBij() {
    const nv = niveaus();
    veld("aantal").value = String(nv.reduce((som, n) => som + (handmatig[n] ?? 0), 0));
    toonVerdelingTekst();
  }

  veld("verdeling").addEventListener("change", werkVerdelingBij);
  veld("aantal").addEventListener("input", werkVerdelingBij);
  veld("bladen").addEventListener("input", () => {
    // Bij meer bladen is "oplopend" de logische keuze; terug naar 1 blad: weer gelijkmatig.
    if (aantalBladen() > 1 && veld("verdeling").value === "gelijk") veld("verdeling").value = "oplopend";
    else if (aantalBladen() === 1 && veld("verdeling").value === "oplopend") veld("verdeling").value = "gelijk";
    werkVerdelingBij();
  });
  veld("min").addEventListener("change", werkVerdelingBij);
  veld("max").addEventListener("change", werkVerdelingBij);
  werkVerdelingBij();

  function werkProgrammaInfoBij() {
    const naam = veld("programma").value.trim();
    const n = standIdsInProgramma(alleStencils, naam).size;
    el('[data-role="programma-info"]').textContent = naam
      ? n > 0
        ? `${n} stand(en) staan al in eerdere bladen van dit programma en worden niet opnieuw gekozen.`
        : "Nog geen eerdere bladen in dit programma."
      : "Zonder programma kan dezelfde stand op meerdere bladen terugkomen.";
  }
  veld("programma").addEventListener("input", werkProgrammaInfoBij);
  werkProgrammaInfoBij();

  let voorstel = null;
  const resultaat = el('[data-role="resultaat"]');

  async function samenstellen() {
    const filters = { categorieen: {} };
    container.querySelectorAll("[data-cat]").forEach((sel) => {
      if (sel.value) filters.categorieen[sel.dataset.cat] = { waarde: sel.value };
    });
    const kandidaten = await listStanden(filters);
    const programma = veld("programma").value.trim();
    const uitgesloten = standIdsInProgramma(await listStencils(), programma);
    const perBlad = aantallenPerBlad();
    const gevraagd = perBlad.map((a) => Object.values(a).reduce((x, y) => x + y, 0));
    if (gevraagd.every((g) => g === 0)) {
      resultaat.innerHTML = `<p style="color:#a30000;">Kies eerst hoeveel diagrammen je wilt.</p>`;
      voorstel = null;
      return;
    }
    voorstel = kiesReeks({ standen: kandidaten, uitgesloten, aantallenPerBlad: perBlad, aanvullen: veld("aanvullen").checked });
    toonVoorstel(gevraagd, kandidaten.length);
  }

  function toonVoorstel(gevraagd, aantalKandidaten) {
    const bladen = voorstel;
    const meer = bladen.length > 1;
    const totaalGekozen = bladen.reduce((som, r) => som + r.gekozen.length, 0);
    const totaalGevraagd = gevraagd.reduce((a, b) => a + b, 0);
    const sterren = (n) => `${n} ${n === 1 ? "ster" : "sterren"}`;
    const meldingenVan = (v, i) => {
      const voor = meer ? `Blad ${i + 1}: ` : "";
      const lijst = [];
      for (const t of v.tekorten) lijst.push(`${voor}van ${sterren(t.niveau)} zijn er maar ${t.beschikbaar} beschikbaar (${t.gevraagd} gevraagd).`);
      if (v.aangevuld > 0) lijst.push(`${voor}${v.aangevuld} diagram(men) aangevuld uit een naastliggend niveau.`);
      return lijst;
    };
    const meldingen = bladen.flatMap(meldingenVan);
    if (bladen.some((r) => r.tekorten.length) && !veld("aanvullen").checked) {
      meldingen.push(`Vink "Bij een tekort aanvullen" aan en klik opnieuw op Samenstellen om de rest uit het niveau ernaast te halen.`);
    }
    // Overgeslagen standen: alleen de eerste meting telt (de rest komt door standen die al op een eerder blad van deze reeks staan).
    if (bladen[0].uitgeslotenAantal > 0) meldingen.push(`${bladen[0].uitgeslotenAantal} stand(en) overgeslagen omdat ze al in dit programma gebruikt zijn.`);
    if (bladen[0].zonderSterren > 0) meldingen.push(`${bladen[0].zonderSterren} stand(en) zonder sterren overgeslagen.`);

    resultaat.innerHTML = `
      <p><strong>${totaalGekozen} van ${totaalGevraagd} diagrammen gevonden</strong>${meer ? ` over ${bladen.length} bladen` : ""} (uit ${aantalKandidaten} passende standen).</p>
      ${meldingen.length ? `<ul style="color:#8a5a00;">${meldingen.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>` : ""}
      <div data-role="bladen"></div>
      <div class="button-row">
        <button type="button" class="secondary" data-action="opnieuw">Opnieuw schudden</button>
        <button type="button" class="primary" data-action="aanmaken" ${totaalGekozen ? "" : "disabled"}>${meer ? `${bladen.length} opgavebladen aanmaken` : "Opgaveblad aanmaken"}</button>
      </div>`;
    const host = resultaat.querySelector('[data-role="bladen"]');
    bladen.forEach((v, bi) => {
      if (meer) {
        const kop = document.createElement("h4");
        kop.textContent = `Blad ${bi + 1} — ${v.gekozen.length} diagram(men)`;
        kop.style.margin = "1rem 0 0.4rem";
        host.appendChild(kop);
      }
      const grid = document.createElement("div");
      grid.className = "stand-grid";
      v.gekozen.forEach((s, i) => {
        const card = document.createElement("div");
        card.className = "stand-card";
        card.innerHTML = `<div style="font-weight:700;">${i + 1}. <span style="font-weight:400;color:#666;">${formatMoeilijkheid(s.moeilijkheid)}★</span></div>${renderDiagramSVG(parseFen(s.fen).board, { size: 120 })}`;
        grid.appendChild(card);
      });
      host.appendChild(grid);
    });
    resultaat.querySelector('[data-action="opnieuw"]').addEventListener("click", samenstellen);
    resultaat.querySelector('[data-action="aanmaken"]').addEventListener("click", aanmaken);
  }

  async function aanmaken() {
    const bladen = (voorstel ?? []).filter((r) => r.gekozen.length);
    if (!bladen.length) return;
    const basis = veld("titel").value.trim() || "Opgaveblad";
    const meer = voorstel.length > 1;
    let eerste = null;
    for (let i = 0; i < voorstel.length; i++) {
      const gekozen = voorstel[i].gekozen;
      if (!gekozen.length) continue;
      const perPagina = PAGINA_OPTIES.find((n) => n >= gekozen.length) ?? Math.max(...PAGINA_OPTIES);
      const saved = await saveStencil({
        titel: meer ? `${basis} ${i + 1}` : basis,
        programma: veld("programma").value.trim(),
        club: veld("club").value.trim(),
        perPagina,
        standen: gekozen.map((s) => ({ standId: s.id, opdracht: autoOpdracht(s) })),
      });
      eerste ??= saved.id;
    }
    // Eén blad: meteen openen; een reeks: terug naar het overzicht waar ze allemaal staan.
    onCreated?.(meer ? null : eerste);
  }

  el('[data-action="samenstellen"]').addEventListener("click", samenstellen);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
