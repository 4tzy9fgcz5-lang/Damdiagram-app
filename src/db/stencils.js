import { openDb, tx, promisify, newId } from "./db.js";
import { STORE_STENCILS } from "./schema.js";

function nowIso() {
  return new Date().toISOString();
}

export async function saveStencil(input) {
  const db = await openDb();
  const isNew = !input.id;
  const record = {
    id: input.id ?? newId(),
    titel: input.titel ?? "Opgavenstencil",
    club: input.club ?? "",
    datum: input.datum ?? nowIso().slice(0, 10),
    opdrachtregel: input.opdrachtregel ?? "Wit speelt en wint",
    // Elk item: { standId, opdracht }. opdracht start als kopie van het opdrachtveld
    // van de stand zelf, maar kan per stencil losstaand worden aangepast (zie stencilView).
    standen: input.standen ?? [],
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  if (!isNew) {
    const existing = await getStencil(input.id);
    if (existing) record.createdAt = existing.createdAt;
  }
  await tx(db, STORE_STENCILS, "readwrite", (store) => promisify(store.put(record)));
  return record;
}

export async function getStencil(id) {
  const db = await openDb();
  return tx(db, STORE_STENCILS, "readonly", (store) => promisify(store.get(id)));
}

export async function deleteStencil(id) {
  const db = await openDb();
  await tx(db, STORE_STENCILS, "readwrite", (store) => promisify(store.delete(id)));
}

export async function listStencils() {
  const db = await openDb();
  const all = await tx(db, STORE_STENCILS, "readonly", (store) => promisify(store.getAll()));
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
