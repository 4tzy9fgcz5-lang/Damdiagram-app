import { exportAll, importAll } from "../db/backup.js";
import { listStanden } from "../db/standen.js";
import { buildCsv, buildPdnText } from "../export/portable.js";
import { downloadBlob } from "../export/docx.js";

const LAST_BACKUP_KEY = "damstencil_lastBackup";

export function getLastBackupDate() {
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  return raw ? new Date(raw) : null;
}

function markBackupDone() {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function renderBackupView(container) {
  container.innerHTML = `
    <h2>Back-up en overdracht</h2>

    <div class="card">
      <h2 style="margin-top:0;">Back-up maken</h2>
      <p>Download je hele verzameling (standen, stencils en eigen lijsten) als één bestand. Bewaar dit ergens veilig, bijvoorbeeld in je e-mail of een cloudmap.</p>
      <button type="button" class="primary" data-action="export">Back-up downloaden</button>
      <p data-role="last-backup" style="color:#666;font-size:0.85rem;margin-top:0.5rem;"></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Back-up terugzetten</h2>
      <p>Kies een eerder gedownload back-upbestand (.json).</p>
      <input type="file" accept="application/json,.json" data-field="file" />
      <label style="margin-top:0.75rem;">
        <input type="radio" name="restore-mode" value="merge" checked /> Samenvoegen (geen dubbele standen toevoegen)
      </label>
      <label>
        <input type="radio" name="restore-mode" value="replace" /> Vervangen (huidige database wordt overschreven)
      </label>
      <div class="button-row">
        <button type="button" class="primary" data-action="restore">Terugzetten</button>
      </div>
      <p data-role="restore-status" style="color:#666;font-size:0.85rem;"></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Leesbaar exporteren</h2>
      <p>Je verzameling nooit vastzitten aan deze app: exporteer als CSV (voor Excel) of als leesbare tekst met de FEN's.</p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="secondary" data-action="csv">Exporteer als CSV</button>
        <button type="button" class="secondary" data-action="pdn">Exporteer als leesbare tekst</button>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Van telefoon naar laptop</h2>
      <p>Ga naar <strong>Database</strong>, vink de standen aan die je wilt overzetten en kies daar "Stuur naar ander apparaat". Je krijgt een link om via WhatsApp of mail te versturen.</p>
    </div>
  `;

  const el = (sel) => container.querySelector(sel);

  function updateLastBackupText() {
    const last = getLastBackupDate();
    el('[data-role="last-backup"]').textContent = last
      ? `Laatste back-up: ${last.toLocaleDateString("nl-NL")}.`
      : "Je hebt nog geen back-up gemaakt.";
  }
  updateLastBackupText();

  el('[data-action="export"]').addEventListener("click", async () => {
    const data = await exportAll();
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `damstencil-backup-${todayStamp()}.json`);
    markBackupDone();
    updateLastBackupText();
  });

  el('[data-action="restore"]').addEventListener("click", async () => {
    const status = el('[data-role="restore-status"]');
    const fileInput = el('[data-field="file"]');
    const file = fileInput.files[0];
    if (!file) {
      status.textContent = "Kies eerst een back-upbestand.";
      return;
    }
    const mode = container.querySelector('input[name="restore-mode"]:checked').value;
    if (mode === "replace" && !confirm("Weet je het zeker? Je huidige database wordt volledig vervangen.")) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data, { mode });
      status.textContent = "Terugzetten gelukt.";
    } catch (err) {
      status.textContent = "Terugzetten mislukt: " + err.message;
    }
  });

  el('[data-action="csv"]').addEventListener("click", async () => {
    const standen = await listStanden();
    downloadBlob(new Blob([buildCsv(standen)], { type: "text/csv" }), `damstencil-standen-${todayStamp()}.csv`);
  });

  el('[data-action="pdn"]').addEventListener("click", async () => {
    const standen = await listStanden();
    downloadBlob(new Blob([buildPdnText(standen)], { type: "text/plain" }), `damstencil-standen-${todayStamp()}.pdn`);
  });
}
