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
