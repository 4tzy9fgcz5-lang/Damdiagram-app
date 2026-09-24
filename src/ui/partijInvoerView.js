import { createStartBoard } from "../core/board.js?v=20260925a";
import { leesPartijTekst } from "../core/pdn.js?v=20260925a";
import { splitNaam } from "../core/namen.js?v=20260925a";
import { savePartij, getPartij } from "../db/partijen.js?v=20260925a";
import { getAllCategorieen } from "../db/categorieen.js?v=20260925a";
import { getList, addListValue } from "../db/lijsten.js?v=20260925a";
import { createZettenboomPlayer } from "./zettenboomPlayer.js?v=20260925a";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toggleInArray(arr, value) {
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else arr.splice(idx, 1);
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

// Van een toernooibase-partijlink (zoals je 'm uit de adresbalk kopieert, bv.
// "https://toernooibase.kndb.nl/opvraag/applet.php?taal=&kl=23&Id=49298&r=6&jr=27&wed=1822848
// &layout=full") naar de link met de kale partijtekst (PDN, incl. namen/toernooi/datum/uitslag
// als kopregels) — uitgezocht op 2026-09-23 (CLAUDE.md-feedback): die partijtekst kan de app zelf
// niet inlezen (toernooibase staat dat niet toe vanuit een andere website, een browserbeperking,
// geen bug), dus dit bouwt alleen de link; Jan opent 'm zelf, kopieert de tekst en plakt die
// hieronder. Geeft `null` bij een link die geen toernooibase-partijlink is.
function toernooibasePdnLink(ruweLink) {
  let url;
  try {
    url = new URL(ruweLink.trim());
  } catch {
    return null;
  }
  if (!url.hostname.endsWith("toernooibase.kndb.nl")) return null;
  const p = url.searchParams;
  if (!p.get("Id") || !p.get("wed")) return null;
  const pdnParams = new URLSearchParams({
    taal: p.get("taal") ?? "",
    kl: p.get("kl") ?? "",
    Id: p.get("Id") ?? "",
    r: p.get("r") ?? "",
    jr: p.get("jr") ?? "",
    wed: p.get("wed") ?? "",
    weda: "",
    zetten: "",
    aav: "",
    pdn: "",
  });
  return `https://toernooibase.kndb.nl/applet/oerterpapplet2.0/pdn/getPDN.php?${pdnParams.toString()}`;
}

// Fase 2, stap 2 (uitbreiding); bijgewerkt 2026-09-23 (CLAUDE.md-feedback) met makkelijker
// importeren: een partij invoeren. `partijId` gegeven -> bewerkt een bestaande partij (het
// plakvak begint dan leeg; "Lees in en toon" vervangt de boom pas als je zelf iets plakt — een
// keer opslaan zonder te plakken laat de bestaande boom dus met rust). Hergebruikt dezelfde
// tekstlezer (`pdn.js`) en viewer (`zettenboomPlayer.js`) als het proefscherm uit fase 1.
export async function renderPartijInvoer(container, { partijId, onSaved, onCancel } = {}) {
  const bestaand = partijId ? await getPartij(partijId) : null;
  let huidigeBoom = bestaand?.wortel ?? null;

  container.innerHTML = `
    <h2>${bestaand ? "Partij bewerken" : "Nieuwe partij"}</h2>
    <div class="card">
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">
          <label>Wit — voornaam</label>
          <input type="text" data-field="witVoornaam" />
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Wit — achternaam</label>
          <input type="text" data-field="witAchternaam" />
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">
          <label>Zwart — voornaam</label>
          <input type="text" data-field="zwartVoornaam" />
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Zwart — achternaam</label>
          <input type="text" data-field="zwartAchternaam" />
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">
          <label>Datum</label>
          <input type="text" data-field="datum" placeholder="jjjj-mm-dd" />
        </div>
        <div style="flex:1;min-width:140px;">
          <label>Uitslag</label>
          <select data-field="uitslag">
            <option value="">(onbekend)</option>
            <option value="2-0">2-0 (wit wint)</option>
            <option value="1-1">1-1 (remise)</option>
            <option value="0-2">0-2 (zwart wint)</option>
          </select>
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
      <div data-role="categorieen"></div>
      <label>Bron</label>
      <input type="text" data-field="bron" placeholder="boek, tijdschrift of website" />
      <label>Notities</label>
      <textarea data-field="notities" rows="2"></textarea>
    </div>
    <div class="card">
      <label>Link van toernooibase (optioneel)</label>
      <p style="font-size:0.85rem;color:#666;margin-top:0;">
        Plak hier de link uit je adresbalk als je op toernooibase een partij bekijkt. De app kan
        die pagina niet zelf uitlezen (dat staat toernooibase niet toe vanuit een andere
        website), maar maakt er wel een link van naar de kale partijtekst — die open je zelf,
        de tekst daarin kopieer (Ctrl/Cmd+A, dan kopiëren) en plak je hieronder in het plakvak.
      </p>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
        <input type="text" data-field="toernooibase-link" placeholder="https://toernooibase.kndb.nl/..." style="flex:1;min-width:220px;" />
        <button type="button" class="secondary" data-action="toernooibase-link">Open partijtekst</button>
      </div>
      <p data-role="toernooibase-status" style="font-size:0.85rem;margin:0.4rem 0 0;"></p>
    </div>
    <div class="card">
      <label>Partijtekst</label>
      <p style="font-size:0.85rem;color:#666;margin-top:0;">
        Plak hier de partijtekst: zetten (begint met "1. ..."), eventueel <code>{commentaar}</code>
        en geneste <code>(varianten)</code>. Staan er <code>[White "..."]</code>-achtige
        kopregels bij (zoals uit toernooibase of een ander PDN-bestand), dan vult "Lees in en
        toon" de velden hierboven — als die er nog leeg bij staan — meteen mee in.
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
    el('[data-field="witVoornaam"]').value = bestaand.witVoornaam;
    el('[data-field="witAchternaam"]').value = bestaand.witAchternaam;
    el('[data-field="zwartVoornaam"]').value = bestaand.zwartVoornaam;
    el('[data-field="zwartAchternaam"]').value = bestaand.zwartAchternaam;
    el('[data-field="datum"]').value = bestaand.datum;
    el('[data-field="uitslag"]').value = bestaand.uitslag;
    el('[data-field="toernooi"]').value = bestaand.toernooi;
    el('[data-field="ronde"]').value = bestaand.ronde;
    el('[data-field="bron"]').value = bestaand.bron;
    el('[data-field="notities"]').value = bestaand.notities;
  }

  // Zelfde filtercategorieën als bij Combinaties (Jans wens, CLAUDE.md-feedback 2026-09-23) —
  // hetzelfde patroon als editorView.js's renderCategorieenTagLists, hier lokaal omdat dit de
  // enige plek in dit bestand is die het nodig heeft.
  const selectedCategorieen = {};
  for (const [key, waarden] of Object.entries(bestaand?.categorieen ?? {})) selectedCategorieen[key] = [...waarden];

  async function renderTagList(host, listName, selectedRef, onToggle) {
    const values = await getList(listName);
    host.innerHTML = "";
    for (const value of values) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = value;
      if (selectedRef.includes(value)) btn.classList.add("selected");
      btn.addEventListener("click", () => onToggle(value, btn));
      host.appendChild(btn);
    }
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tag";
    addBtn.textContent = "+ nieuw";
    addBtn.addEventListener("click", async () => {
      const naam = prompt("Nieuwe waarde:");
      if (!naam) return;
      await addListValue(listName, naam);
      await renderTagList(host, listName, selectedRef, onToggle);
    });
    host.appendChild(addBtn);
  }

  const categorieenHost = el('[data-role="categorieen"]');
  async function renderCategorieenTagLists() {
    const categorieen = await getAllCategorieen();
    categorieenHost.innerHTML = categorieen
      .map((cat) => `<label>${escapeHtml(cat.label)}</label><div class="tag-list" data-cat="${cat.key}"></div>`)
      .join("");
    for (const cat of categorieen) {
      if (!selectedCategorieen[cat.key]) selectedCategorieen[cat.key] = [];
      const host = categorieenHost.querySelector(`[data-cat="${cat.key}"]`);
      await renderTagList(host, cat.key, selectedCategorieen[cat.key], (value, btn) => {
        toggleInArray(selectedCategorieen[cat.key], value);
        btn.classList.toggle("selected");
      });
    }
  }
  await renderCategorieenTagLists();

  el('[data-action="toernooibase-link"]').addEventListener("click", () => {
    const status = el('[data-role="toernooibase-status"]');
    const link = toernooibasePdnLink(el('[data-field="toernooibase-link"]').value || "");
    if (!link) {
      status.textContent = "Dit lijkt geen (volledige) toernooibase-partijlink. Kopieer de link uit de adresbalk terwijl je de partij bekijkt.";
      status.className = "kleur-fout";
      return;
    }
    window.open(link, "_blank", "noopener");
    status.textContent = "Partijtekst geopend in een nieuw tabblad — kopieer de tekst en plak die hieronder.";
    status.className = "kleur-info";
  });

  function toonSpeler(boom) {
    const spelerHost = el('[data-role="speler"]');
    spelerHost.innerHTML = "";
    if (!boom || boom.kinderen.length === 0) return;
    createZettenboomPlayer(spelerHost, { wortel: boom, bord: createStartBoard(), beurt: "white" });
  }
  if (huidigeBoom) toonSpeler(huidigeBoom);

  // Vult een veld alleen als het nog leeg is — geplakte kopregels overschrijven dus nooit iets
  // wat je zelf al had ingetypt.
  function vulLegAan(field, waarde) {
    if (!waarde) return;
    const invoer = el(`[data-field="${field}"]`);
    if (!invoer.value.trim()) invoer.value = waarde;
  }

  el('[data-action="lees-in"]').addEventListener("click", () => {
    const { boom, meldingen, kopregels } = leesPartijTekst(el('[data-role="tekst"]').value);
    toonMeldingen(el('[data-role="meldingen"]'), meldingen);
    huidigeBoom = boom;
    toonSpeler(boom);

    if (kopregels.wit) {
      const { voornaam, achternaam } = splitNaam(kopregels.wit);
      vulLegAan("witVoornaam", voornaam);
      vulLegAan("witAchternaam", achternaam);
    }
    if (kopregels.zwart) {
      const { voornaam, achternaam } = splitNaam(kopregels.zwart);
      vulLegAan("zwartVoornaam", voornaam);
      vulLegAan("zwartAchternaam", achternaam);
    }
    vulLegAan("toernooi", kopregels.toernooi);
    vulLegAan("ronde", kopregels.ronde);
    vulLegAan("datum", kopregels.datum);
    vulLegAan("uitslag", kopregels.uitslag);
  });

  el('[data-action="opslaan"]').addEventListener("click", async () => {
    const saved = await savePartij({
      id: bestaand?.id,
      witVoornaam: el('[data-field="witVoornaam"]').value.trim(),
      witAchternaam: el('[data-field="witAchternaam"]').value.trim(),
      zwartVoornaam: el('[data-field="zwartVoornaam"]').value.trim(),
      zwartAchternaam: el('[data-field="zwartAchternaam"]').value.trim(),
      datum: el('[data-field="datum"]').value.trim(),
      uitslag: el('[data-field="uitslag"]').value,
      toernooi: el('[data-field="toernooi"]').value.trim(),
      ronde: el('[data-field="ronde"]').value.trim(),
      bron: el('[data-field="bron"]').value.trim(),
      notities: el('[data-field="notities"]').value.trim(),
      categorieen: Object.fromEntries(Object.entries(selectedCategorieen).map(([k, v]) => [k, [...v]])),
      wortel: huidigeBoom ?? undefined,
    });
    onSaved?.(saved);
  });
  el('[data-action="annuleren"]').addEventListener("click", () => onCancel?.());
}
