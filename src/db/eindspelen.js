import { openDb, tx, promisify } from "./db.js?v=20260922a";
import { STORE_EINDSPELEN } from "./schema.js?v=20260922a";

// Stap 1 van de eindspelen-uitbreiding: alleen de opslagplaats en een manier
// om 'm leeg uit te lezen. Opslaan/bewerken (saveEindspel e.d.) komt in een
// volgende stap, samen met het invoerscherm.
export async function listEindspelen() {
  const db = await openDb();
  return tx(db, STORE_EINDSPELEN, "readonly", (store) => promisify(store.getAll()));
}
