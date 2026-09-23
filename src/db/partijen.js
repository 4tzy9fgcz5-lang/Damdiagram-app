import { openDb, tx, promisify, newId } from "./db.js?v=20260923l";
import { STORE_PARTIJEN } from "./schema.js?v=20260923l";
import { maakWortel } from "../core/zettenboom.js?v=20260923l";

// Fase 2 van de dam-toolkit-uitbreiding (CLAUDE.md, "Fasering"): hele partijen. Zelfde opzet als
// standen.js/eindspelen.js (saveX/getX/listX/deleteX), maar met een paar echte verschillen:
// - Geen `fen`/`mirrorFen`: een partij heeft geen ENE stand, maar een hele zettenboom (`wortel`,
//   zie zettenboom.js — een gewoon, plat JSON-object, dus rechtstreeks op te slaan).
// - `beginFen`: de meeste partijen beginnen gewoon aan de standaardopstelling (`null`); alleen
//   een partij/studie die ergens anders begint krijgt een eigen beginstand.
// - Metadata is die van een partij (spelers, toernooi), niet van een compositie (auteur/
//   moeilijkheid/categorieën) — dat past niet op elkaar, vandaar een eigen archief i.p.v. de
//   generieke categorieën van standen.js erbij te wurmen.

function nowIso() {
  return new Date().toISOString();
}

export async function savePartij(input) {
  const db = await openDb();
  const isNew = !input.id;

  const record = {
    id: input.id ?? newId(),
    wit: input.wit ?? "",
    zwart: input.zwart ?? "",
    datum: input.datum ?? "",
    toernooi: input.toernooi ?? "",
    ronde: input.ronde ?? "",
    uitslag: input.uitslag ?? "",
    bron: input.bron ?? "",
    notities: input.notities ?? "",
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
  return tx(db, STORE_PARTIJEN, "readonly", (store) => promisify(store.get(id)));
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
  return all.sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
}
