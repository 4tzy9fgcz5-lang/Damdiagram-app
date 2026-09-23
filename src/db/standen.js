import { openDb, tx, promisify, newId } from "./db.js?v=20260923f";
import { STORE_STANDEN } from "./schema.js?v=20260923f";
import { parseFen, boardToFen } from "../core/fen.js?v=20260923f";
import { mirrorBoard } from "../core/board.js?v=20260923f";
import { formatZettenMetVarianten } from "../core/draughtsMoves.js?v=20260923f";

function canonicalFens(fenString) {
  const { board, turn } = parseFen(fenString);
  const fen = boardToFen(board, turn);
  const mirrorFen = boardToFen(mirrorBoard(board), turn);
  return { fen, mirrorFen };
}

// Oude standen hebben een vrij getypte oplossingstekst; nieuwe standen hebben
// aangeklikte `zetten`. Overal waar de oplossing als tekst getoond of geprint
// wordt (stencils, Word-export, leesbare export), via deze functie opvragen
// zodat beide soorten standen gewoon werken.
export function resolveOplossingTekst(stand) {
  if (stand.oplossing) return stand.oplossing;
  if (stand.zetten && stand.zetten.length > 0) {
    const { turn } = parseFen(stand.fen);
    return formatZettenMetVarianten(stand.zetten, turn, stand.zijvarianten ?? []);
  }
  return "";
}

function nowIso() {
  return new Date().toISOString();
}

// Kenmerken per filtercategorie (bv. { speelsysteem: ["Keller"], type: [...] })
// staan sinds 2026-09-18 in dit ene, vrij uit te breiden veld in plaats van
// een los `speelsystemen`- en `types`-veld. Oudere, al opgeslagen standen (of
// een oude back-up die je terugzet) hebben dat veld nog niet — deze functie
// leidt het dan alsnog af van de twee oude velden, zodat je nergens iets van
// hoeft te migreren en beide vormen gewoon blijven werken.
function normalizeCategorieen(record) {
  if (record.categorieen) return record.categorieen;
  const categorieen = {};
  if (record.speelsystemen?.length) categorieen.speelsysteem = [...record.speelsystemen];
  if (record.types?.length) categorieen.type = [...record.types];
  return categorieen;
}

export async function saveStand(input) {
  if (!input.fen) throw new Error("Een stand moet een FEN hebben.");
  const { fen, mirrorFen } = canonicalFens(input.fen);
  const db = await openDb();
  const isNew = !input.id;

  const record = {
    id: input.id ?? newId(),
    fen,
    mirrorFen,
    opdracht: input.opdracht ?? "",
    oplossing: input.oplossing ?? "",
    auteur: input.auteur ?? "",
    jaartal: input.jaartal ?? null,
    publicatie: input.publicatie ?? "",
    nummer: input.nummer ?? "",
    categorieen: normalizeCategorieen(input),
    moeilijkheid: input.moeilijkheid ?? null,
    notities: input.notities ?? "",
    zetten: input.zetten ?? [],
    zijvarianten: input.zijvarianten ?? [],
    boekstijl: input.boekstijl ?? "",
    foto: input.foto ?? null,
    gebruiktIn: input.gebruiktIn ?? [],
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };

  if (!isNew) {
    const existing = await getStand(input.id);
    if (existing) record.createdAt = existing.createdAt;
  }

  await tx(db, STORE_STANDEN, "readwrite", (store) => promisify(store.put(record)));
  return record;
}

export async function getStand(id) {
  const db = await openDb();
  const record = await tx(db, STORE_STANDEN, "readonly", (store) => promisify(store.get(id)));
  if (!record) return record;
  return { ...record, categorieen: normalizeCategorieen(record) };
}

export async function deleteStand(id) {
  const db = await openDb();
  await tx(db, STORE_STANDEN, "readwrite", (store) => promisify(store.delete(id)));
}

async function getAllStanden() {
  const db = await openDb();
  const all = await tx(db, STORE_STANDEN, "readonly", (store) => promisify(store.getAll()));
  return all.map((record) => ({ ...record, categorieen: normalizeCategorieen(record) }));
}

export async function findDuplicates(fenString) {
  const { fen, mirrorFen } = canonicalFens(fenString);
  const all = await getAllStanden();
  const exact = all.filter((s) => s.fen === fen);
  const mirrored = all.filter((s) => s.fen === mirrorFen && s.fen !== fen);
  return { exact, mirrored };
}

function matchesFilters(stand, filters) {
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${stand.auteur} ${stand.publicatie} ${stand.notities}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  // filters.categorieen: { [categorieKey]: { waarde } | { ongedefinieerd: true } }
  for (const [key, spec] of Object.entries(filters.categorieen ?? {})) {
    const waarden = stand.categorieen?.[key] ?? [];
    if (spec.ongedefinieerd) {
      if (waarden.length > 0) return false;
    } else if (spec.waarde && !waarden.includes(spec.waarde)) {
      return false;
    }
  }
  if (filters.moeilijkheid && stand.moeilijkheid !== filters.moeilijkheid) return false;
  if (filters.moeilijkheidOngedefinieerd && stand.moeilijkheid != null) return false;
  if (filters.jaartal && stand.jaartal !== filters.jaartal) return false;
  if (filters.metOplossing === true && !resolveOplossingTekst(stand)) return false;
  if (filters.metOplossing === false && resolveOplossingTekst(stand)) return false;
  if (filters.ongebruikt && stand.gebruiktIn.length > 0) return false;
  return true;
}

function compareStanden(a, b, sortBy, sortDir) {
  let cmp = 0;
  if (sortBy === "jaartal") cmp = (a.jaartal ?? 0) - (b.jaartal ?? 0);
  else if (sortBy === "auteur") cmp = a.auteur.localeCompare(b.auteur, "nl");
  else cmp = a.createdAt.localeCompare(b.createdAt);
  return sortDir === "desc" ? -cmp : cmp;
}

export async function listStanden(filters = {}) {
  const all = await getAllStanden();
  const filtered = all.filter((s) => matchesFilters(s, filters));
  const sortBy = filters.sortBy ?? "createdAt";
  const sortDir = filters.sortDir ?? "desc";
  filtered.sort((a, b) => compareStanden(a, b, sortBy, sortDir));
  return filtered;
}

// Massaal een kenmerk toewijzen (database-pagina, selectie -> "Kenmerken
// toevoegen"): de waarde komt er per geselecteerde stand bij, bestaande
// kenmerken in diezelfde categorie blijven staan (nooit vervangen — dat kan
// per ongeluk kenmerken van een deel van de selectie wegdrukken die je niet
// bedoeld had te wijzigen).
export async function bulkAddCategorieWaarde(standIds, key, waarde) {
  for (const id of standIds) {
    const stand = await getStand(id);
    if (!stand) continue;
    const huidig = stand.categorieen?.[key] ?? [];
    if (huidig.includes(waarde)) continue;
    await saveStand({ ...stand, categorieen: { ...stand.categorieen, [key]: [...huidig, waarde] } });
  }
}

// Bij het hernoemen van een wáárde binnen een categorie (Instellingen ->
// Database, bv. "klassiek" -> "Klassiek"): ook op alle standen die 'm al
// hadden aangevinkt de tekst bijwerken. Zonder dit zou zo'n stand na het
// hernoemen alsnog de oude tekst blijven tonen en onvindbaar worden via het
// (hernoemde) filter — puur de naam van de lijst-waarde aanpassen is dus niet
// genoeg.
export async function renameCategorieWaardeOpStanden(key, oud, nieuw) {
  const alle = await getAllStanden();
  for (const stand of alle) {
    const waarden = stand.categorieen?.[key];
    if (!waarden || !waarden.includes(oud)) continue;
    await saveStand({ ...stand, categorieen: { ...stand.categorieen, [key]: waarden.map((w) => (w === oud ? nieuw : w)) } });
  }
}

export async function markUsedIn(standId, stencilId) {
  const stand = await getStand(standId);
  if (!stand) return;
  const already = stand.gebruiktIn.some((g) => g.stencilId === stencilId);
  if (already) return;
  stand.gebruiktIn.push({ stencilId, datum: nowIso() });
  await saveStand(stand);
}

export async function unmarkUsedIn(standId, stencilId) {
  const stand = await getStand(standId);
  if (!stand) return;
  stand.gebruiktIn = stand.gebruiktIn.filter((g) => g.stencilId !== stencilId);
  await saveStand(stand);
}
