import { openDb, tx, promisify } from "./db.js";
import { STORE_LIJSTEN } from "./schema.js";

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

async function saveListValues(naam, waarden) {
  const db = await openDb();
  await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.put({ naam, waarden })));
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
