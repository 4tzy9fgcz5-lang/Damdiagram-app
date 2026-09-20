import { renderBackupSection, renderTrainingSection } from "./backupView.js?v=20260921c";
import { getVerbergOplossing, setVerbergOplossing } from "../db/uiSettings.js?v=20260921c";
import { getAllCategorieen, addCategorie, renameCategorie, removeCategorie } from "../db/categorieen.js?v=20260921c";
import { addListValue, renameListValue, removeListValue } from "../db/lijsten.js?v=20260921c";
import { listStanden, renameCategorieWaardeOpStanden } from "../db/standen.js?v=20260921c";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderPlaceholder(container) {
  container.innerHTML = `<div class="card"><p style="color:#666;">Hier komt later meer.</p></div>`;
}

// Filtercategorieën (Speelsysteem, Type, en wat Jan er zelf bij maakt) staan
// als los filter op de database-pagina en als aanklikbare kenmerken bij het
// invoeren van een stand — hier kun je ze hernoemen, verwijderen of nieuwe
// toevoegen. De waarden zélf (bv. "Keller" binnen Speelsysteem) beheer je nog
// steeds met "+ nieuw" op het invoerscherm.
async function renderDatabaseSettingsSection(container) {
  container.innerHTML = `
    <div class="card">
      <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;">
        <input type="checkbox" data-field="verberg-oplossing" />
        Oplossing verbergen tot ik erop klik (mocht je zelf willen puzzelen)
      </label>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Filtercategorieën</h3>
      <p style="font-size:0.85rem;color:#666;">
        Deze staan als filter op de database-pagina en als aanklikbare kenmerken bij het invoeren van een stand.
      </p>
      <div data-role="categorieList"></div>
      <div class="button-row">
        <button type="button" class="secondary" data-action="add-categorie">+ Nieuwe categorie</button>
      </div>
    </div>
  `;
  const checkbox = container.querySelector('[data-field="verberg-oplossing"]');
  checkbox.checked = getVerbergOplossing();
  checkbox.addEventListener("change", () => setVerbergOplossing(checkbox.checked));

  const listHost = container.querySelector('[data-role="categorieList"]');
  // Welke categorieën hun waarden-lijst opengeklapt hebben — buiten
  // renderCategorieList() bewaard, zodat een hernoem/verwijder-actie op een
  // waarde het paneel niet weer dichtklapt.
  const expandedKeys = new Set();

  async function renderCategorieList() {
    const categorieen = await getAllCategorieen();
    if (categorieen.length === 0) {
      listHost.innerHTML = '<p style="color:#666;font-size:0.85rem;">Nog geen categorieën.</p>';
      return;
    }
    listHost.innerHTML = categorieen
      .map((c) => {
        const expanded = expandedKeys.has(c.key);
        const waardenHtml = c.waarden.length
          ? c.waarden
              .map(
                (w) => `
              <div style="display:flex;align-items:center;gap:0.5rem;padding:0.2rem 0;">
                <span style="flex:1;">${escapeHtml(w)}</span>
                <button type="button" class="secondary" data-action="rename-waarde" data-key="${c.key}" data-waarde="${escapeHtml(w)}">Hernoemen</button>
                <button type="button" class="secondary" data-action="delete-waarde" data-key="${c.key}" data-waarde="${escapeHtml(w)}">Verwijderen</button>
              </div>`
              )
              .join("")
          : '<p style="color:#666;font-size:0.85rem;margin:0.2rem 0;">Nog geen waarden.</p>';
        return `
        <div style="border-top:1px solid var(--kleur-rand);padding:0.4rem 0;">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <span style="flex:1;">${escapeHtml(c.label)} <span style="color:#666;font-size:0.85rem;">(${c.waarden.length} waarde${c.waarden.length === 1 ? "" : "n"})</span></span>
            <button type="button" class="secondary" data-action="toggle-waarden" data-key="${c.key}">${expanded ? "Waarden verbergen" : "Waarden tonen"}</button>
            <button type="button" class="secondary" data-action="rename-categorie" data-key="${c.key}">Hernoemen</button>
            <button type="button" class="secondary" data-action="delete-categorie" data-key="${c.key}">Verwijderen</button>
          </div>
          ${
            expanded
              ? `<div style="margin:0.5rem 0 0 0.5rem;padding-left:0.5rem;border-left:2px solid var(--kleur-rand);">
                  ${waardenHtml}
                  <button type="button" class="secondary" data-action="add-waarde" data-key="${c.key}" style="margin-top:0.3rem;">+ Nieuwe waarde</button>
                </div>`
              : ""
          }
        </div>`;
      })
      .join("");

    for (const btn of listHost.querySelectorAll('[data-action="toggle-waarden"]')) {
      btn.addEventListener("click", () => {
        if (expandedKeys.has(btn.dataset.key)) expandedKeys.delete(btn.dataset.key);
        else expandedKeys.add(btn.dataset.key);
        renderCategorieList();
      });
    }
    for (const btn of listHost.querySelectorAll('[data-action="rename-categorie"]')) {
      btn.addEventListener("click", async () => {
        const cat = categorieen.find((c) => c.key === btn.dataset.key);
        const nieuw = prompt("Nieuwe naam voor deze categorie:", cat?.label ?? "");
        if (!nieuw || !nieuw.trim()) return;
        await renameCategorie(btn.dataset.key, nieuw.trim());
        await renderCategorieList();
      });
    }
    for (const btn of listHost.querySelectorAll('[data-action="delete-categorie"]')) {
      btn.addEventListener("click", async () => {
        const cat = categorieen.find((c) => c.key === btn.dataset.key);
        const alleStanden = await listStanden();
        const inGebruik = alleStanden.filter((s) => (s.categorieen?.[btn.dataset.key]?.length ?? 0) > 0).length;
        const melding =
          inGebruik > 0
            ? `Categorie "${cat?.label}" verwijderen? Die staat nog bij ${inGebruik} stand(en) ingevuld — die gegevens blijven bewaard, maar worden nergens meer getoond of doorzoekbaar zodra de categorie weg is.`
            : `Categorie "${cat?.label}" verwijderen?`;
        if (!confirm(melding)) return;
        expandedKeys.delete(btn.dataset.key);
        await removeCategorie(btn.dataset.key);
        await renderCategorieList();
      });
    }
    for (const btn of listHost.querySelectorAll('[data-action="rename-waarde"]')) {
      btn.addEventListener("click", async () => {
        const nieuw = prompt("Nieuwe naam voor deze waarde:", btn.dataset.waarde);
        if (!nieuw || !nieuw.trim() || nieuw.trim() === btn.dataset.waarde) return;
        await renameListValue(btn.dataset.key, btn.dataset.waarde, nieuw.trim());
        await renameCategorieWaardeOpStanden(btn.dataset.key, btn.dataset.waarde, nieuw.trim());
        await renderCategorieList();
      });
    }
    for (const btn of listHost.querySelectorAll('[data-action="delete-waarde"]')) {
      btn.addEventListener("click", async () => {
        const alleStanden = await listStanden();
        const inGebruik = alleStanden.filter((s) =>
          (s.categorieen?.[btn.dataset.key] ?? []).includes(btn.dataset.waarde)
        ).length;
        const melding =
          inGebruik > 0
            ? `Waarde "${btn.dataset.waarde}" verwijderen? Die staat nog bij ${inGebruik} stand(en) aangevinkt — dat blijft zichtbaar op die standen, maar is straks niet meer als los filter te kiezen.`
            : `Waarde "${btn.dataset.waarde}" verwijderen?`;
        if (!confirm(melding)) return;
        await removeListValue(btn.dataset.key, btn.dataset.waarde);
        await renderCategorieList();
      });
    }
    for (const btn of listHost.querySelectorAll('[data-action="add-waarde"]')) {
      btn.addEventListener("click", async () => {
        const naam = prompt("Nieuwe waarde:");
        if (!naam || !naam.trim()) return;
        await addListValue(btn.dataset.key, naam.trim());
        await renderCategorieList();
      });
    }
  }
  await renderCategorieList();

  container.querySelector('[data-action="add-categorie"]').addEventListener("click", async () => {
    const naam = prompt("Naam van de nieuwe categorie:");
    if (!naam || !naam.trim()) return;
    await addCategorie(naam.trim());
    await renderCategorieList();
  });
}

const SECTIES = [
  {
    slug: "algemeen",
    titel: "Algemeen",
    omschrijving: "Uiterlijk en algemene voorkeuren van de app.",
    render: renderPlaceholder,
  },
  {
    slug: "invoer",
    titel: "Invoervenster",
    omschrijving: "Voorkeuren voor het invoeren van standen.",
    render: renderPlaceholder,
  },
  {
    slug: "database",
    titel: "Database-venster",
    omschrijving: "Voorkeuren voor het overzicht van je standen.",
    render: renderDatabaseSettingsSection,
  },
  {
    slug: "opgavebladen",
    titel: "Opgavebladen",
    omschrijving: "Voorkeuren voor het samenstellen van opgavebladen.",
    render: renderPlaceholder,
  },
  {
    slug: "backup",
    titel: "Back-up",
    omschrijving: "Back-up maken en terugzetten, en leesbaar exporteren.",
    render: renderBackupSection,
  },
  {
    slug: "training",
    titel: "Trainingsmateriaal fotoherkenning",
    omschrijving: "Materiaal exporteren om de fotoherkenning opnieuw te trainen.",
    render: renderTrainingSection,
  },
];

export async function renderSettingsView(container, { section, onOpenSection, onBack } = {}) {
  const actief = SECTIES.find((s) => s.slug === section);

  if (!actief) {
    container.innerHTML = `
      <h2>Instellingen</h2>
      ${SECTIES.map(
        (s) => `
        <div class="card" data-slug="${s.slug}" style="cursor:pointer;margin-bottom:0.5rem;">
          <strong>${s.titel}</strong>
          <div style="color:#666;font-size:0.85rem;margin-top:0.2rem;">${s.omschrijving}</div>
        </div>`
      ).join("")}
    `;
    for (const card of container.querySelectorAll("[data-slug]")) {
      card.addEventListener("click", () => onOpenSection?.(card.dataset.slug));
    }
    return;
  }

  container.innerHTML = `
    <button type="button" class="secondary" data-action="terug">← Instellingen</button>
    <h2 style="margin-top:0.75rem;">${actief.titel}</h2>
    <div data-role="body"></div>
  `;
  container.querySelector('[data-action="terug"]').addEventListener("click", () => onBack?.());
  await actief.render(container.querySelector('[data-role="body"]'));
}
