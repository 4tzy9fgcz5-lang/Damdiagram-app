'use strict';

/**
 * Traint de classifier en rapporteert een EERLIJK accuraatheidscijfer via
 * leave-one-photo-out cross-validatie: elke foto wordt beoordeeld door een model
 * dat die foto nooit gezien heeft. Velden binnen één foto lijken sterk op elkaar,
 * dus gewone k-fold zou het cijfer flatteren.
 *
 *   node train.js [labels.txt] [crops] [weights.json]
 */

const fs = require('fs');
const { buildDataset } = require('./dataset');
const { train, predict, CLASSES } = require('./model');
const { report } = require('./report');

const labelFile = process.argv[2] || 'labels.txt';
const cropsDir = process.argv[3] || 'crops';
const outFile = process.argv[4] || 'weights.json';

console.log(`Inlezen ${labelFile} + ${cropsDir} ...`);
const { X, y, meta, photos, styles } = buildDataset(labelFile, cropsDir);
console.log(`${photos.length} diagrammen, ${styles.length} stijlen (${styles.join(', ')}), ${X.length} velden.`);
const counts = new Array(3).fill(0);
y.forEach((c) => counts[c]++);
console.log(`Verdeling: ${CLASSES.map((c, i) => `${c}=${counts[i]}`).join('  ')}\n`);

// --- cross-validatie -----------------------------------------------------------
// Twee cijfers, en het verschil ertussen is het interessantst:
//   per diagram : hoe goed op een boek dat het model kent
//   per stijl   : hoe goed op een boek dat het model nooit heeft gezien
function crossValidate(groupOf) {
  const groups = [...new Set(meta.map(groupOf))];
  const predicted = new Array(X.length);
  const confidence = new Array(X.length);
  for (const g of groups) {
    const trIdx = [];
    const teIdx = [];
    meta.forEach((m, i) => (groupOf(m) === g ? teIdx : trIdx).push(i));
    if (!trIdx.length) throw new Error(`Groep "${g}" bevat alle data; voeg meer toe.`);
    const model = train(trIdx.map((i) => X[i]), trIdx.map((i) => y[i]));
    for (const i of teIdx) {
      const r = predict(model, X[i]);
      predicted[i] = CLASSES.indexOf(r.label);
      confidence[i] = r.confidence;
    }
  }
  return { predicted, confidence };
}

if (styles.length < 2) {
  console.log('LET OP: minder dan twee stijlen gelabeld (@tag in labels.txt).');
  console.log('Het cijfer hieronder zegt niets over een boek dat je nog niet hebt gezien.\n');
} else {
  const perStyle = crossValidate((m) => m.style);
  console.log('########## Onbekende stijl (dit is het cijfer dat telt) ##########\n');
  report({ y, ...perStyle, meta, photos });
  console.log('\n');
}

console.log('########## Bekende stijl, onbekend diagram ##########\n');
const perPhoto = crossValidate((m) => m.photo);
report({ y, ...perPhoto, meta, photos });

// --- eindmodel op alle data ----------------------------------------------------
const finalModel = train(X, y);
fs.writeFileSync(outFile, JSON.stringify(finalModel, null, 2));
console.log(`\nGewichten weggeschreven naar ${outFile}`);
