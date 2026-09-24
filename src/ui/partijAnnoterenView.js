import { createStartBoard } from "../core/board.js?v=20260925a";
import { parseFen } from "../core/fen.js?v=20260925a";
import { naamWeergave } from "../core/namen.js?v=20260925a";
import { getPartij, savePartij } from "../db/partijen.js?v=20260925a";
import { createZettenboomAnnotator } from "./zettenboomAnnotator.js?v=20260925a";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function kloonKnoop(knoop) {
  return { ...knoop, kinderen: knoop.kinderen.map(kloonKnoop) };
}

// Achteraf annoteren (CLAUDE.md-feedback 2026-09-23): commentaar/varianten toevoegen aan een
// AL OPGESLAGEN partij, niet alleen tijdens het invoeren — vergelijkbaar met lidraughts.org.
// Werkt op een eigen, gekloonde kopie van de boom (`werkboom`): pas bij "Opslaan" gaat die
// terug de database in, zodat "Terug"/"Annuleren" onderweg gemaakte wijzigingen gewoon kan
// weggooien (net als overal elders in de app: expliciet opslaan, geen automatisch bewaren).
export async function renderPartijAnnoteren(container, { partijId, onDone, onCancel } = {}) {
  const partij = await getPartij(partijId);
  if (!partij) {
    container.innerHTML = `<p>Deze partij bestaat niet (meer).</p>`;
    return;
  }

  const werkboom = kloonKnoop(partij.wortel);
  let vuil = false;

  const titel = [naamWeergave(partij.witVoornaam, partij.witAchternaam), naamWeergave(partij.zwartVoornaam, partij.zwartAchternaam)]
    .filter(Boolean)
    .join(" - ") || "(nog geen namen)";

  container.innerHTML = `
    <button type="button" class="secondary" data-action="terug" style="margin-bottom:0.75rem;">&#8592; Terug</button>
    <h2>Annoteren — ${escapeHtml(titel)}</h2>
    <p style="font-size:0.85rem;color:#666;">
      Klik op het bord om vanaf de geselecteerde zet een nieuwe zet toe te voegen — wordt
      vanzelf de voortzetting, of een variant als er al een vervolg stond. Klik in de notatie om
      naar een andere zet te springen en daar commentaar, een waarderingsteken (!/?/!?/...) toe
      te voegen, of die zet (en alles wat erna komt in die tak) te verwijderen.
    </p>
    <div data-role="annotator"></div>
    <div class="button-row" style="margin-top:1rem;">
      <button type="button" class="primary" data-action="opslaan">Opslaan</button>
      <button type="button" class="secondary" data-action="annuleren">Annuleren</button>
    </div>
  `;

  const { board, turn } = partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
  createZettenboomAnnotator(container.querySelector('[data-role="annotator"]'), {
    wortel: werkboom,
    bord: board,
    beurt: turn,
    onChange: () => {
      vuil = true;
    },
  });

  function terugZonderOpslaan() {
    if (vuil && !confirm("Niet-opgeslagen wijzigingen weggooien?")) return;
    onCancel?.();
  }

  container.querySelector('[data-action="terug"]').addEventListener("click", terugZonderOpslaan);
  container.querySelector('[data-action="annuleren"]').addEventListener("click", terugZonderOpslaan);
  container.querySelector('[data-action="opslaan"]').addEventListener("click", async () => {
    const saved = await savePartij({ ...partij, wortel: werkboom });
    onDone?.(saved);
  });
}
