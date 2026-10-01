import { describe, it, assertEqual } from "./test-runner.js?v=20261001d";
import { niveauVan, verdeelAantal, kiesStandenVoorBlad, standIdsInProgramma, verdeelReeks, kiesReeks } from "../src/stencil/genereer.js?v=20261001d";

function stand(id, moeilijkheid) {
  return { id, moeilijkheid };
}
// Vaste "willekeurigheid" zodat tests herhaalbaar zijn.
const vast = () => 0.5;

describe("genereer: niveau en verdeling", () => {
  it("halve ster telt bij de hele ster eronder", () => {
    assertEqual([niveauVan(2), niveauVan(2.5), niveauVan(0.5), niveauVan(null)], [2, 2, 1, null]);
  });
  it("gelijkmatig: 24 over 4 niveaus is 6-6-6-6", () => {
    assertEqual(verdeelAantal(24, [1, 2, 3, 4], "gelijk"), { 1: 6, 2: 6, 3: 6, 4: 6 });
  });
  it("gelijkmatig: restje gaat naar de moeilijkste niveaus", () => {
    assertEqual(verdeelAantal(25, [1, 2, 3, 4], "gelijk"), { 1: 6, 2: 6, 3: 6, 4: 7 });
    assertEqual(verdeelAantal(26, [1, 2, 3, 4], "gelijk"), { 1: 6, 2: 6, 3: 7, 4: 7 });
  });
  it("meer makkelijk: 24 over 4 niveaus is 8-7-5-4", () => {
    assertEqual(verdeelAantal(24, [1, 2, 3, 4], "makkelijk"), { 1: 8, 2: 7, 3: 5, 4: 4 });
  });
  it("totaal klopt altijd", () => {
    for (const modus of ["gelijk", "makkelijk"]) {
      for (let t = 1; t <= 40; t++) {
        const v = verdeelAantal(t, [1, 2, 3], modus);
        assertEqual(v[1] + v[2] + v[3], t);
      }
    }
  });
  it("zelf bepalen geeft de ingevulde aantallen terug", () => {
    assertEqual(verdeelAantal(0, [1, 2], "zelf", { 1: 3, 2: "5" }), { 1: 3, 2: 5 });
  });
});

describe("genereer: standen kiezen", () => {
  const standen = [stand("a", 1), stand("b", 1.5), stand("c", 2), stand("d", 3), stand("e", 3.5), stand("f", null), stand("g", 5)];
  it("kiest per niveau, makkelijk -> moeilijk, en negeert standen zonder sterren en buiten bereik", () => {
    const r = kiesStandenVoorBlad({ standen, aantallen: { 1: 1, 2: 1, 3: 2 }, rng: vast });
    assertEqual(r.gekozen.length, 4);
    const m = r.gekozen.map((s) => s.moeilijkheid);
    assertEqual(m, [...m].sort((x, y) => x - y));
    assertEqual(r.zonderSterren, 1);
    assertEqual(r.tekorten, []);
  });
  it("sluit uitgesloten standen uit", () => {
    const r = kiesStandenVoorBlad({ standen, uitgesloten: new Set(["c"]), aantallen: { 2: 1 }, rng: vast });
    assertEqual(r.gekozen.length, 0);
    assertEqual(r.tekorten, [{ niveau: 2, gevraagd: 1, beschikbaar: 0 }]);
    assertEqual(r.uitgeslotenAantal, 1);
  });
  it("meldt een tekort en vult alleen aan als dat is gevraagd", () => {
    const zonder = kiesStandenVoorBlad({ standen, aantallen: { 2: 2, 3: 1 }, rng: vast });
    assertEqual(zonder.gekozen.length, 2);
    assertEqual(zonder.tekorten, [{ niveau: 2, gevraagd: 2, beschikbaar: 1 }]);
    const met = kiesStandenVoorBlad({ standen, aantallen: { 2: 2, 3: 1 }, aanvullen: true, rng: vast });
    assertEqual(met.gekozen.length, 3);
    assertEqual(met.aangevuld, 1);
  });
  it("kiest nooit twee keer dezelfde stand", () => {
    const r = kiesStandenVoorBlad({ standen, aantallen: { 1: 5, 2: 5, 3: 5 }, aanvullen: true, rng: vast });
    const ids = r.gekozen.map((s) => s.id);
    assertEqual(new Set(ids).size, ids.length);
  });
});

describe("genereer: programma", () => {
  const stencils = [
    { id: "s1", programma: "Club X", standen: [{ standId: "a" }, { standId: "b" }] },
    { id: "s2", programma: "club x ", standen: [{ standId: "c" }] },
    { id: "s3", programma: "Ander", standen: [{ standId: "d" }] },
    { id: "s4", standen: [{ standId: "e" }] },
  ];
  it("verzamelt standen van hetzelfde programma (hoofdletters/spaties maken niet uit)", () => {
    assertEqual([...standIdsInProgramma(stencils, "Club X")].sort(), ["a", "b", "c"]);
  });
  it("lege programmanaam sluit niets uit; eigen blad telt niet mee", () => {
    assertEqual(standIdsInProgramma(stencils, "").size, 0);
    assertEqual([...standIdsInProgramma(stencils, "Club X", "s2")].sort(), ["a", "b"]);
  });
});

describe("genereer: doorlopend plan (reeks bladen)", () => {
  const niveaus = [1, 2, 3, 4];
  const gemiddeld = (aant) => {
    const totaal = niveaus.reduce((som, n) => som + aant[n], 0);
    return niveaus.reduce((som, n) => som + n * aant[n], 0) / totaal;
  };
  it("elk blad heeft precies het gevraagde aantal diagrammen", () => {
    for (const b of verdeelReeks(6, 12, niveaus)) assertEqual(niveaus.reduce((som, n) => som + b[n], 0), 12);
  });
  it("eerste blad is 'meer makkelijk', laatste blad het spiegelbeeld", () => {
    const r = verdeelReeks(6, 24, niveaus);
    assertEqual(r[0], verdeelAantal(24, niveaus, "makkelijk"));
    assertEqual([r[5][1], r[5][2], r[5][3], r[5][4]], [r[0][4], r[0][3], r[0][2], r[0][1]]);
  });
  it("elk blad is gemiddeld moeilijker dan het vorige", () => {
    for (const perBlad of [12, 24]) {
      const r = verdeelReeks(6, perBlad, niveaus).map(gemiddeld);
      for (let i = 1; i < r.length; i++) assertEqual(r[i] > r[i - 1], true);
    }
  });
  it("kiesReeks gebruikt nooit dezelfde stand op twee bladen", () => {
    const standen = [];
    for (let i = 0; i < 40; i++) standen.push({ id: "s" + i, moeilijkheid: 1 + (i % 4) });
    const reeks = kiesReeks({ standen, aantallenPerBlad: verdeelReeks(3, 8, niveaus), rng: vast });
    const ids = reeks.flatMap((r) => r.gekozen.map((s) => s.id));
    assertEqual(ids.length, 24);
    assertEqual(new Set(ids).size, 24);
  });
  it("kiesReeks respecteert uitgesloten standen", () => {
    const standen = [stand("a", 1), stand("b", 1), stand("c", 1)];
    const reeks = kiesReeks({ standen, uitgesloten: new Set(["a"]), aantallenPerBlad: [{ 1: 1 }, { 1: 1 }, { 1: 1 }], rng: vast });
    assertEqual(reeks.map((r) => r.gekozen.length), [1, 1, 0]);
  });
});
