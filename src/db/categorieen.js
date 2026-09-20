import { openDb, tx, promisify } from "./db.js?v=20260920k";
import { STORE_LIJSTEN } from "./schema.js?v=20260920k";
import { getList, addListValue } from "./lijsten.js?v=20260920k";

// Filtercategorieën (Speelsysteem, Type, en wat Jan er zelf bij maakt via
// Instellingen -> Database) zitten in dezelfde IndexedDB-store als de oude,
// simpele lijsten (bv. `boekstijl`, die geen filtercategorie is) — het
// verschil is puur het `label`-veld: alleen records mét een label tellen als
// categorie (zie getAllCategorieen). De VOOR een categorie te kiezen
// waarden (`waarden`) beheer je met dezelfde `getList`/`addListValue` uit
// lijsten.js, want dat is exact hetzelfde als bij een gewone lijst.
export { getList as getCategorieWaarden, addListValue as addCategorieWaarde };

function slugify(label) {
  const basis = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return basis || "categorie";
}

export async function getAllCategorieen() {
  const db = await openDb();
  const all = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.getAll()));
  return all
    .filter((record) => record.label != null)
    .map((record) => ({ key: record.naam, label: record.label, waarden: record.waarden ?? [] }))
    .sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

export async function getCategorie(key) {
  const alle = await getAllCategorieen();
  return alle.find((c) => c.key === key) ?? null;
}

async function uniekeKey(basis) {
  const bestaand = new Set((await getAllCategorieen()).map((c) => c.key));
  if (!bestaand.has(basis)) return basis;
  let i = 2;
  while (bestaand.has(`${basis}-${i}`)) i++;
  return `${basis}-${i}`;
}

export async function addCategorie(label) {
  const key = await uniekeKey(slugify(label));
  const db = await openDb();
  await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.put({ naam: key, label, waarden: [] })));
  return { key, label, waarden: [] };
}

export async function renameCategorie(key, nieuwLabel) {
  const db = await openDb();
  const record = await tx(db, STORE_LIJSTEN, "readonly", (store) => promisify(store.get(key)));
  if (!record) return;
  await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.put({ ...record, label: nieuwLabel })));
}

export async function removeCategorie(key) {
  const db = await openDb();
  await tx(db, STORE_LIJSTEN, "readwrite", (store) => promisify(store.delete(key)));
}
