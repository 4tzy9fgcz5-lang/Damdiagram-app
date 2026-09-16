import { renderBackupSection, renderTrainingSection } from "./backupView.js?v=20260916i";

function renderPlaceholder(container) {
  container.innerHTML = `<div class="card"><p style="color:#666;">Hier komt later meer.</p></div>`;
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
    render: renderPlaceholder,
  },
  {
    slug: "opgavebladen",
    titel: "Opgavebladen",
    omschrijving: "Voorkeuren voor het samenstellen van opgavebladen (stencils).",
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
