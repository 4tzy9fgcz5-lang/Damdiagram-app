import { openDb, tx, promisify, newId } from "./db.js";
import { STORE_HERKENNING_LOG } from "./schema.js";
import { FIELD_COUNT } from "../core/board.js";

function nowIso() {
  return new Date().toISOString();
}

function correctedFields(initialBoard, finalBoard) {
  const fields = [];
  for (let f = 1; f <= FIELD_COUNT; f++) {
    if (initialBoard[f] !== finalBoard[f]) fields.push(f);
  }
  return fields;
}

// Bewaart, alleen lokaal in de browser, wat de fotoherkenning dacht en wat de
// uiteindelijke (door jou eventueel gecorrigeerde) stand werd — als toekomstig
// trainingsmateriaal voor een betere herkenning. Nooit automatisch gedeeld; komt
// alleen mee in een back-up die je zelf downloadt en verstuurt.
export async function logHerkenningCorrectie({ foto, initialBoard, finalBoard, confidences }) {
  if (!foto || !initialBoard || !finalBoard) return;
  const db = await openDb();
  const record = {
    id: newId(),
    foto,
    initialBoard,
    finalBoard,
    confidences: confidences ?? null,
    correctedFields: correctedFields(initialBoard, finalBoard),
    createdAt: nowIso(),
  };
  await tx(db, STORE_HERKENNING_LOG, "readwrite", (store) => promisify(store.put(record)));
  return record;
}

export async function getAllHerkenningCorrecties() {
  const db = await openDb();
  return tx(db, STORE_HERKENNING_LOG, "readonly", (store) => promisify(store.getAll()));
}

export async function putHerkenningCorrectie(record) {
  const db = await openDb();
  await tx(db, STORE_HERKENNING_LOG, "readwrite", (store) => promisify(store.put(record)));
}
