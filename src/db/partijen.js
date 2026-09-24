import { openDb, tx, promisify, newId } from "./db.js?v=20260924f";
import { STORE_PARTIJEN } from "./schema.js?v=20260924f";
import { maakWortel } from "../core/zettenboom.js?v=20260924f";
import { splitNaam } from "../core/namen.js?v=20260924f";

// Fase 2 van de dam-toolkit-uitbreiding (CLAUDE.md, "Fasering"): hele partijen. Zelfde opzet als
// standen.js/eindspelen.js (saveX/getX/listX/deleteX), maar met een paar echte verschillen:
// - Geen `fen`/`mirrorFen`: een partij heeft geen ENE stand, maar een hele zettenboom (`wortel`,
//   zie zettenboom.js — een gewoon, plat JSON-object, dus rechtstreeks op te slaan).
// - `beginFen`: de meeste partijen beginnen gewoon aan de standaardopstelling (`null`); alleen
//   een partij/studie die ergens anders begint krijgt een eigen beginstand.
// - Metadata is die van een partij (spelers, toernooi), niet van een compositie (auteur/
//   moeilijkheid) — dat past niet op elkaar, vandaar een eigen archief i.p.v. de standen bij
//   standen.js te voegen. `categorieen` (Speelsysteem/Type/eigen categorieën) is wél hetzelfde,
//   gedeelde systeem als bij standen (zie categorieen.js) — Jans wens (2026-09-23): "eenzelfde
//   filteroptie als ik nu bij combinaties al heb".

function nowIso() {
  return new Date().toISOString();
}

// Sinds 2026-09-23 (CLAUDE.md-feedback): namen als los voornaam/achternaam-veld i.p.v. één
// ongesplitst veld, zodat de afdruk "Achternaam Voornaam" kan tonen zonder te hoeven gokken.
// Een partij die vóór deze wijziging is opgeslagen heeft alleen het oude `wit`/`zwart`-veld —
// die wordt hier alsnog gesplitst (net als `normalizeCategorieen` in standen.js), zonder dat er
// iets aan de opgeslagen data verandert totdat je 'm opnieuw opslaat.
function normalizeSpelers(record) {
  if (record.witVoornaam != null || record.witAchternaam != null) {
    return {
      witVoornaam: record.witVoornaam ?? "",
      witAchternaam: record.witAchternaam ?? "",
      zwartVoornaam: record.zwartVoornaam ?? "",
      zwartAchternaam: record.zwartAchternaam ?? "",
    };
  }
  const wit = splitNaam(record.wit);
  const zwart = splitNaam(record.zwart);
  return { witVoornaam: wit.voornaam, witAchternaam: wit.achternaam, zwartVoornaam: zwart.voornaam, zwartAchternaam: zwart.achternaam };
}

export async function savePartij(input) {
  const db = await openDb();
  const isNew = !input.id;

  const record = {
    id: input.id ?? newId(),
    ...normalizeSpelers(input),
    datum: input.datum ?? "",
    toernooi: input.toernooi ?? "",
    ronde: input.ronde ?? "",
    uitslag: input.uitslag ?? "",
    bron: input.bron ?? "",
    notities: input.notities ?? "",
    // Zelfde filtercategorieën als bij Combinaties (Speelsysteem, Type, en wat Jan er zelf via
    // Instellingen -> Database bij maakt) — Jans wens (CLAUDE.md-feedback 2026-09-23): "ik wil
    // dus eenzelfde filteroptie, als ik nu bij combinaties al heb". Bewust hetzelfde, gedeelde
    // `categorieen.js`-archief (niet een eigen setje per soort item), net als de vorm hier
    // ({ [categorieKey]: string[] }) gelijk aan die van standen.js.
    categorieen: input.categorieen ?? {},
    beginFen: input.beginFen ?? null,
    wortel: input.wortel ?? maakWortel(),
    // Fase 2, stap 5 (filmmodule): welke momenten (ply-index in de hoofdlijn, 0-based) gekozen
    // zijn voor het opdracht-/antwoordvel, en voor hoeveel diagrammen — bewaard bij de partij
    // (niet alleen als Word-bestand) zodat de vellen later opnieuw te maken/aan te passen zijn.
    // `null` = nog geen filmopdracht gemaakt.
    film: input.film ?? null,
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };

  if (!isNew) {
    const existing = await getPartij(input.id);
    if (existing) record.createdAt = existing.createdAt;
  }

  await tx(db, STORE_PARTIJEN, "readwrite", (store) => promisify(store.put(record)));
  return record;
}

export async function getPartij(id) {
  const db = await openDb();
  const record = await tx(db, STORE_PARTIJEN, "readonly", (store) => promisify(store.get(id)));
  if (!record) return record;
  return { ...record, ...normalizeSpelers(record), categorieen: record.categorieen ?? {} };
}

export async function deletePartij(id) {
  const db = await openDb();
  await tx(db, STORE_PARTIJEN, "readwrite", (store) => promisify(store.delete(id)));
}

// Sorteert op datum (nieuwste eerst); een lege/ontbrekende datum komt onderaan i.p.v. bovenaan
// (anders zou een partij waarvan je de datum nog niet hebt ingevuld steeds bovenaan de lijst
// staan). Filteren/zoeken (stap 3 van fase 2) komt hier later bij, net als bij listStanden.
export async function listPartijen() {
  const db = await openDb();
  const all = await tx(db, STORE_PARTIJEN, "readonly", (store) => promisify(store.getAll()));
  return all
    .map((record) => ({ ...record, ...normalizeSpelers(record), categorieen: record.categorieen ?? {} }))
    .sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
}
