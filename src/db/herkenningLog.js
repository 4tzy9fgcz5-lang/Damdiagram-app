import { openDb, tx, promisify, newId } from "./db.js?v=20260914f";
import { STORE_HERKENNING_LOG } from "./schema.js?v=20260914f";
import { FIELD_COUNT } from "../core/board.js?v=20260914f";

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
export async function logHerkenningCorrectie({ foto, initialBoard, finalBoard, confidences, modelVersion }) {
  if (!foto || !initialBoard || !finalBoard) return;
  const db = await openDb();
  const record = {
    id: newId(),
    foto,
    initialBoard,
    finalBoard,
    confidences: confidences ?? null,
    // Welke versie van de herkenning dit resultaat gaf (zie RECOGNITION_VERSION in
    // classify.js) — zodat een latere foutanalyse per versie kan filteren, i.p.v.
    // oude en nieuwe resultaten door elkaar te meten.
    modelVersion: modelVersion ?? null,
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
