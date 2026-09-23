import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260923j";
import { resetDatabaseForTests } from "../src/db/db.js?v=20260923j";
import { savePartij, getPartij, deletePartij, listPartijen } from "../src/db/partijen.js?v=20260923j";
import { createStartBoard } from "../src/core/board.js?v=20260923j";
import { getLegalMoves } from "../src/core/draughtsMoves.js?v=20260923j";
import { maakWortel, voegZetToe } from "../src/core/zettenboom.js?v=20260923j";

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
    const saved = await savePartij({ wit: "Wiersma", zwart: "Jansen", toernooi: "NK 1998", wortel });
    assertTrue(!!saved.id);
    const fetched = await getPartij(saved.id);
    assertEqual(fetched.wit, "Wiersma");
    assertEqual(fetched.zwart, "Jansen");
    assertEqual(fetched.wortel, wortel);
    assertEqual(fetched.beginFen, null, "standaard geen eigen beginstand");
  });

  it("behoudt createdAt bij bijwerken maar wijzigt updatedAt", async () => {
    await freshDb();
    const saved = await savePartij({ wit: "A", zwart: "B" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await savePartij({ ...saved, toernooi: "Nieuw" });
    assertEqual(updated.createdAt, saved.createdAt);
    assertTrue(updated.updatedAt !== saved.createdAt);
  });

  it("verwijdert een partij", async () => {
    await freshDb();
    const saved = await savePartij({ wit: "A", zwart: "B" });
    await deletePartij(saved.id);
    assertEqual(await getPartij(saved.id), undefined);
  });

  it("sorteert op datum, nieuwste eerst, met een lege datum onderaan", async () => {
    await freshDb();
    await savePartij({ wit: "Oud", datum: "1998-05-20" });
    await savePartij({ wit: "Nieuw", datum: "2025-06-20" });
    await savePartij({ wit: "Geen datum" });
    const lijst = await listPartijen();
    assertEqual(
      lijst.map((p) => p.wit),
      ["Nieuw", "Oud", "Geen datum"]
    );
  });
});
