import { openDb, tx, promisify } from "./db.js?v=20260925b";
import { STORE_LIJSTEN } from "./schema.js?v=20260925b";

export async function getList(naam) {
  const db = await openDb();
  const record = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.get(naam)));
  return record?.waarden ?? [];
}

export async function getAllLists() {
  const db = await openDb();
  const all = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.getAll()));
  const result = {};
  for (const { naam, waarden } of all) result[naam] = waarden;
  return result;
}

// Bestaande velden op het record behouden (met name `label` — zie
// categorieen.js) in plaats van het record blind te overschrijven: anders zou
// het toevoegen/hernoemen/verwijderen van een waarde in een filtercategorie
// per ongeluk `label` wegvegen, waardoor die categorie zelf onzichtbaar werd
// (categorieen.js herkent een record als categorie aan de aanwezigheid van
// `label`).
async function saveListValues(naam, waarden) {
  const db = await openDb();
  const existing = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.get(naam)));
  await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.put({ ...existing, naam, waarden })));
  return waarden;
}

export async function addListValue(naam, waarde) {
  const waarden = await getList(naam);
  if (waarden.includes(waarde)) return waarden;
  return saveListValues(naam, [...waarden, waarde]);
}

export async function renameListValue(naam, oud, nieuw) {
  const waarden = await getList(naam);
  return saveListValues(
    naam,
    waarden.map((w) => (w === oud ? nieuw : w))
  );
}

export async function removeListValue(naam, waarde) {
  const waarden = await getList(naam);
  return saveListValues(
    naam,
    waarden.filter((w) => w !== waarde)
  );
}
