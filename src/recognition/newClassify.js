// Poort van damscan/classify.js naar de browser (ES module i.p.v. CommonJS).
// Logica ONGEWIJZIGD overgenomen — dit is de nieuwe, per-bord-genormaliseerde
// classifier, nog niet de standaard in de app. Zie tests/compare.html voor de
// vergelijking met de bestaande classifier (src/recognition/classify.js).
//
//   import { createClassifier } from "./newClassify.js?v=20260923a";
//   const clf = createClassifier(weights); // weights = damscan/weights.json
//   const result = clf.classifyBoard(crops); // crops[i] = {gray,width,height} of {data,width,height}
//
// Eén beslissing per veld, maar MOET per bord (alle 50 crops in één keer): de
// kenmerken worden genormaliseerd t.o.v. de andere 49 velden van hetzelfde
// diagram — dat is precies wat de classifier ongevoelig maakt voor de drukstijl
// van het boek. Een los veld classificeren kan dus niet meer, en dat is met opzet.
import { extractFeatures, toGray, boardRelative } from "./newFeatures.js?v=20260923a";
import { predict } from "./newModel.js?v=20260923a";

// Gele rand hieronder; drempel uit de tabel van damscan/train.js (0,90 vangt op de
// huidige gelabelde set 85% van de fouten bij ongeveer een derde van de velden
// gemarkeerd — een redelijke middenweg, zie damscan/report.js).
export const FLAG_BELOW = 0.9;

// Wordt meegelogd bij elke correctie (zie herkenningLog.js), analoog aan
// RECOGNITION_VERSION in het oude classify.js. Ophogen bij een inhoudelijke
// wijziging aan newFeatures.js/newModel.js/newClassify.js, of bij een nieuwe
// damscan/weights.json (train.js meldt de gebruikte variant, die hier ook in kan).
export const RECOGNITION_VERSION = "nieuw-per-bord-2026-09-15";

export function createClassifier(weights) {
  function classifyBoard(crops) {
    if (crops.length !== 50) throw new Error(`Verwacht 50 velden, kreeg ${crops.length}`);

    const raw = [];
    const named = [];
    for (const c of crops) {
      const gray = c.gray || toGray(c.data, c.width, c.height, c.channels || 4);
      const f = extractFeatures(gray, c.width, c.height);
      raw.push(f.vector);
      named.push(f.named);
    }
    const full = boardRelative(raw);

    const squares = full.map((vector, i) => {
      const { label, probs, confidence } = predict(weights, vector);
      return {
        square: i + 1,
        label, // 'empty' | 'white' | 'black'
        confidence, // gekalibreerde kans, niet een verzonnen 0.75
        probs: { empty: probs[0], white: probs[1], black: probs[2] },
        features: named[i],
        flagged: confidence < FLAG_BELOW,
      };
    });

    return { squares, warnings: sanityCheck(squares) };
  }

  return { classifyBoard };
}

/**
 * Spelregels als vangnet. Corrigeert niets stilzwijgend: markeert alleen, zodat
 * jij het in de editor ziet.
 */
export function sanityCheck(squares) {
  const warnings = [];
  const count = (l) => squares.filter((s) => s.label === l).length;
  const nW = count('white');
  const nB = count('black');
  if (nW > 20) warnings.push({ type: 'count', text: `${nW} witte schijven gevonden (max 20)` });
  if (nB > 20) warnings.push({ type: 'count', text: `${nB} zwarte schijven gevonden (max 20)` });

  for (const s of squares) {
    if (s.label === 'white' && s.square <= 5) {
      warnings.push({ type: 'promotion', square: s.square, text: `wit op veld ${s.square}: dam?` });
    }
    if (s.label === 'black' && s.square >= 46) {
      warnings.push({ type: 'promotion', square: s.square, text: `zwart op veld ${s.square}: dam?` });
    }
  }
  return warnings;
}
