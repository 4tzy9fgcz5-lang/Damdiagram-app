import {
  DB_NAME,
  SCHEMA_VERSION,
  MIGRATIONS,
  STORE_LIJSTEN,
  DEFAULT_LISTS,
} from "./schema.js";

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
      await ensureDefaultLists(db);
      currentDb = db;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function ensureDefaultLists(db) {
  for (const [naam, waarden] of Object.entries(DEFAULT_LISTS)) {
    const existing = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.get(naam)));
    if (!existing) {
      await tx(db, STORE_LIJSTEN, "readwrite", (store) =>
        promisify(store.put({ naam, waarden: [...waarden] }))
      );
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
