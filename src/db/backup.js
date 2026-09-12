import { openDb, tx, promisify, newId } from "./db.js";
import { STORE_STANDEN, STORE_LIJSTEN, STORE_STENCILS, STORE_HERKENNING_LOG, SCHEMA_VERSION } from "./schema.js";
import { listStanden, saveStand } from "./standen.js";
import { getAllLists, addListValue } from "./lijsten.js";
import { listStencils, saveStencil } from "./stencils.js";
import { getAllHerkenningCorrecties, putHerkenningCorrectie } from "./herkenningLog.js";

export async function buildShareData(standIds) {
  const selected = [];
  for (const id of standIds) {
    const stand = await tx(await openDb(), STORE_STANDEN, "readonly", (store) => promisify(store.get(id)));
    if (stand) selected.push(stand);
  }
  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), standen: selected, lijsten: {}, stencils: [] };
}

export async function exportAll() {
  const [standen, lijsten, stencils, herkenningCorrecties] = await Promise.all([
    listStanden({ sortBy: "createdAt", sortDir: "asc" }),
    getAllLists(),
    listStencils(),
    getAllHerkenningCorrecties(),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    standen,
    lijsten,
    stencils,
    herkenningCorrecties,
  };
}

async function clearStore(storeName) {
  const db = await openDb();
  await tx(db, storeName, "readwrite", (store) => promisify(store.clear()));
}

async function replaceImport(data) {
  await clearStore(STORE_STANDEN);
  await clearStore(STORE_LIJSTEN);
  await clearStore(STORE_STENCILS);
  await clearStore(STORE_HERKENNING_LOG);
  const db = await openDb();

  for (const stand of data.standen ?? []) {
    await tx(db, STORE_STANDEN, "readwrite", (store) => promisify(store.put(stand)));
  }
  for (const [naam, waarden] of Object.entries(data.lijsten ?? {})) {
    await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.put({ naam, waarden })));
  }
  for (const stencil of data.stencils ?? []) {
    await tx(db, STORE_STENCILS, "readwrite", (store) => promisify(store.put(stencil)));
  }
  for (const correctie of data.herkenningCorrecties ?? []) {
    await putHerkenningCorrectie(correctie);
  }
}

async function mergeImport(data) {
  const existing = await listStanden();
  const fenToId = new Map(existing.map((s) => [s.fen, s.id]));
  const standIdMap = new Map();

  for (const stand of data.standen ?? []) {
    const existingId = fenToId.get(stand.fen);
    if (existingId) {
      standIdMap.set(stand.id, existingId);
      continue;
    }
    const { id: oldId, gebruiktIn, ...rest } = stand;
    const saved = await saveStand({ ...rest, id: newId() });
    standIdMap.set(oldId, saved.id);
    fenToId.set(saved.fen, saved.id);
  }

  for (const [naam, waarden] of Object.entries(data.lijsten ?? {})) {
    for (const waarde of waarden) await addListValue(naam, waarde);
  }

  const stencilIdMap = new Map();
  for (const stencil of data.stencils ?? []) {
    const newStanden = (stencil.standen ?? []).map((item) => ({
      ...item,
      standId: standIdMap.get(item.standId) ?? item.standId,
    }));
    const { id: oldId, ...rest } = stencil;
    const saved = await saveStencil({ ...rest, id: newId(), standen: newStanden });
    stencilIdMap.set(oldId, saved.id);
  }

  // Logboek-items zijn losse, niet-samenvloeiende voorbeelden: gewoon toevoegen.
  for (const correctie of data.herkenningCorrecties ?? []) {
    await putHerkenningCorrectie({ ...correctie, id: newId() });
  }
}

export async function importAll(data, { mode = "merge" } = {}) {
  if (!data || typeof data !== "object" || !Array.isArray(data.standen)) {
    throw new Error("Ongeldig back-upbestand.");
  }
  if (mode === "replace") {
    await replaceImport(data);
  } else {
    await mergeImport(data);
  }
}
