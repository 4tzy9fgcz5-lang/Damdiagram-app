import { getStand } from "../db/standen.js?v=20260918e";

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

export function effectiveOpdracht(item, stencil) {
  const text = item.opdracht || item.stand?.opdracht || "";
  return text || stencil.opdrachtregel;
}

// De ondertitel/notitie staat vooraan op dezelfde regel als de algemene
// opdrachtregel, gescheiden door een koppelteken — geen aparte regel.
export function opdrachtregelMetOndertitel(stencil) {
  return stencil.ondertitel ? `${stencil.ondertitel} - ${stencil.opdrachtregel}` : stencil.opdrachtregel;
}
