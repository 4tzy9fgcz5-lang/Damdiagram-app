import { getStand } from "../db/standen.js?v=20261001b";
import { parseFen } from "../core/fen.js?v=20261001b";

export async function resolveStencilItems(stencil) {
  const items = [];
  for (const entry of stencil.standen) {
    const stand = await getStand(entry.standId);
    items.push({
      standId: entry.standId,
      opdracht: entry.opdracht,
      stand: stand ?? null,
    });
  }
  return items;
}

// Vangnet voor standen zonder eigen opdrachttekst: zwart aan zet, forcing en lokzet
// krijgen toch een regeltje, zodat de oplosser weet waar hij aan toe is.
export function autoOpdracht(stand) {
  if (!stand) return "";
  const labels = [];
  try {
    if (stand.fen && parseFen(stand.fen).turn === "black") labels.push("Zwart aan zet");
  } catch {
    // ongeldige FEN: dan geen regel
  }
  // Zoek in ALLE categorieën (Jan kan ze zelf hernoemen of een eigen "Type" maken) en
  // let niet op hoofdletters: "Forcing", "forcing" en "Forcing (dwingend)" tellen allemaal.
  const waarden = Object.values(stand.categorieen ?? {})
    .flat()
    .map((w) => String(w).toLowerCase());
  if (waarden.some((w) => w.includes("forcing"))) labels.push("Forcing");
  if (waarden.some((w) => w.includes("lokzet"))) labels.push("Lokzet");
  return labels.join(", ");
}

// De opdrachttekst onder een diagram: eigen tekst van het blad, anders die van de
// stand, anders de automatische regel (zie boven). Leeg = alleen de algemene regel.
export function opdrachtTekst(item) {
  return item.opdracht || item.stand?.opdracht || autoOpdracht(item.stand);
}

export function effectiveOpdracht(item, stencil) {
  const text = opdrachtTekst(item);
  return text || stencil.opdrachtregel;
}

// De ondertitel/notitie staat vooraan op dezelfde regel als de algemene
// opdrachtregel, gescheiden door een koppelteken — geen aparte regel.
export function opdrachtregelMetOndertitel(stencil) {
  return stencil.ondertitel ? `${stencil.ondertitel} - ${stencil.opdrachtregel}` : stencil.opdrachtregel;
}
