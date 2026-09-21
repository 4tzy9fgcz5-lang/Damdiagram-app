// Kleine, puur lokale weergave-voorkeuren (niet de standen/stencils zelf) —
// net als het back-up-tijdstip in backupView.js bewaard via localStorage, niet
// via IndexedDB, want dit hoort niet mee in een back-up/deel-link.
const VERBERG_OPLOSSING_KEY = "damstencil_verbergOplossing";

export function getVerbergOplossing() {
  return localStorage.getItem(VERBERG_OPLOSSING_KEY) === "1";
}

export function setVerbergOplossing(waarde) {
  localStorage.setItem(VERBERG_OPLOSSING_KEY, waarde ? "1" : "0");
}

// De laatst geplakte oplossingentekst (bulk-import): een pagina met oplossingen hoort vaak bij
// meer dan één diagramfoto, dus blijft de tekst staan voor de volgende foto.
const OPLOSSINGEN_TEKST_KEY = "damstencil_oplossingenTekst";

export function getOplossingenTekst() {
  try {
    return localStorage.getItem(OPLOSSINGEN_TEKST_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setOplossingenTekst(tekst) {
  try {
    localStorage.setItem(OPLOSSINGEN_TEKST_KEY, tekst);
  } catch {
    // localStorage kan geblokkeerd zijn; dan blijft de tekst alleen tijdens dit scherm staan
  }
}
