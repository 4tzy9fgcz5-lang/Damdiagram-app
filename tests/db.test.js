import { describe, it, assertEqual, assertTrue } from "./test-runner.js";
import { resetDatabaseForTests } from "../src/db/db.js";
import {
  saveStand,
  getStand,
  deleteStand,
  duplicateStand,
  findDuplicates,
  listStanden,
  markUsedIn,
} from "../src/db/standen.js";
import { getList, addListValue, renameListValue, removeListValue } from "../src/db/lijsten.js";
import { saveStencil, getStencil, listStencils, deleteStencil } from "../src/db/stencils.js";
import { exportAll, importAll, buildShareData } from "../src/db/backup.js";
import { logHerkenningCorrectie, getAllHerkenningCorrecties } from "../src/db/herkenningLog.js";

async function freshDb() {
  await resetDatabaseForTests();
}

describe("database: standen", () => {
  it("slaat een nieuwe stand op en kan hem terugvinden", async () => {
    await freshDb();
    const saved = await saveStand({ fen: "W:W13,15,33:B1,5,30", auteur: "Test" });
    assertTrue(!!saved.id);
    const fetched = await getStand(saved.id);
    assertEqual(fetched.auteur, "Test");
    assertEqual(fetched.fen, "W:W13,15,33:B1,5,30");
  });

  it("normaliseert de FEN bij opslaan", async () => {
    await freshDb();
    const saved = await saveStand({ fen: "w:w33,15,13:b30,5,1" });
    assertEqual(saved.fen, "W:W13,15,33:B1,5,30");
  });

  it("behoudt createdAt bij bijwerken maar wijzigt updatedAt", async () => {
    await freshDb();
    const saved = await saveStand({ fen: "W:W13:B1" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await saveStand({ ...saved, auteur: "Nieuw" });
    assertEqual(updated.createdAt, saved.createdAt);
    assertTrue(updated.updatedAt !== saved.createdAt || updated.updatedAt >= saved.createdAt);
  });

  it("herkent een exacte dubbele stand", async () => {
    await freshDb();
    await saveStand({ fen: "W:W13,15,33:B1,5,30" });
    const { exact } = await findDuplicates("W:W33,15,13:B1,5,30");
    assertEqual(exact.length, 1);
  });

  it("herkent een gespiegelde dubbele stand", async () => {
    await freshDb();
    await saveStand({ fen: "W:W13,15,33:B1,5,30" });
    const { mirrored, exact } = await findDuplicates("W:W11,13,33:B1,5,26");
    assertEqual(exact.length, 0);
    assertEqual(mirrored.length, 1);
  });

  it("dupliceert een stand als nieuw record", async () => {
    await freshDb();
    const original = await saveStand({ fen: "W:W13:B1", auteur: "A" });
    const copy = await duplicateStand(original.id);
    assertTrue(copy.id !== original.id);
    assertEqual(copy.auteur, "A");
  });

  it("verwijdert een stand", async () => {
    await freshDb();
    const saved = await saveStand({ fen: "W:W13:B1" });
    await deleteStand(saved.id);
    const fetched = await getStand(saved.id);
    assertEqual(fetched, undefined);
  });

  it("filtert op speelsysteem en zoekterm", async () => {
    await freshDb();
    await saveStand({ fen: "W:W13:B1", speelsystemen: ["Keller"], auteur: "Jansen" });
    await saveStand({ fen: "W:W14:B2", speelsystemen: ["klassiek"], auteur: "Pietersen" });
    const kellerStanden = await listStanden({ speelsysteem: "Keller" });
    assertEqual(kellerStanden.length, 1);
    const gezocht = await listStanden({ search: "jansen" });
    assertEqual(gezocht.length, 1);
  });

  it("markeert een stand als gebruikt in een stencil", async () => {
    await freshDb();
    const saved = await saveStand({ fen: "W:W13:B1" });
    await markUsedIn(saved.id, "stencil-1");
    const fetched = await getStand(saved.id);
    assertEqual(fetched.gebruiktIn.length, 1);
    assertEqual(fetched.gebruiktIn[0].stencilId, "stencil-1");
  });
});

describe("database: eigen lijsten", () => {
  it("bevat de standaardlijsten na openen", async () => {
    await freshDb();
    const speelsystemen = await getList("speelsysteem");
    assertTrue(speelsystemen.includes("Keller"));
  });

  it("kan een waarde toevoegen, hernoemen en verwijderen", async () => {
    await freshDb();
    await addListValue("type", "nieuwe-tag");
    let waarden = await getList("type");
    assertTrue(waarden.includes("nieuwe-tag"));

    await renameListValue("type", "nieuwe-tag", "hernoemde-tag");
    waarden = await getList("type");
    assertTrue(waarden.includes("hernoemde-tag"));
    assertTrue(!waarden.includes("nieuwe-tag"));

    await removeListValue("type", "hernoemde-tag");
    waarden = await getList("type");
    assertTrue(!waarden.includes("hernoemde-tag"));
  });
});

describe("database: stencils", () => {
  it("slaat een stencil op en kan hem ophalen", async () => {
    await freshDb();
    const saved = await saveStencil({
      titel: "Test",
      standen: [{ standId: "a", opdracht: "" }, { standId: "b", opdracht: "" }],
    });
    const fetched = await getStencil(saved.id);
    assertEqual(fetched.titel, "Test");
    assertEqual(fetched.standen.length, 2);
  });

  it("verwijdert een stencil", async () => {
    await freshDb();
    const saved = await saveStencil({ titel: "Weg" });
    await deleteStencil(saved.id);
    const list = await listStencils();
    assertTrue(!list.some((s) => s.id === saved.id));
  });
});

describe("database: herkenning-logboek", () => {
  it("logt een correctie met de juiste velden die veranderd zijn", async () => {
    await freshDb();
    const initialBoard = new Array(51).fill(null);
    initialBoard[1] = "bp";
    initialBoard[13] = "bp"; // fout: dit moet wit zijn
    const finalBoard = new Array(51).fill(null);
    finalBoard[1] = "bp";
    finalBoard[13] = "wp"; // door de gebruiker gecorrigeerd

    const record = await logHerkenningCorrectie({
      foto: "data:image/jpeg;base64,xxx",
      initialBoard,
      finalBoard,
      confidences: null,
    });
    assertTrue(!!record.id);
    assertEqual(record.correctedFields.length, 1);
    assertEqual(record.correctedFields[0], 13);

    const all = await getAllHerkenningCorrecties();
    assertEqual(all.length, 1);
  });

  it("logt niets zonder foto of zonder een van beide borden", async () => {
    await freshDb();
    await logHerkenningCorrectie({ foto: null, initialBoard: [], finalBoard: [] });
    const all = await getAllHerkenningCorrecties();
    assertEqual(all.length, 0);
  });

  it("neemt het logboek mee in een volledige back-up en bij terugzetten", async () => {
    await freshDb();
    const board = new Array(51).fill(null);
    board[1] = "wp";
    await logHerkenningCorrectie({ foto: "data:x", initialBoard: board, finalBoard: board });
    const backup = await exportAll();
    assertEqual(backup.herkenningCorrecties.length, 1);

    await freshDb();
    await importAll(backup, { mode: "replace" });
    const restored = await getAllHerkenningCorrecties();
    assertEqual(restored.length, 1);
  });
});

describe("database: back-up", () => {
  it("exporteert alle standen, lijsten en stencils", async () => {
    await freshDb();
    await saveStand({ fen: "W:W13:B1" });
    await saveStencil({ titel: "Mijn stencil" });
    const data = await exportAll();
    assertEqual(data.standen.length, 1);
    assertEqual(data.stencils.length, 1);
    assertTrue(Object.keys(data.lijsten).includes("speelsysteem"));
  });

  it("samenvoegen voegt geen dubbele standen toe", async () => {
    await freshDb();
    await saveStand({ fen: "W:W13,15,33:B1,5,30", auteur: "Origineel" });
    const backup = await exportAll();
    await importAll(backup, { mode: "merge" });
    const all = await listStanden();
    assertEqual(all.length, 1);
  });

  it("samenvoegen zet standIds van stencils correct om naar bestaande standen", async () => {
    await freshDb();
    const stand = await saveStand({ fen: "W:W13:B1" });
    await saveStencil({ titel: "Mijn stencil", standen: [{ standId: stand.id, opdracht: "" }] });
    const backup = await exportAll();

    await freshDb();
    const differentStand = await saveStand({ fen: "W:W13:B1" });
    assertTrue(differentStand.id !== stand.id);

    await importAll(backup, { mode: "merge" });
    const all = await listStanden();
    assertEqual(all.length, 1);
    const stencils = await listStencils();
    assertEqual(stencils.length, 1);
    assertEqual(stencils[0].standen, [{ standId: differentStand.id, opdracht: "" }]);
  });

  it("vervangen zet de hele database over", async () => {
    await freshDb();
    await saveStand({ fen: "W:W13:B1" });
    const backup = await exportAll();
    await freshDb();
    await saveStand({ fen: "W:W14:B2" });
    await importAll(backup, { mode: "replace" });
    const all = await listStanden();
    assertEqual(all.length, 1);
    assertEqual(all[0].fen, "W:W13:B1");
  });

  it("bouwt een deel-pakketje voor gekozen standen en kan het op een ander apparaat samenvoegen", async () => {
    await freshDb();
    const a = await saveStand({ fen: "W:W13:B1", auteur: "Een" });
    await saveStand({ fen: "W:W14:B2", auteur: "Niet gekozen" });
    const share = await buildShareData([a.id]);
    assertEqual(share.standen.length, 1);
    assertEqual(share.standen[0].auteur, "Een");

    await freshDb();
    await importAll(share, { mode: "merge" });
    const all = await listStanden();
    assertEqual(all.length, 1);
    assertEqual(all[0].auteur, "Een");
  });
});
