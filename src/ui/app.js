import { renderEditorView } from "./editorView.js";
import { renderDatabaseView } from "./databaseView.js";
import { renderStencilsListView } from "./stencilsListView.js";
import { renderStencilView, addStandenToStencil } from "./stencilView.js";
import { renderBackupView, getLastBackupDate } from "./backupView.js";
import { renderImportView } from "./importView.js";
import { listStanden } from "../db/standen.js";

const routes = ["nieuw", "database", "stencils", "stencil", "backup", "import"];

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
  database: "database",
  stencils: "stencils",
  stencil: "stencils",
  backup: "backup",
  import: "backup",
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

  for (const btn of document.querySelectorAll(".app-nav button")) {
    btn.classList.toggle("active", btn.dataset.route === NAV_FOR_ROUTE[name]);
  }

  if (name === "database") {
    const forStencilId = param;
    await renderDatabaseView(app, {
      onOpenStand: (id) => {
        location.hash = `#/nieuw/${id}`;
      },
      onAddSelectionToStencil: async (ids) => {
        if (!forStencilId) {
          showToast("Open eerst een stencil en kies daar “Standen toevoegen”.");
          return;
        }
        const { added, skipped } = await addStandenToStencil(forStencilId, ids);
        showToast(
          skipped > 0
            ? `${added} toegevoegd, ${skipped} niet (stencil vol of al aanwezig).`
            : `${added} stand(en) toegevoegd aan het stencil.`
        );
        location.hash = `#/stencil/${forStencilId}`;
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
        location.hash = `#/nieuw/${id}`;
      },
      onGotoDatabaseToAdd: (stencilId) => {
        location.hash = `#/database/${stencilId}`;
      },
    });
  } else if (name === "backup") {
    await renderBackupView(app);
  } else if (name === "import") {
    await renderImportView(app, {
      encoded: param,
      onDone: () => checkBackupReminder(),
    });
  } else {
    await renderEditorView(app, {
      standId: param,
      onSaved: (stand, { addToStencil }) => {
        showToast(addToStencil ? "Opgeslagen. Kies of maak nu een stencil." : "Opgeslagen in de database.");
        if (addToStencil) {
          location.hash = "#/stencils";
        } else if (!param) {
          location.hash = "#/nieuw";
          render();
        }
      },
    });
  }
  await checkBackupReminder();
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

for (const btn of document.querySelectorAll(".app-nav button")) {
  btn.addEventListener("click", () => {
    location.hash = `#/${btn.dataset.route}`;
  });
}

render();
