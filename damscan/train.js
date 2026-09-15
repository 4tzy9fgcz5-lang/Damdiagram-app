'use strict';

/**
 * Traint de classifier en meet eerlijk.
 *
 *   node train.js [labels.txt] [crops] [weights.json]
 *
 * Er worden drie varianten tegen elkaar gezet:
 *
 *   ruw        alleen de absolute meting per veld
 *   relatief   alleen de positie binnen het eigen diagram
 *   beide      alle veertien kenmerken
 *
 * De winnaar wordt gekozen op het cijfer voor een ONBEKENDE stijl, want dat is
 * wat er gebeurt als je morgen een diagram uit een nieuw boek scant. Zelf kiezen
 * op gevoel is precies hoe je in een fout blijft hangen.
 */

const fs = require('fs');
const { buildDataset } = require('./dataset');
const { train, predict, CLASSES } = require('./model');
const { report } = require('./report');
const { FEATURE_NAMES } = require('./features');

const labelFile = process.argv[2] || 'labels.txt';
const cropsDir = process.argv[3] || 'crops';
const outFile = process.argv[4] || 'weights.json';

console.log(`Inlezen ${labelFile} + ${cropsDir} ...`);
const { X, y, meta, photos, styles } = buildDataset(labelFile, cropsDir);
console.log(`${photos.length} diagrammen, ${styles.length} stijlen (${styles.join(', ')}), ${X.length} velden.`);
const counts = new Array(3).fill(0);
y.forEach((c) => counts[c]++);
console.log(`Verdeling: ${CLASSES.map((c, i) => `${c}=${counts[i]}`).join('  ')}\n`);

const D = FEATURE_NAMES.length;
const VARIANTS = [
  { name: 'ruw', columns: range(0, D) },
  { name: 'relatief', columns: range(D, 2 * D) },
  { name: 'beide', columns: range(0, 2 * D) },
];

function range(a, b) {
  const out = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

function crossValidate(groupOf, columns) {
  const groups = [...new Set(meta.map(groupOf))];
  const predicted = new Array(X.length);
  const confidence = new Array(X.length);
  for (const g of groups) {
    const trIdx = [];
    const teIdx = [];
    meta.forEach((m, i) => (groupOf(m) === g ? teIdx : trIdx).push(i));
    if (!trIdx.length) throw new Error(`Groep "${g}" bevat alle data; voeg meer toe.`);
    const model = train(trIdx.map((i) => X[i].filter((_, j) => columns.includes(j))),
      trIdx.map((i) => y[i]));
    model.columns = columns;
    for (const i of teIdx) {
      const r = predict(model, X[i]);
      predicted[i] = CLASSES.indexOf(r.label);
      confidence[i] = r.confidence;
    }
  }
  let ok = 0;
  for (let i = 0; i < y.length; i++) if (y[i] === predicted[i]) ok++;
  return { predicted, confidence, accuracy: ok / y.length };
}

// --- varianten vergelijken -----------------------------------------------------
const multiStyle = styles.length >= 2;
if (!multiStyle) {
  console.log('LET OP: minder dan twee stijlen gelabeld (@tag in labels.txt).');
  console.log('Er kan niet gemeten worden op een onbekende stijl.\n');
}

console.log('=== Varianten (nauwkeurigheid op een onbekende stijl) ===');
const results = [];
for (const v of VARIANTS) {
  const cv = multiStyle
    ? crossValidate((m) => m.style, v.columns)
    : crossValidate((m) => m.photo, v.columns);
  results.push({ ...v, cv });
  console.log(`${v.name.padEnd(10)} ${(cv.accuracy * 100).toFixed(2)}%`);
}
const best = results.reduce((a, b) => (b.cv.accuracy > a.cv.accuracy ? b : a));
console.log(`\nGekozen: ${best.name}\n`);

// --- volledig rapport voor de winnaar ------------------------------------------
if (multiStyle) {
  console.log(`########## Onbekende stijl — variant "${best.name}" ##########\n`);
  report({ y, predicted: best.cv.predicted, confidence: best.cv.confidence, meta, photos });
  console.log('\n');
}

console.log(`########## Bekende stijl, onbekend diagram — variant "${best.name}" ##########\n`);
const perPhoto = crossValidate((m) => m.photo, best.columns);
report({ y, predicted: perPhoto.predicted, confidence: perPhoto.confidence, meta, photos });

// --- eindmodel op alle data ----------------------------------------------------
const finalModel = train(X.map((x) => best.columns.map((c) => x[c])), y);
finalModel.columns = best.columns;
finalModel.variant = best.name;
fs.writeFileSync(outFile, JSON.stringify(finalModel, null, 2));
console.log(`\nGewichten weggeschreven naar ${outFile} (variant: ${best.name})`);
