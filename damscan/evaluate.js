'use strict';

/**
 * Scoort een bestaand weights.json op een gelabelde set. Gebruik dit om een
 * wijziging te toetsen op foto's die niet in de trainingsset zaten.
 *
 *   node evaluate.js [labels.txt] [crops] [weights.json]
 */

const fs = require('fs');
const { buildDataset } = require('./dataset');
const { predict, CLASSES } = require('./model');
const { report } = require('./report');

const labelFile = process.argv[2] || 'labels.txt';
const cropsDir = process.argv[3] || 'crops';
const weightsFile = process.argv[4] || 'weights.json';

const weights = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));
const { X, y, meta, photos } = buildDataset(labelFile, cropsDir);

const predicted = [];
const confidence = [];
for (const x of X) {
  const r = predict(weights, x);
  predicted.push(CLASSES.indexOf(r.label));
  confidence.push(r.confidence);
}

report({ y, predicted, confidence, meta, photos });
