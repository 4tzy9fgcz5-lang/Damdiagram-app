// Losse foto-import van één diagram. De hoeken/herkenning/resultaten-stap zelf
// zit in diagramCaptureView.js, gedeeld met de bulk-import (zie CLAUDE.md-plan).

import { detectBoardCorners } from "../recognition/detectBoard.js?v=20260920p";
import { renderDiagramCapture } from "./diagramCaptureView.js?v=20260920p";
import { loadDrawable, drawableSize } from "./imageInput.js?v=20260920p";

function defaultCorners(width, height) {
  const mx = width * 0.12;
  const my = height * 0.12;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

export async function renderPhotoImportView(container, { onRecognized } = {}) {
  container.innerHTML = `
    <h2>Foto van een diagram</h2>
    <div class="card" data-role="pick">
      <p>Maak een foto van het diagram in het boek, of kies een bestaande foto/screenshot.</p>
      <div class="button-row" style="margin-top:0;">
        <button type="button" class="primary" data-action="camera">Maak foto</button>
        <button type="button" class="secondary" data-action="gallery">Kies uit galerij</button>
      </div>
      <input type="file" accept="image/*" capture="environment" data-role="camera-input" style="display:none" />
      <input type="file" accept="image/*" data-role="gallery-input" style="display:none" />
      <p style="margin-top:0.75rem;font-size:0.85rem;">
        Staan er meerdere diagrammen op één pagina? <a href="#/bulk">Gebruik bulk-import</a>.
      </p>
      <p data-role="status" style="color:#666;font-size:0.85rem;"></p>
    </div>
    <div data-role="capture-mount"></div>
  `;

  const el = (sel) => container.querySelector(sel);
  const pickCard = el('[data-role="pick"]');
  const mount = el('[data-role="capture-mount"]');
  const status = el('[data-role="status"]');

  async function handleFile(file) {
    if (!file) return;
    status.textContent = "Foto wordt geladen...";
    try {
      const drawable = await loadDrawable(file);
      const { width, height } = drawableSize(drawable);

      // Probeer het bord zelf te vinden (dikke buitenrand); lukt dat niet, dan de
      // vaste 12%-marge zoals voorheen. In beide gevallen kan de gebruiker de
      // hoeken nog gewoon verslepen — dit is alleen het startpunt.
      status.textContent = "Bord zoeken...";
      let detected = null;
      try {
        detected = detectBoardCorners(drawable);
      } catch {
        detected = null;
      }
      const initialCorners = detected ?? defaultCorners(width, height);

      status.textContent = "";
      pickCard.style.display = "none";
      renderDiagramCapture(mount, {
        drawable,
        initialCorners,
        onRestart: () => {
          mount.innerHTML = "";
          pickCard.style.display = "block";
          el('[data-role="camera-input"]').value = "";
          el('[data-role="gallery-input"]').value = "";
        },
        onRecognized,
      });
    } catch (err) {
      status.textContent = "Kon deze foto niet openen: " + err.message;
    }
  }

  el('[data-role="camera-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-role="gallery-input"]').addEventListener("change", (e) => handleFile(e.target.files[0]));
  el('[data-action="camera"]').addEventListener("click", () => el('[data-role="camera-input"]').click());
  el('[data-action="gallery"]').addEventListener("click", () => el('[data-role="gallery-input"]').click());
}
