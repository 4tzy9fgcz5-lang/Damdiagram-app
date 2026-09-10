import { openDb, tx, promisify, newId } from "./db.js";
import { STORE_STANDEN } from "./schema.js";
import { parseFen, boardToFen } from "../core/fen.js";
import { mirrorBoard } from "../core/board.js";

function canonicalFens(fenString) {
  const { board, turn } = parseFen(fenString);
  const fen = boardToFen(board, turn);
  const mirrorFen = boardToFen(mirrorBoard(board), turn);
  return { fen, mirrorFen };
}

function nowIso() {
  return new Date().toISOString();
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
    speelsystemen: input.speelsystemen ?? [],
    types: input.types ?? [],
    moeilijkheid: input.moeilijkheid ?? null,
    notities: input.notities ?? "",
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
  return tx(db, STORE_STANDEN, "readonly", (store) => promisify(store.get(id)));
}

export async function deleteStand(id) {
  const db = await openDb();
  await tx(db, STORE_STANDEN, "readwrite", (store) => promisify(store.delete(id)));
}

export async function duplicateStand(id) {
  const original = await getStand(id);
  if (!original) throw new Error("Stand niet gevonden.");
  const { id: _drop, createdAt: _c, updatedAt: _u, gebruiktIn: _g, ...rest } = original;
  return saveStand(rest);
}

async function getAllStanden() {
  const db = await openDb();
  return tx(db, STORE_STANDEN, "readonly", (store) => promisify(store.getAll()));
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
  if (filters.speelsysteem && !stand.speelsystemen.includes(filters.speelsysteem)) return false;
  if (filters.type && !stand.types.includes(filters.type)) return false;
  if (filters.moeilijkheid && stand.moeilijkheid !== filters.moeilijkheid) return false;
  if (filters.jaartal && stand.jaartal !== filters.jaartal) return false;
  if (filters.metOplossing === true && !stand.oplossing) return false;
  if (filters.metOplossing === false && stand.oplossing) return false;
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
