import { openDb, tx, promisify, newId } from "./db.js?v=20260923f";
import { STORE_EINDSPELEN } from "./schema.js?v=20260923f";
import { parseFen, boardToFen } from "../core/fen.js?v=20260923f";
import { mirrorBoard } from "../core/board.js?v=20260923f";

// Zelfde opzet als standen.js (saveStand/getStand/findDuplicates), maar dan
// voor de eigen eindspelen-opslagplaats. Twee verschillen met een
// combinatie-stand: geen `speelsysteem`/`types`-nalatenschap om terug te
// vertalen (deze store is nieuw, dus normalizeCategorieen is hier niet nodig),
// en een extra vrij tekstveld `toelichting` voor het winstprincipe — dat kan
// naast, of in plaats van, de klikbare zettenreeks staan.
function canonicalFens(fenString) {
  const { board, turn } = parseFen(fenString);
  const fen = boardToFen(board, turn);
  const mirrorFen = boardToFen(mirrorBoard(board), turn);
  return { fen, mirrorFen };
}

function nowIso() {
  return new Date().toISOString();
}

export async function saveEindspel(input) {
  if (!input.fen) throw new Error("Een eindspel moet een stand hebben.");
  const { fen, mirrorFen } = canonicalFens(input.fen);
  const db = await openDb();
  const isNew = !input.id;

  const record = {
    id: input.id ?? newId(),
    fen,
    mirrorFen,
    opdracht: input.opdracht ?? "",
    oplossing: input.oplossing ?? "",
    toelichting: input.toelichting ?? "",
    auteur: input.auteur ?? "",
    jaartal: input.jaartal ?? null,
    publicatie: input.publicatie ?? "",
    nummer: input.nummer ?? "",
    categorieen: input.categorieen ?? {},
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
    const existing = await getEindspel(input.id);
    if (existing) record.createdAt = existing.createdAt;
  }

  await tx(db, STORE_EINDSPELEN, "readwrite", (store) => promisify(store.put(record)));
  return record;
}

export async function getEindspel(id) {
  const db = await openDb();
  return tx(db, STORE_EINDSPELEN, "readonly", (store) => promisify(store.get(id)));
}

export async function deleteEindspel(id) {
  const db = await openDb();
  await tx(db, STORE_EINDSPELEN, "readwrite", (store) => promisify(store.delete(id)));
}

export async function listEindspelen() {
  const db = await openDb();
  return tx(db, STORE_EINDSPELEN, "readonly", (store) => promisify(store.getAll()));
}

export async function findEindspelDuplicates(fenString) {
  const { fen, mirrorFen } = canonicalFens(fenString);
  const all = await listEindspelen();
  const exact = all.filter((s) => s.fen === fen);
  const mirrored = all.filter((s) => s.fen === mirrorFen && s.fen !== fen);
  return { exact, mirrored };
}
