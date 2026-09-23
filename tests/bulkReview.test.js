import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260923i";
import { reviewScore, reviewReason, orderForReview, reviewCounts } from "../src/core/bulkReview.js?v=20260923i";

const good = (nr) => ({ nr, result: { uncertainFields: [], warnings: [] }, oplossingStatus: "ok" });
const yellow = (nr, n) => ({ nr, result: { uncertainFields: Array.from({ length: n }, (_, i) => i + 1), warnings: [] }, oplossingStatus: "" });

describe("bulkReview: volgorde van controleren", () => {
  it("zet twijfelgevallen eerst, de rest in boekvolgorde", () => {
    const list = [
      good(1),
      yellow(2, 1),
      good(3),
      { nr: 4, result: { uncertainFields: [], warnings: [] }, oplossingStatus: "fout" },
      yellow(5, 6),
      { nr: 6, manual: true },
      good(7),
    ];
    assertEqual(orderForReview(list, "twijfel").map((d) => d.nr), [6, 4, 5, 2, 1, 3, 7]);
  });

  it("laat de volgorde ongemoeid bij 'boek'", () => {
    const list = [good(1), yellow(2, 3), good(3)];
    assertEqual(orderForReview(list, "boek").map((d) => d.nr), [1, 2, 3]);
  });

  it("een oplossing die past maakt een diagram niet verdacht; een herstelde zet een beetje", () => {
    assertEqual(reviewScore(good(1)), 0);
    assertTrue(reviewScore({ ...good(1), oplossingStatus: "let-op" }) > 0 && reviewScore({ ...good(1), oplossingStatus: "let-op" }) < 100);
  });

  it("legt in gewoon Nederlands uit waarom een diagram vooraan staat", () => {
    assertEqual(reviewReason(good(1)), "");
    assertEqual(reviewReason(yellow(2, 1)), "1 onzeker veld");
    assertEqual(reviewReason(yellow(3, 4)), "4 onzekere velden");
    assertTrue(reviewReason({ oplossingStatus: "fout", result: { uncertainFields: [], warnings: [] } }).includes("oplossing past niet"));
  });

  it("telt hoeveel diagrammen zonder twijfel zijn", () => {
    const c = reviewCounts([good(1), good(2), yellow(3, 2), { manual: true }, { result: { uncertainFields: [], warnings: [] }, oplossingStatus: "fout" }]);
    assertEqual(c, { totaal: 5, zonderTwijfel: 2, onzeker: 1, oplossingFout: 1, handwerk: 1 });
  });
});
