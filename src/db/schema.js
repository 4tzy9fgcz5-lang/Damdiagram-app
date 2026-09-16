export const DB_NAME = "damstencil_app";
export const SCHEMA_VERSION = 2;

export const STORE_STANDEN = "standen";
export const STORE_LIJSTEN = "lijsten";
export const STORE_STENCILS = "stencils";
export const STORE_META = "meta";
export const STORE_HERKENNING_LOG = "herkenningCorrecties";

// De twee filtercategorieën waar de app ooit mee gestart is — sindsdien
// (2026-09-18) kan Jan er via Instellingen -> Database zelf categorieën bij
// maken, hernoemen of verwijderen (zie src/db/categorieen.js). Deze twee zijn
// verder niets bijzonders meer, alleen de starterswaarden voor een nieuwe,
// lege database.
export const DEFAULT_CATEGORIEEN = [
  {
    key: "speelsysteem",
    label: "Speelsysteem",
    waarden: ["klassiek", "flankspel", "Roozenburg", "Keller", "compositie met eindspel"],
  },
  { key: "type", label: "Type", waarden: ["directe combinatie", "forcing", "lokzet", "eindspel"] },
];

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
  // Nieuw: elke keer dat je een via een foto herkende stand opslaat, wordt hier (foto
  // + wat de app dacht + wat het uiteindelijk werd) bewaard — puur lokaal, alleen om
  // de fotoherkenning later mee te kunnen trainen. Zie src/db/herkenningLog.js.
  2(db) {
    const log = db.createObjectStore(STORE_HERKENNING_LOG, { keyPath: "id" });
    log.createIndex("createdAt", "createdAt", { unique: false });
  },
};
