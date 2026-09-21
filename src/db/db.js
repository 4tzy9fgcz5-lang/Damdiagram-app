import {
  DB_NAME,
  SCHEMA_VERSION,
  MIGRATIONS,
  STORE_LIJSTEN,
  DEFAULT_CATEGORIEEN,
} from "./schema.js?v=20260921av";

let dbPromise = null;
let currentDb = null;

export function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (let v = event.oldVersion + 1; v <= event.newVersion; v++) {
        const migrate = MIGRATIONS[v];
        if (migrate) migrate(db, request.transaction);
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      await ensureDefaultCategorieen(db);
      currentDb = db;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// Zet de twee starterscategorieën neer in een gloednieuwe database, en
// repareert (eenmalig, bij elke opstart onschadelijk) oudere databases die de
// twee lijsten al hadden van vóór de configureerbare filtercategorieën —
// toen misten ze nog een `label` (de vrij te hernoemen weergavetekst).
async function ensureDefaultCategorieen(db) {
  for (const { key, label, waarden } of DEFAULT_CATEGORIEEN) {
    const existing = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.get(key)));
    if (!existing) {
      await tx(db, STORE_LIJSTEN, "readwrite", (store) =>
        promisify(store.put({ naam: key, label, waarden: [...waarden] }))
      );
    } else if (existing.label == null) {
      await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.put({ ...existing, label })));
    }
  }
}

export function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function tx(db, storeNames, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const store = Array.isArray(storeNames) ? storeNames.map((n) => t.objectStore(n)) : t.objectStore(storeNames);
    let result;
    Promise.resolve(fn(store))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function resetDatabaseForTests() {
  if (currentDb) {
    currentDb.close();
    currentDb = null;
  }
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
