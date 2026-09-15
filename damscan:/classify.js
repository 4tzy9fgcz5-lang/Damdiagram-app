'use strict';

/**
 * Runtime-classifier. Dit is wat je bestaande stap 1a/1b/2 vervangt.
 *
 *   const { createClassifier } = require('./classify');
 *   const clf = createClassifier(require('./weights.json'));
 *   const result = clf.classifyBoard(crops);   // crops[i] = {gray, width, height}
 *
 * Eén beslissing per veld, uitsluitend op basis van dat veld zelf.
 */

const { extractFeatures, toGray } = require('./features');
const { predict } = require('./model');

const FLAG_BELOW = 0.9; // gele rand hieronder; stel in op wat train.js adviseert

function createClassifier(weights) {
  function classifySquare(gray, width, height) {
    const { vector, named } = extractFeatures(gray, width, height);
    const { label, probs, confidence } = predict(weights, vector);
    return {
      label, // 'empty' | 'white' | 'black'
      confidence, // gekalibreerde kans, niet een verzonnen 0.75
      probs: { empty: probs[0], white: probs[1], black: probs[2] },
      features: named,
    };
  }

  /**
   * @param {Array} crops 50 crops, index 0 = veld 1. Accepteert {gray,width,height}
   *                      of {data,width,height} met RGBA-pixels.
   */
  function classifyBoard(crops) {
    if (crops.length !== 50) throw new Error(`Verwacht 50 velden, kreeg ${crops.length}`);
    const squares = crops.map((c, i) => {
      const gray = c.gray || toGray(c.data, c.width, c.height, c.channels || 4);
      const r = classifySquare(gray, c.width, c.height);
      return { square: i + 1, ...r, flagged: r.confidence < FLAG_BELOW };
    });
    return { squares, warnings: sanityCheck(squares) };
  }

  return { classifySquare, classifyBoard };
}

/**
 * Spelregels als vangnet. Corrigeert niets stilzwijgend: markeert alleen, zodat
 * jij het in de editor ziet.
 */
function sanityCheck(squares) {
  const warnings = [];
  const count = (l) => squares.filter((s) => s.label === l).length;
  const nW = count('white');
  const nB = count('black');
  if (nW > 20) warnings.push({ type: 'count', text: `${nW} witte schijven gevonden (max 20)` });
  if (nB > 20) warnings.push({ type: 'count', text: `${nB} zwarte schijven gevonden (max 20)` });

  for (const s of squares) {
    // Een gewone schijf kan hier niet staan; een dam wel. Dus: markeren als
    // "waarschijnlijk een dam", niet als fout.
    if (s.label === 'white' && s.square <= 5) {
      warnings.push({ type: 'promotion', square: s.square, text: `wit op veld ${s.square}: dam?` });
    }
    if (s.label === 'black' && s.square >= 46) {
      warnings.push({ type: 'promotion', square: s.square, text: `zwart op veld ${s.square}: dam?` });
    }
  }
  return warnings;
}

/**
 * Optioneel: als er te veel schijven van één kleur zijn, zet de minst zekere
 * exemplaren om naar de op één na waarschijnlijkste klasse. Alleen aanzetten als
 * je evalset laat zien dat het helpt.
 */
function enforceCounts(squares, max = 20) {
  const out = squares.map((s) => ({ ...s }));
  for (const colour of ['white', 'black']) {
    const idx = out.map((s, i) => [s, i]).filter(([s]) => s.label === colour);
    if (idx.length <= max) continue;
    idx.sort((a, b) => a[0].probs[colour] - b[0].probs[colour]);
    for (let k = 0; k < idx.length - max; k++) {
      const s = idx[k][0];
      const alt = Object.entries(s.probs)
        .filter(([l]) => l !== colour)
        .sort((a, b) => b[1] - a[1])[0];
      s.label = alt[0];
      s.confidence = alt[1];
      s.flagged = true;
      s.adjusted = true;
    }
  }
  return out;
}

module.exports = { createClassifier, sanityCheck, enforceCounts, FLAG_BELOW };
