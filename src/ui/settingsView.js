import { renderBackupSection, renderTrainingSection } from "./backupView.js?v=20260917e";
import { getVerbergOplossing, setVerbergOplossing } from "../db/uiSettings.js?v=20260917e";

function renderPlaceholder(container) {
  container.innerHTML = `<div class="card"><p style="color:#666;">Hier komt later meer.</p></div>`;
}

function renderDatabaseSettingsSection(container) {
  container.innerHTML = `
    <div class="card">
      <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;">
        <input type="checkbox" data-field="verberg-oplossing" />
        Oplossing verbergen tot ik erop klik (mocht je zelf willen puzzelen)
      </label>
    </div>
  `;
  const checkbox = container.querySelector('[data-field="verberg-oplossing"]');
  checkbox.checked = getVerbergOplossing();
  checkbox.addEventListener("change", () => setVerbergOplossing(checkbox.checked));
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
