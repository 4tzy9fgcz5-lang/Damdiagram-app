import { getStand } from "../db/standen.js";

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
