'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { parseLabelFile } = require('./labels');
const { extractFeatures, toGray, boardRelative } = require('./features');

/**
 * Verwachte indeling op schijf:
 *
 *   labels.txt
 *   crops/
 *     foto01/01.png ... 50.png     (het veldnummer is de bestandsnaam)
 *     foto02/...
 *
 * De crops komen uit je bestaande rasterstap; zie README voor het dumpen.
 */

function loadCrop(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const gray = toGray(png.data, png.width, png.height, 4);
  return { gray, width: png.width, height: png.height };
}

function cropPath(cropsDir, photo, square) {
  const dir = path.join(cropsDir, photo);
  for (const name of [
    `${String(square).padStart(2, '0')}.png`,
    `${square}.png`,
  ]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Crop ontbreekt: ${dir} veld ${square}`);
}

/**
 * @returns {{X, y, meta, photos, styles}} meta bevat per veld foto, stijl en nummer
 */
function buildDataset(labelFile, cropsDir) {
  const photos = parseLabelFile(fs.readFileSync(labelFile, 'utf8'));
  const X = [];
  const y = [];
  const meta = [];
  const CLASSES = ['empty', 'white', 'black'];

  for (const { photo, style, labels } of photos) {
    // Eerst alle 50 velden van dit diagram, dan pas normaliseren: de schaal komt
    // uit het diagram zelf, zodat de drukstijl er niet meer toe doet.
    const raw = [];
    const named = [];
    for (let sq = 1; sq <= 50; sq++) {
      const { gray, width, height } = loadCrop(cropPath(cropsDir, photo, sq));
      const f = extractFeatures(gray, width, height);
      raw.push(f.vector);
      named.push(f.named);
    }
    const full = boardRelative(raw);
    for (let sq = 1; sq <= 50; sq++) {
      X.push(full[sq - 1]);
      y.push(CLASSES.indexOf(labels[sq - 1]));
      meta.push({ photo, style, square: sq, named: named[sq - 1] });
    }
  }

  return {
    X, y, meta,
    photos: photos.map((p) => p.photo),
    styles: [...new Set(photos.map((p) => p.style))],
  };
}

module.exports = { buildDataset, loadCrop, cropPath };
