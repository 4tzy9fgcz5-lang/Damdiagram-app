import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260925d";
import { openDb, tx, promisify, resetDatabaseForTests } from "../src/db/db.js?v=20260925d";
import { STORE_PARTIJEN } from "../src/db/schema.js?v=20260925d";
import { savePartij, getPartij, deletePartij, listPartijen } from "../src/db/partijen.js?v=20260925d";
import { createStartBoard } from "../src/core/board.js?v=20260925d";
import { getLegalMoves } from "../src/core/draughtsMoves.js?v=20260925d";
import { maakWortel, voegZetToe } from "../src/core/zettenboom.js?v=20260925d";

async function freshDb() {
  await resetDatabaseForTests();
}

// Een kleine, maar echte boom (hoofdlijn + 1 variant, met commentaar) — gebouwd met de
// regelengine, net als in tests/zettenboom.test.js, zodat dit ook meteen bewijst dat zo'n boom
// heelhuids door IndexedDB heen komt (plat JSON-object, geen functies/Date's/Map's erin).
function eenEchteBoom() {
  const board = createStartBoard();
  const wortel = maakWortel();
  voegZetToe(wortel, board, "white", getLegalMoves(board, "white")[0], { teken: "!" });
  voegZetToe(wortel, board, "white", getLegalMoves(board, "white")[1], { commentaar: "een alternatief" });
  return wortel;
}

describe("database: partijen", () => {
  it("slaat een partij met een boom op en kan hem terugvinden", async () => {
    await freshDb();
    const wortel = eenEchteBoom();
    const saved = await savePartij({ witAchternaam: "Wiersma", zwartAchternaam: "Jansen", toernooi: "NK 1998", wortel });
    assertTrue(!!saved.id);
    const fetched = await getPartij(saved.id);
    assertEqual(fetched.witAchternaam, "Wiersma");
    assertEqual(fetched.zwartAchternaam, "Jansen");
    assertEqual(fetched.wortel, wortel);
    assertEqual(fetched.beginFen, null, "standaard geen eigen beginstand");
  });

  it("behoudt createdAt bij bijwerken maar wijzigt updatedAt", async () => {
    await freshDb();
    const saved = await savePartij({ witAchternaam: "A", zwartAchternaam: "B" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await savePartij({ ...saved, toernooi: "Nieuw" });
    assertEqual(updated.createdAt, saved.createdAt);
    assertTrue(updated.updatedAt !== saved.createdAt);
  });

  it("verwijdert een partij", async () => {
    await freshDb();
    const saved = await savePartij({ witAchternaam: "A", zwartAchternaam: "B" });
    await deletePartij(saved.id);
    assertEqual(await getPartij(saved.id), undefined);
  });

  it("sorteert op datum, nieuwste eerst, met een lege datum onderaan", async () => {
    await freshDb();
    await savePartij({ witAchternaam: "Oud", datum: "1998-05-20" });
    await savePartij({ witAchternaam: "Nieuw", datum: "2025-06-20" });
    await savePartij({ witAchternaam: "Geen datum" });
    const lijst = await listPartijen();
    assertEqual(
      lijst.map((p) => p.witAchternaam),
      ["Nieuw", "Oud", "Geen datum"]
    );
  });

  it("bewaart de gekozen filmmomenten (stap 5) en laat ze standaard leeg", async () => {
    await freshDb();
    const zonder = await savePartij({ witAchternaam: "A", zwartAchternaam: "B" });
    assertEqual(zonder.film, null);

    const film = { aantalDiagrammen: 6, zetIndices: [1, 5, 12, 18, 24, 30] };
    const met = await savePartij({ ...zonder, film });
    assertEqual((await getPartij(met.id)).film, film);
  });

  it("bewaart categorieën (stap 2, 2026-09-23) en laat ze standaard leeg", async () => {
    await freshDb();
    const zonder = await savePartij({ witAchternaam: "A", zwartAchternaam: "B" });
    assertEqual(zonder.categorieen, {});

    const met = await savePartij({ ...zonder, categorieen: { speelsysteem: ["Keller"] } });
    assertEqual((await getPartij(met.id)).categorieen, { speelsysteem: ["Keller"] });
  });

  it("geeft een oude partij (vóór categorieën) alsnog een leeg categorieen-object bij het lezen", async () => {
    await freshDb();
    const db = await openDb();
    const oud = { id: "oude-partij-2", witAchternaam: "A", zwartAchternaam: "B", createdAt: "x", updatedAt: "x" };
    await tx(db, STORE_PARTIJEN, "readwrite", (store) => promisify(store.put(oud)));
    assertEqual((await getPartij("oude-partij-2")).categorieen, {});
    await deletePartij("oude-partij-2");
  });

  it("splitst een oude, ongesplitste naam (vóór 2026-09-23) alsnog bij het lezen, zonder op te slaan", async () => {
    await freshDb();
    const db = await openDb();
    const oud = { id: "oude-partij", wit: "Jan van der Star", zwart: "Piet Jansen", createdAt: "x", updatedAt: "x" };
    await tx(db, STORE_PARTIJEN, "readwrite", (store) => promisify(store.put(oud)));

    const gelezen = await getPartij("oude-partij");
    assertEqual(gelezen.witVoornaam, "Jan");
    assertEqual(gelezen.witAchternaam, "van der Star");
    assertEqual(gelezen.zwartVoornaam, "Piet");
    assertEqual(gelezen.zwartAchternaam, "Jansen");
    await deletePartij("oude-partij"); // tests.html deelt de IndexedDB met de echte app (zelfde origin) — nooit een testrecord laten staan
  });
});
