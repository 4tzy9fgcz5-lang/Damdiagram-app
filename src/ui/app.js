import { renderEditorView } from "./editorView.js?v=20260921ar";
import { renderDatabaseView } from "./databaseView.js?v=20260921ar";
import { renderStandDetailView } from "./standDetailView.js?v=20260921ar";
import { renderStencilsListView } from "./stencilsListView.js?v=20260921ar";
import { renderStencilView, addStandenToStencil } from "./stencilView.js?v=20260921ar";
import { saveStencil } from "../db/stencils.js?v=20260921ar";
import { getLastBackupDate } from "./backupView.js?v=20260921ar";
import { renderSettingsView } from "./settingsView.js?v=20260921ar";
import { renderImportView } from "./importView.js?v=20260921ar";
import { renderPhotoImportView } from "./photoImportView.js?v=20260921ar";
import { renderBulkImportView } from "./bulkImportView.js?v=20260921ar";
import { renderDiagramCapture, cropAroundCorners } from "./diagramCaptureView.js?v=20260921ar";
import { listStanden } from "../db/standen.js?v=20260921ar";

const routes = ["nieuw", "foto", "bulk", "bulk-diagram", "database", "stand", "stencils", "stencil", "instellingen", "import"];
let pendingRecognition = null;
// Actieve bulk-import-rij: { drawable (hele paginafoto), diagrams: [{corners}], index }.
// Alleen in het geheugen — bij een paginaherlaad ben je de voortgang kwijt (zie
// CLAUDE.md-plan, "tussentijds hervatten" is een latere stap).
let bulkQueue = null;
// Onthoudt van waaruit een standdetailpagina geopend is (database of een
// opgaveblad), zodat "Terug" naar de juiste plek gaat in plaats van altijd
// naar de database.
let standReturnRoute = "#/database";
// De volgorde van standen zoals die op het moment van openen op de
// database-pagina te zien was (met de dan geldende filters/sortering) — voor
// de vooruit/achteruit-knoppen op de standdetailpagina. Alleen gevuld als je
// er via de database bent gekomen; anders (bv. via een opgaveblad) staan die
// knoppen er niet.
let standNavIds = null;

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, param] = hash.split("/");
  if (routes.includes(name)) return { name, param };
  return { name: "nieuw", param: undefined };
}

const NAV_FOR_ROUTE = {
  nieuw: "nieuw",
  foto: "nieuw",
  bulk: "nieuw",
  "bulk-diagram": "nieuw",
  database: "database",
  stand: "database",
  stencils: "stencils",
  stencil: "stencils",
  instellingen: "instellingen",
  import: "instellingen",
};

const BACKUP_REMINDER_DAYS = 14;

async function checkBackupReminder() {
  const banner = document.getElementById("backup-banner");
  if (!banner) return;
  const standen = await listStanden();
  if (standen.length === 0) {
    banner.style.display = "none";
    return;
  }
  const last = getLastBackupDate();
  const daysSince = last ? (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24) : Infinity;
  banner.style.display = daysSince >= BACKUP_REMINDER_DAYS ? "block" : "none";
}

async function render() {
  const app = document.getElementById("app");
  const { name, param } = currentRoute();

  // Een actieve bulk-rij blijft alleen "hangen" tijdens de rij zelf (bulk,
  // bulk-diagram, en de tussenstap #/nieuw zonder param). Navigeer je ergens
  // anders naartoe — ook naar #/nieuw/<id> om een bestaande stand te bewerken —
  // dan is de rij voorbij; anders zou een latere, losse opslag onterecht als
  // bulk-stap behandeld worden.
  if (bulkQueue && name !== "bulk" && name !== "bulk-diagram" && !(name === "nieuw" && !param)) {
    bulkQueue = null;
  }

  for (const btn of document.querySelectorAll(".app-nav button")) {
    btn.classList.toggle("active", btn.dataset.route === NAV_FOR_ROUTE[name]);
  }

  if (name === "database") {
    const forStencilId = param;
    await renderDatabaseView(app, {
      onOpenStand: (id, ids) => {
        standReturnRoute = "#/database";
        standNavIds = ids;
        location.hash = `#/stand/${id}`;
      },
      onAddSelectionToStencil: async (ids) => {
        // Vanuit de database kan dit ook zonder al een bestaand opgaveblad open te
        // hebben: dan wordt er meteen een nieuwe aangemaakt met de geselecteerde
        // standen erin, in plaats van de gebruiker eerst naar de opgavebladen-
        // pagina te sturen.
        let stencilId = forStencilId;
        if (!stencilId) {
          const nieuw = await saveStencil({});
          stencilId = nieuw.id;
        }
        const { added, skipped } = await addStandenToStencil(stencilId, ids);
        showToast(
          skipped > 0
            ? `${added} toegevoegd, ${skipped} stonden er al in.`
            : `${added} stand(en) toegevoegd aan het opgaveblad.`
        );
        location.hash = `#/stencil/${stencilId}`;
      },
    });
  } else if (name === "stencils") {
    await renderStencilsListView(app, {
      onOpenStencil: (id) => {
        location.hash = `#/stencil/${id}`;
      },
    });
  } else if (name === "stencil") {
    await renderStencilView(app, {
      stencilId: param,
      onOpenStand: (id) => {
        standReturnRoute = `#/stencil/${param}`;
        standNavIds = null;
        location.hash = `#/stand/${id}`;
      },
      onGotoDatabaseToAdd: (stencilId) => {
        location.hash = `#/database/${stencilId}`;
      },
      onBack: () => {
        location.hash = "#/stencils";
      },
    });
  } else if (name === "stand") {
    const navIndex = standNavIds ? standNavIds.indexOf(param) : -1;
    await renderStandDetailView(app, {
      standId: param,
      onEdit: (id) => {
        location.hash = `#/nieuw/${id}`;
      },
      onDeleted: () => {
        showToast("Verwijderd.");
        location.hash = standReturnRoute;
      },
      onBack: () => {
        location.hash = standReturnRoute;
      },
      hasNav: standNavIds != null,
      onPrev:
        navIndex > 0
          ? () => {
              location.hash = `#/stand/${standNavIds[navIndex - 1]}`;
            }
          : null,
      onNext:
        navIndex >= 0 && navIndex < standNavIds.length - 1
          ? () => {
              location.hash = `#/stand/${standNavIds[navIndex + 1]}`;
            }
          : null,
    });
  } else if (name === "instellingen") {
    await renderSettingsView(app, {
      section: param,
      onOpenSection: (slug) => {
        location.hash = `#/instellingen/${slug}`;
      },
      onBack: () => {
        location.hash = "#/instellingen";
      },
    });
  } else if (name === "import") {
    await renderImportView(app, {
      encoded: param,
      onDone: () => checkBackupReminder(),
    });
  } else if (name === "foto") {
    await renderPhotoImportView(app, {
      onRecognized: (result) => {
        pendingRecognition = result;
        location.hash = "#/nieuw";
      },
    });
  } else if (name === "bulk") {
    bulkQueue = null;
    await renderBulkImportView(app, {
      onConfirmed: ({ drawable, diagrams, boekstijl, auteur }) => {
        bulkQueue = { drawable, diagrams, boekstijl, auteur, index: 0 };
        location.hash = "#/bulk-diagram";
      },
    });
  } else if (name === "bulk-diagram") {
    if (!bulkQueue) {
      location.hash = "#/bulk";
      return;
    }
    const { drawable, diagrams, index } = bulkQueue;
    const diagram = diagrams[index];
    // Automatisch gevonden diagrammen: een ruim uitgesneden stukje rond de al
    // vrij nauwkeurige hoeken (lekker groot en makkelijk te verslepen). Zelf
    // toegevoegde diagrammen staan op een gok-positie — daar toont dit juist de
    // hele pagina, zodat de hoeken vrij naar de werkelijke plek gesleept kunnen
    // worden (net als bij een losse foto-import).
    const { drawable: stepDrawable, corners: stepCorners } = diagram.manual
      ? { drawable, corners: diagram.corners }
      : (() => {
          const { canvas, corners } = cropAroundCorners(drawable, diagram.corners);
          return { drawable: canvas, corners };
        })();
    renderDiagramCapture(app, {
      drawable: stepDrawable,
      initialCorners: stepCorners,
      heading: `Diagram ${index + 1} van ${diagrams.length}${diagram.nummer ? ` — nr. ${diagram.nummer}` : ""}`,
      onRecognized: (result) => {
        pendingRecognition = { ...result, boekstijl: bulkQueue.boekstijl, auteur: bulkQueue.auteur, nummer: diagram.nummer ?? "", oplossingTekst: diagram.oplossingTekst ?? "" };
        location.hash = "#/nieuw";
      },
    });
  } else {
    const recognition = param ? null : pendingRecognition;
    pendingRecognition = null;
    await renderEditorView(app, {
      standId: param,
      initialBoard: recognition?.board,
      confidences: recognition?.confidences,
      uncertainFields: recognition?.uncertainFields,
      photoDataUrl: recognition?.photoDataUrl,
      modelVersion: recognition?.modelVersion,
      initialBoekstijl: recognition?.boekstijl,
      initialAuteur: recognition?.auteur,
      initialNummer: recognition?.nummer,
      initialOplossingTekst: recognition?.oplossingTekst,
      onSaved: (stand, { addToStencil }) => {
        if (bulkQueue) {
          bulkQueue.index += 1;
          if (bulkQueue.index < bulkQueue.diagrams.length) {
            showToast(`Opgeslagen (${bulkQueue.index} van ${bulkQueue.diagrams.length}).`);
            location.hash = "#/bulk-diagram";
          } else {
            showToast(`Bulk-import klaar: ${bulkQueue.diagrams.length} diagram(men) opgeslagen.`);
            bulkQueue = null;
            location.hash = "#/database";
          }
          return;
        }
        showToast(addToStencil ? "Opgeslagen. Kies of maak nu een opgaveblad." : "Opgeslagen in de database.");
        if (addToStencil) {
          location.hash = "#/stencils";
        } else if (param) {
          location.hash = `#/stand/${param}`;
        } else {
          location.hash = "#/nieuw";
          render();
        }
      },
      // "Diagram overslaan" bij de "staat al in de database"-melding: niets
      // opslaan, gewoon doorschuiven — vooral handig tijdens een bulk-import,
      // waar je anders voor niets auteur/oplossing van een dubbel diagram zou
      // invullen. Buiten een bulk-rij is er geen zinvolle "volgende" om naar
      // door te gaan; dan ga je terug naar het overzicht.
      onSkip: () => {
        if (bulkQueue) {
          bulkQueue.index += 1;
          if (bulkQueue.index < bulkQueue.diagrams.length) {
            showToast(`Overgeslagen (${bulkQueue.index} van ${bulkQueue.diagrams.length}).`);
            location.hash = "#/bulk-diagram";
          } else {
            showToast(`Bulk-import klaar: laatste diagram overgeslagen.`);
            bulkQueue = null;
            location.hash = "#/database";
          }
          return;
        }
        location.hash = "#/database";
      },
    });
  }
  await checkBackupReminder();
}

window.addEventListener("hashchange", render);

for (const btn of document.querySelectorAll(".app-nav button")) {
  btn.addEventListener("click", () => {
    location.hash = `#/${btn.dataset.route}`;
  });
}

render();
