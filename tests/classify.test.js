import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260921ap";
import { classifyFromFeatures, CONFIDENCE_THRESHOLD } from "../src/recognition/classify.js?v=20260921ap";
import { PIECE_TYPES, FIELD_COUNT, fieldToCoord } from "../src/core/board.js?v=20260921ap";

const OUT_SIZE = 500;
const SQUARE = OUT_SIZE / 10;

function fieldCenter(f) {
  const { row, col } = fieldToCoord(f);
  return { cx: col * SQUARE + SQUARE / 2, cy: row * SQUARE + SQUARE / 2 };
}

// lightingAt(cx, cy) geeft een optionele helderheidsverschuiving voor die positie,
// zodat we een ongelijk belichte foto (schaduw, scheve bladzijde) kunnen simuleren.
function makeFeatures(occupiedMap, noiseScale = 1, rng = Math.random, lightingAt = () => 0) {
  const features = new Array(51).fill(null);
  const rand = (a, b) => a + rng() * (b - a);
  for (let f = 1; f <= 50; f++) {
    const { cx, cy } = fieldCenter(f);
    const light = lightingAt(cx, cy);
    const kind = occupiedMap[f];
    if (!kind) {
      const mean = 180 + light + rand(-6 * noiseScale, 6 * noiseScale);
      features[f] = { mean, std: 8 + rand(-2 * noiseScale, 2 * noiseScale), centerMean: mean, cx, cy };
    } else if (kind === "w") {
      const mean = 235 + light + rand(-5, 5);
      features[f] = { mean, std: 34 + rand(-3, 3), centerMean: mean, cx, cy };
    } else if (kind === "b") {
      const mean = 55 + light + rand(-5, 5);
      features[f] = { mean, std: 34 + rand(-3, 3), centerMean: mean, cx, cy };
    } else if (kind === "wk") {
      const mean = 235 + light + rand(-5, 5);
      features[f] = { mean, std: 55 + rand(-4, 4), centerMean: mean, cx, cy };
    } else if (kind === "bk") {
      const mean = 55 + light + rand(-5, 5);
      features[f] = { mean, std: 55 + rand(-4, 4), centerMean: mean, cx, cy };
    } else if (kind === "ring") {
      // Simuleert een open ringetje voor wit (zoals sommige boeken tekenen): het
      // venster-gemiddelde ligt door de rand van de ring net onder de achtergrond,
      // maar het midden van de ring blijft achtergrondkleurig (hol).
      features[f] = {
        mean: 178 + light + rand(-3, 3),
        std: 30 + rand(-3, 3),
        centerMean: 182 + light + rand(-3, 3),
        cx,
        cy,
      };
    }
  }
  return features;
}

describe("fotoherkenning: classificatie", () => {
  it("herkent de voorbeeldstand uit de opdracht correct (leeg/wit/zwart)", () => {
    const occ = { 13: "w", 15: "w", 33: "w", 1: "b", 5: "b", 30: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(42)));
    assertEqual(board[13], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[15], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[33], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[5], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[30], PIECE_TYPES.BLACK_PIECE);
    for (const f of [2, 3, 4, 6, 7, 20, 40]) assertEqual(board[f], null);
  });

  it("een volledig leeg bord blijft leeg, ook met ruis (veiligheidsklep bij ontbrekende splitsing)", () => {
    const { board } = classifyFromFeatures(makeFeatures({}, 1.5, mulberry32(7)));
    for (let f = 1; f <= 50; f++) assertEqual(board[f], null);
  });

  it("een schaarse stand (maar 2 stukken) wordt nog steeds herkend", () => {
    const occ = { 40: "w", 10: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(5)));
    assertEqual(board[40], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[10], PIECE_TYPES.BLACK_PIECE);
  });

  it("een drukke stand (44 van de 50 velden bezet) wordt grotendeels correct herkend", () => {
    const occ = {};
    for (let f = 1; f <= 22; f++) occ[f] = "b";
    for (let f = 29; f <= 50; f++) occ[f] = "w";
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(6)));
    let correct = 0;
    for (let f = 1; f <= FIELD_COUNT; f++) {
      const expected = occ[f] ? (occ[f] === "w" ? PIECE_TYPES.WHITE_PIECE : PIECE_TYPES.BLACK_PIECE) : null;
      if (board[f] === expected) correct++;
    }
    assertTrue(correct >= 45, `slechts ${correct}/50 correct`);
  });

  it("herkent geen dammen automatisch (bleek onbetrouwbaar) — elk bezet veld wordt de gewone kleur", () => {
    // "wk"/"bk" hier simuleert een veld met extra textuur (zoals een echte dam eruit kan
    // zien), maar de app mag dit nooit als dam classificeren — alleen als gewone schijf,
    // met de juiste kleur. Dammen wijst Jan zelf aan in de editor.
    const occ = { 13: "w", 33: "wk", 1: "b", 30: "bk" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(3)));
    assertEqual(board[13], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[33], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[30], PIECE_TYPES.BLACK_PIECE);
  });

  it("herkent een open ringetje (hol, wit) correct ondanks een donkerder venster-gemiddelde", () => {
    // Regressietest voor een echt gemelde fout: bij sommige boekstijlen (open ringetje
    // voor wit op een gearceerde achtergrond) trekt de ringrand het hele-venster-
    // gemiddelde net onder de achtergrond, waardoor wit eerder als zwart werd gelezen.
    // De classificatie moet daarom het midden van het veld gebruiken (dat blijft
    // achtergrondkleurig bij een holle ring), niet het venster-gemiddelde.
    const occ = { 15: "ring", 20: "ring", 1: "b", 5: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(23)));
    assertEqual(board[15], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[20], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[1], PIECE_TYPES.BLACK_PIECE);
    assertEqual(board[5], PIECE_TYPES.BLACK_PIECE);
  });

  it("blijft wit/zwart correct herkennen bij een schuine belichting over het bord", () => {
    // Regressietest voor de stap-2-reparatie: bij een echte foto is de linkerkant
    // vaak donkerder dan de rechterkant (schaduw, niet-platliggende bladzijde). Eén
    // vast gemiddelde voor het hele bord duwde de donkere kant dan ten onrechte naar
    // "zwart", ook als het daar leeg of wit was. Hier simuleren we een helling van
    // 40 grijswaarde-punten van links (donker) naar rechts (licht) over het bord.
    const gradient = (cx) => (cx / OUT_SIZE) * 40 - 20;
    const occ = { 6: "w", 16: "w", 26: "w", 36: "w", 46: "w", 10: "b", 20: "b", 30: "b", 40: "b", 50: "b" };
    const { board } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(17), gradient));
    // 6,16,26,36,46 zijn de meest linkse (dus donkerste) velden, maar zijn wit.
    for (const f of [6, 16, 26, 36, 46]) assertEqual(board[f], PIECE_TYPES.WHITE_PIECE);
    // 10,20,30,40,50 zijn de meest rechtse (dus lichtste) velden, maar zijn zwart.
    for (const f of [10, 20, 30, 40, 50]) assertEqual(board[f], PIECE_TYPES.BLACK_PIECE);
    // lege velden aan de donkere linkerkant moeten leeg blijven, niet "ten onrechte zwart".
    for (const f of [1, 11, 21, 31, 41]) assertEqual(board[f], null);
  });

  it("herkent stukken ook als de textuur geen duidelijke knik geeft (terugvalpad)", () => {
    // Regressietest voor een echt gemelde fout: bij een gearceerde achtergrond met een
    // geleidelijke (niet-tweedelige) textuurverdeling — geen scherp verschil tussen
    // "leeg" en "bezet" in venster-spreiding — gaf de oude, puur std-gebaseerde
    // bezet/leeg-splitsing bij Jan "0 schijven herkend" op meerdere echte foto's.
    // Hier simuleren we precies dat: std loopt geleidelijk op van veld tot veld (geen
    // knik), maar het midden van bezette velden wijkt wél duidelijk af van de
    // (effen) achtergrond — dat moet het terugvalpad opvangen.
    const rng = mulberry32(99);
    const occ = { 5: "w", 25: "w", 45: "w", 10: "b", 30: "b", 50: "b" };
    const features = new Array(51).fill(null);
    for (let f = 1; f <= 50; f++) {
      const { cx, cy } = fieldCenter(f);
      const std = 10 + (f / 50) * 15 + (rng() - 0.5) * 2; // geleidelijk oplopend, geen knik
      const kind = occ[f];
      const mean = kind === "w" ? 210 : kind === "b" ? 70 : 140 + (rng() - 0.5) * 4;
      features[f] = { mean, std, centerMean: mean, cx, cy };
    }
    const { board } = classifyFromFeatures(features);
    for (const f of [5, 25, 45]) assertEqual(board[f], PIECE_TYPES.WHITE_PIECE);
    for (const f of [10, 30, 50]) assertEqual(board[f], PIECE_TYPES.BLACK_PIECE);
    let leegCorrect = 0;
    for (let f = 1; f <= 50; f++) {
      if (!occ[f] && board[f] === null) leegCorrect++;
    }
    assertTrue(leegCorrect >= 40, `slechts ${leegCorrect}/44 lege velden correct`);
  });

  it("markeert een witte schijf op veld 1-5 of zwarte op 46-50 als onzeker (kan geen gewone schijf zijn)", () => {
    // Uit 22 echte, door Jan gecorrigeerde herkenningen: zo'n veld was daar altijd
    // fout. De kleur/plaats zelf wordt nooit stilzwijgend aangepast (soms bleek de
    // aanname toch net niet te kloppen) — alleen de betrouwbaarheid moet omlaag,
    // zodat dit in de editor opvalt.
    const occ = { 3: "w", 48: "b", 13: "w", 1: "b" };
    const { board, confidences } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(31)));
    assertEqual(board[3], PIECE_TYPES.WHITE_PIECE);
    assertEqual(board[48], PIECE_TYPES.BLACK_PIECE);
    assertTrue(confidences[3] < CONFIDENCE_THRESHOLD, `veld 3 (wit op 1-5) moet onzeker zijn, kreeg ${confidences[3]}`);
    assertTrue(confidences[48] < CONFIDENCE_THRESHOLD, `veld 48 (zwart op 46-50) moet onzeker zijn, kreeg ${confidences[48]}`);
    // een normaal, legaal bezet veld blijft gewoon zeker.
    assertTrue(confidences[13] > CONFIDENCE_THRESHOLD, `veld 13 zou niet onzeker moeten zijn`);
    assertTrue(confidences[1] > CONFIDENCE_THRESHOLD, `veld 1 (zwart, wel toegestaan) zou niet onzeker moeten zijn`);
  });

  it("mist geen hele kleur als die veel minder interne textuur heeft dan de andere (geredde fase)", () => {
    // Regressietest voor een echt gemeld probleem: bij sommige boekstijlen heeft
    // een effen zwarte schijf een veel lagere venster-spreiding (std) dan een wit
    // schijfje met een duidelijke rand. Eén enkele std-splitsing zet zwart dan
    // helemaal bij "leeg". Hier: wit met hoge std (duidelijk texturig), zwart met
    // lage std (net als leeg) maar wel een duidelijk andere helderheid dan de
    // achtergrond — de geredde fase moet dat zwart alsnog vinden.
    const rng = mulberry32(44);
    const whiteFields = [23, 24, 27, 28, 32, 37];
    const blackFields = [2, 4, 6, 8, 12, 13, 15, 19, 21, 25, 36];
    const features = new Array(51).fill(null);
    for (let f = 1; f <= 50; f++) {
      const { cx, cy } = fieldCenter(f);
      if (whiteFields.includes(f)) {
        features[f] = { mean: 210 + (rng() - 0.5) * 6, std: 18 + (rng() - 0.5) * 4, centerMean: 210 + (rng() - 0.5) * 6, cx, cy };
      } else if (blackFields.includes(f)) {
        features[f] = { mean: 100 + (rng() - 0.5) * 4, std: 5 + (rng() - 0.5) * 2, centerMean: 100 + (rng() - 0.5) * 4, cx, cy };
      } else {
        features[f] = { mean: 140 + (rng() - 0.5) * 4, std: 1.5 + (rng() - 0.5) * 1, centerMean: 140 + (rng() - 0.5) * 4, cx, cy };
      }
    }
    const { board } = classifyFromFeatures(features);
    for (const f of whiteFields) assertEqual(board[f], PIECE_TYPES.WHITE_PIECE, `veld ${f} zou wit moeten zijn`);
    for (const f of blackFields) assertEqual(board[f], PIECE_TYPES.BLACK_PIECE, `veld ${f} zou zwart moeten zijn (niet gemist)`);
  });

  it("duidelijke velden krijgen betrouwbaarheid boven de onzeker-drempel", () => {
    const occ = { 13: "w", 1: "b" };
    const { confidences } = classifyFromFeatures(makeFeatures(occ, 1, mulberry32(11)));
    assertTrue(confidences[13] > CONFIDENCE_THRESHOLD);
    assertTrue(confidences[1] > CONFIDENCE_THRESHOLD);
    assertTrue(confidences[25] > CONFIDENCE_THRESHOLD);
  });
});

// Echte meetwaarden [centerMean, std, diversiteit] per veld 1-50 van een foto met
// gearceerde donkere velden en effen zwarte schijven (Jan, 2026-09-20). Hier
// werden de zwarte schijven als "leeg" gezien en de gearceerde lege velden als
// zwart (omgekeerd) — terwijl de witte schijven wél goed gingen.
const HATCHED_PHOTO = [
  [20, 5.1, 0.70], [85, 32.4, 0.34], [14, 1.9, 0.70], [19, 2.9, 0.86], [18, 7.1, 0.83], [17, 4.1, 0.73], [16, 2.6, 0.84], [30, 7.9, 0.86], [17, 3.8, 0.74], [18, 3.9, 0.93], [15, 7.5, 0.85], [29, 5.5, 0.65], [20, 4.5, 0.89], [22, 3.9, 0.98], [112, 11.9, 0.73], [19, 1.7, 0.76], [64, 19.9, 0.69], [17, 2.7, 0.64], [98, 10.4, 0.41], [119, 14.1, 0.55], [93, 13.7, 0.53], [109, 19.9, 0.30], [114, 10.4, 0.33], [17, 7.8, 0.80], [181, 28.9, 0.98], [18, 5.7, 0.96], [173, 27.3, 0.93], [118, 9.4, 0.31], [12, 5.6, 0.95], [123, 8.0, 0.45], [173, 33.2, 0.92], [177, 24.9, 0.95], [107, 9.7, 0.51], [103, 9.4, 0.36], [177, 31.8, 0.90], [77, 15.8, 0.91], [98, 19.7, 0.84], [173, 21.0, 0.95], [176, 26.7, 0.98], [178, 32.1, 0.96], [169, 35.9, 0.88], [173, 33.0, 0.97], [175, 26.2, 0.97], [171, 30.4, 0.97], [166, 37.3, 0.90], [162, 48.8, 0.88], [165, 36.8, 0.94], [169, 24.0, 0.92], [162, 29.9, 0.95], [164, 32.9, 0.94],
];
const HATCHED_PHOTO_BLACK = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 24, 26, 29];
const HATCHED_PHOTO_WHITE = [25, 27, 31, 32, 35, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50];

describe("classifyFromFeatures — gearceerde velden met effen zwarte schijven", () => {
  const features = new Array(51).fill(null);
  const diversity = new Array(51).fill(0);
  HATCHED_PHOTO.forEach(([centerMean, std, div], i) => {
    const f = i + 1;
    const { cx, cy } = fieldCenter(f);
    features[f] = { mean: centerMean, std, centerMean, cx, cy };
    diversity[f] = div;
  });
  const { board } = classifyFromFeatures(features, diversity);

  it("herkent alle effen zwarte schijven als zwart (niet als leeg)", () => {
    for (const f of HATCHED_PHOTO_BLACK) assertEqual(board[f], PIECE_TYPES.BLACK_PIECE);
  });

  it("herkent alle witte schijven als wit", () => {
    for (const f of HATCHED_PHOTO_WHITE) assertEqual(board[f], PIECE_TYPES.WHITE_PIECE);
  });

  it("laat de gearceerde lege velden leeg", () => {
    for (let f = 1; f <= FIELD_COUNT; f++) {
      if (HATCHED_PHOTO_BLACK.includes(f) || HATCHED_PHOTO_WHITE.includes(f)) continue;
      assertEqual(board[f] || null, null);
    }
  });
});

// kleine deterministische pseudo-random generator, zodat deze tests niet toevallig eens falen
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
