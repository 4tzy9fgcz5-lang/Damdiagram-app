export const DB_NAME = "damstencil_app";
export const SCHEMA_VERSION = 1;

export const STORE_STANDEN = "standen";
export const STORE_LIJSTEN = "lijsten";
export const STORE_STENCILS = "stencils";
export const STORE_META = "meta";

export const DEFAULT_LISTS = {
  speelsysteem: ["klassiek", "flankspel", "Roozenburg", "Keller", "compositie met eindspel"],
  type: ["directe combinatie", "forcing", "lokzet", "eindspel"],
};

// Migraties draaien in volgorde op basis van de oude versie van de database.
// Elke migratie krijgt de open upgrade-transactie (db, tx) en moet synchroon werken,
// zoals de IndexedDB upgrade-API vereist.
export const MIGRATIONS = {
  1(db) {
    const standen = db.createObjectStore(STORE_STANDEN, { keyPath: "id" });
    standen.createIndex("fen", "fen", { unique: false });
    standen.createIndex("mirrorFen", "mirrorFen", { unique: false });
    standen.createIndex("createdAt", "createdAt", { unique: false });
    standen.createIndex("jaartal", "jaartal", { unique: false });
    standen.createIndex("auteur", "auteur", { unique: false });

    db.createObjectStore(STORE_LIJSTEN, { keyPath: "naam" });
    db.createObjectStore(STORE_STENCILS, { keyPath: "id" });
    db.createObjectStore(STORE_META, { keyPath: "key" });
  },
};
