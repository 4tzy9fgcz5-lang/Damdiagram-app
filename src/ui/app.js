import { renderEditorView } from "./editorView.js?v=20260925d";
import { renderDatabaseView } from "./databaseView.js?v=20260925d";
import { renderEindspelenView } from "./eindspelenView.js?v=20260925d";
import { renderStandDetailView } from "./standDetailView.js?v=20260925d";
import { renderStencilsListView } from "./stencilsListView.js?v=20260925d";
import { renderStencilView, addStandenToStencil } from "./stencilView.js?v=20260925d";
import { saveStencil } from "../db/stencils.js?v=20260925d";
import { getLastBackupDate } from "./backupView.js?v=20260925d";
import { renderSettingsView } from "./settingsView.js?v=20260925d";
import { renderImportView } from "./importView.js?v=20260925d";
import { renderPhotoImportView } from "./photoImportView.js?v=20260925d";
import { renderBulkImportView } from "./bulkImportView.js?v=20260925d";
import { loadDrawable } from "./imageInput.js?v=20260925d";
import { renderBulkPrepare } from "./bulkPrepareView.js?v=20260925d";
import { reviewReason } from "../core/bulkReview.js?v=20260925d";
import { renderDiagramCapture, cropAroundCorners } from "./diagramCaptureView.js?v=20260925d";
import { listStanden } from "../db/standen.js?v=20260925d";
import { renderPartijInvoer } from "./partijInvoerView.js?v=20260925d";
import { renderPartijenListView } from "./partijenListView.js?v=20260925d";
import { renderPartijDetailView } from "./partijDetailView.js?v=20260925d";
import { renderFilmModuleView } from "./filmModuleView.js?v=20260925d";
import { renderPartijAnnoteren } from "./partijAnnoterenView.js?v=20260925d";

const routes = [
  "nieuw",
  "zelf",
  "foto",
  "bulk",
  "bulk-voorbereiden",
  "bulk-diagram",
  "database",
  "eindspelen",
  "stand",
  "stencils",
  "stencil",
  "instellingen",
  "import",
  "partij-nieuw",
  "partijen",
  "partij",
  "partij-film",
  "partij-annoteren",
];
let pendingRecognition = null;
// Actieve bulk-import-rij: { pages: [{ file, name }] (de foto's), diagrams: [{ page (plek in pages),
// corners, manual, nummer, oplossingTekst }], auteur, publicatie, categorieen, index }.
// Alleen in het geheugen — bij een paginaherlaad ben je de voortgang kwijt (zie
// CLAUDE.md-plan, "tussentijds hervatten" is een latere stap).
let bulkQueue = null;
// De volle foto van het diagram dat nu aan de beurt is: pas geladen als het nodig is en bij een
// andere foto (of aan het eind van de rij) weer losgelaten, zodat een heel boek aan foto's niet
// tegelijk in het geheugen zit.
let bulkDrawable = null;
function releaseBulkDrawable() {
  bulkDrawable?.drawable.close?.();
  bulkDrawable = null;
}
async function getBulkDrawable(pageIndex) {
  if (bulkDrawable && bulkDrawable.queue === bulkQueue && bulkDrawable.pageIndex === pageIndex) return bulkDrawable.drawable;
  releaseBulkDrawable();
  const drawable = await loadDrawable(bulkQueue.pages[pageIndex].file);
  bulkDrawable = { queue: bulkQueue, pageIndex, drawable };
  return drawable;
}
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

// De regel boven de editor in de automatische bulk-modus: waar je in de rij zit en (alleen bij een
// automatisch herkend diagram) waarom het extra aandacht vraagt.
function makeBulkInfo(diagram, index, metReden) {
  const { diagrams, pages } = bulkQueue;
  return {
    tekst: `Diagram ${index + 1} van ${diagrams.length}${diagram.nummer ? ` — nr. ${diagram.nummer}` : ""}${pages.length > 1 ? ` (foto ${diagram.page + 1} van ${pages.length})` : ""}`,
    reden: metReden ? reviewReason(diagram) : "",
    onAdjustCorners: () => {
      diagram.hoekenOpnieuw = true;
      location.hash = "#/bulk-diagram";
    },
    onStop: () => {
      if (!confirm("De rest van de rij wordt niet opgeslagen (wat je al opsloeg blijft staan). Rij stoppen?")) return;
      bulkQueue = null;
      location.hash = "#/nieuw";
      render();
    },
  };
}

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
  zelf: "nieuw",
  foto: "nieuw",
  bulk: "nieuw",
  "bulk-voorbereiden": "nieuw",
  "bulk-diagram": "nieuw",
  database: "database",
  eindspelen: "eindspelen",
  stand: "database",
  stencils: "stencils",
  stencil: "stencils",
  instellingen: "instellingen",
  import: "instellingen",
  partijen: "partijen",
  partij: "partijen",
  "partij-nieuw": "partijen",
  "partij-film": "partijen",
  "partij-annoteren": "partijen",
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
  if (bulkQueue && name !== "bulk" && name !== "bulk-voorbereiden" && name !== "bulk-diagram" && !(name === "nieuw" && !param)) {
    bulkQueue = null;
  }
  if (!bulkQueue) releaseBulkDrawable();

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
  } else if (name === "eindspelen") {
    await renderEindspelenView(app);
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
    });
  } else if (name === "import") {
    await renderImportView(app, {
      encoded: param,
      onDone: () => checkBackupReminder(),
    });
  } else if (name === "partijen") {
    await renderPartijenListView(app, {
      onOpenPartij: (id) => {
        location.hash = `#/partij/${id}`;
      },
      onNieuwePartij: () => {
        location.hash = "#/partij-nieuw";
      },
    });
  } else if (name === "partij") {
    await renderPartijDetailView(app, {
      partijId: param,
      onEdit: (id) => {
        location.hash = `#/partij-nieuw/${id}`;
      },
      onFilm: (id) => {
        location.hash = `#/partij-film/${id}`;
      },
      onAnnoteren: (id) => {
        location.hash = `#/partij-annoteren/${id}`;
      },
      onDeleted: () => {
        showToast("Verwijderd.");
        location.hash = "#/partijen";
      },
      onBack: () => {
        location.hash = "#/partijen";
      },
    });
  } else if (name === "partij-film") {
    await renderFilmModuleView(app, {
      partijId: param,
      onBack: () => {
        location.hash = `#/partij/${param}`;
      },
    });
  } else if (name === "partij-annoteren") {
    await renderPartijAnnoteren(app, {
      partijId: param,
      onDone: (saved) => {
        showToast("Aantekeningen opgeslagen.");
        location.hash = `#/partij/${saved.id}`;
      },
      onCancel: () => {
        location.hash = `#/partij/${param}`;
      },
    });
  } else if (name === "partij-nieuw") {
    // Blijf je meteen op deze pagina hangen na opslaan (de route wordt dan
    // #/partij-nieuw/<id>, zodat een volgende keer opslaan bijwerkt), maar "Annuleren" of
    // de "back"-knop op de detailpagina gaat naar het overzicht.
    await renderPartijInvoer(app, {
      partijId: param,
      onSaved: (saved) => {
        showToast("Partij opgeslagen.");
        location.hash = `#/partij-nieuw/${saved.id}`;
      },
      onCancel: () => {
        location.hash = param ? `#/partij/${param}` : "#/partijen";
      },
    });
  } else if (name === "foto") {
    // De keuze combinaties/eindspelen komt van het allereerste scherm
    // (bulkImportView.js, via setDefaultDoel) en staat dan al klaar in de
    // editor; hier is niets extra's nodig.
    await renderPhotoImportView(app, {
      onRecognized: (result) => {
        pendingRecognition = result;
        location.hash = "#/nieuw";
      },
    });
  } else if (name === "bulk" || (name === "nieuw" && !param && !pendingRecognition)) {
    // "Nieuwe stand" begint bij het kiezen van foto's (bulk-import); zelf invoeren is een aparte route
    // (#/zelf). Een herkende stand uit de foto-import of bulk-rij komt hier wél in de editor terecht.
    // Zit je midden in een bulk-rij en kom je hier (bv. via "Nieuwe stand"), dan ga je terug naar de rij
    // in plaats van die stilletjes weg te gooien; stoppen kan met de knop "Rij stoppen" in de editor.
    if (name === "nieuw" && bulkQueue && bulkQueue.index < bulkQueue.diagrams.length) {
      location.hash = "#/bulk-diagram";
      return;
    }
    bulkQueue = null;
    await renderBulkImportView(app, {
      onConfirmed: ({ pages, diagrams, auteur, publicatie, categorieen, auto, doel }) => {
        bulkQueue = { pages, diagrams, auteur, publicatie, categorieen, auto, doel, index: 0 };
        location.hash = auto ? "#/bulk-voorbereiden" : "#/bulk-diagram";
      },
    });
  } else if (name === "bulk-voorbereiden") {
    if (!bulkQueue) {
      location.hash = "#/bulk";
      return;
    }
    renderBulkPrepare(app, {
      queue: bulkQueue,
      onDone: () => {
        location.hash = "#/bulk-diagram";
      },
      onFallback: () => {
        // toch per diagram de hoeken bekijken: de al herkende resultaten worden dan niet gebruikt
        bulkQueue.auto = false;
        bulkQueue.index = 0;
        location.hash = "#/bulk-diagram";
      },
    });
  } else if (name === "bulk-diagram") {
    if (!bulkQueue) {
      location.hash = "#/bulk";
      return;
    }
    const { diagrams, index } = bulkQueue;
    const diagram = diagrams[index];
    // Automatische modus: de stand is al herkend, dus meteen naar de controle in de editor. Alleen
    // een diagram dat niet herkend kon worden, zelf is toegevoegd of waarvan je zelf de hoeken wilt
    // aanpassen gaat nog langs het hoekenscherm hieronder.
    if (bulkQueue.auto && diagram.result && !diagram.hoekenOpnieuw) {
      pendingRecognition = {
        ...diagram.result,
        auteur: bulkQueue.auteur,
        publicatie: bulkQueue.publicatie,
        categorieen: bulkQueue.categorieen,
        doel: bulkQueue.doel,
        nummer: diagram.nummer ?? "",
        oplossingTekst: diagram.oplossingTekst ?? "",
        beurt: diagram.beurt,
        bulkInfo: makeBulkInfo(diagram, index, true),
      };
      location.hash = "#/nieuw";
      return;
    }
    let drawable;
    try {
      drawable = await getBulkDrawable(diagram.page);
    } catch (err) {
      app.innerHTML = `<p>Kon de foto niet meer openen (${err.message}). <a href="#/bulk">Opnieuw beginnen</a></p>`;
      return;
    }
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
      heading: `Diagram ${index + 1} van ${diagrams.length}${diagram.nummer ? ` — nr. ${diagram.nummer}` : ""}${bulkQueue.pages.length > 1 ? ` (foto ${diagram.page + 1} van ${bulkQueue.pages.length})` : ""}`,
      onRecognized: (result) => {
        diagram.hoekenOpnieuw = false;
        pendingRecognition = { ...result, auteur: bulkQueue.auteur, publicatie: bulkQueue.publicatie, categorieen: bulkQueue.categorieen, doel: bulkQueue.doel, nummer: diagram.nummer ?? "", oplossingTekst: diagram.oplossingTekst ?? "", bulkInfo: bulkQueue.auto ? makeBulkInfo(diagram, index, false) : undefined };
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
      initialAuteur: recognition?.auteur,
      initialPublicatie: recognition?.publicatie,
      initialCategorieen: recognition?.categorieen,
      initialNummer: recognition?.nummer,
      initialOplossingTekst: recognition?.oplossingTekst,
      initialTurn: recognition?.beurt,
      initialDoel: recognition?.doel,
      bulkInfo: recognition?.bulkInfo,
      onSaved: (stand, { addToStencil, soort }) => {
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
        if (soort === "eindspel") {
          // Eindspelen hebben nog geen detailpagina of opgaveblad-koppeling
          // (dat komt in een latere stap) — meteen een leeg invoerscherm voor
          // het volgende eindspel.
          showToast("Opgeslagen bij eindspelen.");
          location.hash = name === "zelf" ? "#/zelf" : "#/nieuw";
          render();
          return;
        }
        showToast(addToStencil ? "Opgeslagen. Kies of maak nu een opgaveblad." : "Opgeslagen bij combinaties.");
        if (addToStencil) {
          location.hash = "#/stencils";
        } else if (param) {
          location.hash = `#/stand/${param}`;
        } else {
          // zelf ingevoerd: meteen een leeg invoerscherm voor de volgende; anders terug naar foto's kiezen
          location.hash = name === "zelf" ? "#/zelf" : "#/nieuw";
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
  // Een hash-navigatie naar een route zonder passend element-id scrollt de browser niet vanzelf naar
  // boven (anders dan een "echte" link) — vooral hinderlijk bij de bulk-rij, waar je bij elk volgend
  // diagram weer bovenaan wilt beginnen (stand controleren, dan pas naar beneden voor de oplossing).
  window.scrollTo(0, 0);
  await checkBackupReminder();
}

window.addEventListener("hashchange", render);

for (const btn of document.querySelectorAll(".app-nav button")) {
  btn.addEventListener("click", () => {
    location.hash = `#/${btn.dataset.route}`;
  });
}

render();
