'use strict';

const { CLASSES } = require('./model');

function pad(s, n) {
  return String(s).padEnd(n);
}
function padL(s, n) {
  return String(s).padStart(n);
}

/**
 * Print het enige getal dat telt, plus genoeg detail om te weten waar je moet kijken.
 */
function report({ y, predicted, confidence, meta, photos }) {
  const K = CLASSES.length;
  const cm = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < y.length; i++) cm[y[i]][predicted[i]]++;

  let correct = 0;
  for (let k = 0; k < K; k++) correct += cm[k][k];
  const acc = correct / y.length;

  console.log('=== Confusiematrix (rij = waar, kolom = voorspeld) ===');
  console.log(pad('', 8) + CLASSES.map((c) => padL(c, 8)).join(''));
  for (let k = 0; k < K; k++) {
    console.log(pad(CLASSES[k], 8) + cm[k].map((v) => padL(v, 8)).join(''));
  }

  console.log('\n=== Per klasse ===');
  for (let k = 0; k < K; k++) {
    const tp = cm[k][k];
    const fn = cm[k].reduce((a, b) => a + b, 0) - tp;
    let fp = 0;
    for (let j = 0; j < K; j++) if (j !== k) fp += cm[j][k];
    const prec = tp + fp ? tp / (tp + fp) : 0;
    const rec = tp + fn ? tp / (tp + fn) : 0;
    console.log(
      `${pad(CLASSES[k], 8)} precisie ${(prec * 100).toFixed(1)}%  recall ${(rec * 100).toFixed(1)}%`
    );
  }

  console.log(`\nTotaal: ${(acc * 100).toFixed(2)}%  (${y.length - correct} fout op ${y.length} velden)`);

  // --- per foto: hoeveel borden zijn 100% goed? --------------------------------
  const perPhoto = new Map(photos.map((p) => [p, 0]));
  for (let i = 0; i < y.length; i++) {
    if (y[i] !== predicted[i]) perPhoto.set(meta[i].photo, perPhoto.get(meta[i].photo) + 1);
  }
  const perfect = [...perPhoto.values()].filter((v) => v === 0).length;
  console.log(`Foutloze borden: ${perfect}/${photos.length}`);
  const worst = [...perPhoto.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (worst.length) {
    console.log('Slechtste diagrammen: ' + worst.slice(0, 5).map(([p, v]) => `${p}(${v})`).join('  '));
  }

  // --- per stijl: waar zit de zwakte? -----------------------------------------
  const styles = [...new Set(meta.map((m) => m.style).filter(Boolean))];
  if (styles.length > 1) {
    console.log('\n=== Per stijl ===');
    for (const st of styles) {
      let n = 0;
      let ok = 0;
      for (let i = 0; i < y.length; i++) {
        if (meta[i].style !== st) continue;
        n++;
        if (y[i] === predicted[i]) ok++;
      }
      console.log(`${pad(st, 16)} ${((ok / n) * 100).toFixed(1)}%  (${n - ok} fout op ${n})`);
    }
  }

  // --- foutenlijst -------------------------------------------------------------
  const errors = [];
  for (let i = 0; i < y.length; i++) {
    if (y[i] !== predicted[i]) errors.push(i);
  }
  if (errors.length) {
    errors.sort((a, b) => confidence[b] - confidence[a]); // zelfverzekerd én fout = ergst
    console.log('\n=== Fouten (zelfverzekerd bovenaan) ===');
    for (const i of errors.slice(0, 40)) {
      const n = meta[i].named || {};
      const f = (v) => (v === undefined ? '?' : v.toFixed(2));
      console.log(
        `${pad(meta[i].photo, 14)} veld ${padL(meta[i].square, 2)}  ` +
        `waar=${pad(CLASSES[y[i]], 6)} voorspeld=${pad(CLASSES[predicted[i]], 6)} ` +
        `p=${confidence[i].toFixed(2)}  ` +
        `rel=${f(n.relBright)} z=${f(n.contrastZ)} tex=${f(n.textureRatio)} div=${f(n.diversity)} ring=${f(n.ringCoverage)}`
      );
    }
    if (errors.length > 40) console.log(`... en nog ${errors.length - 40}`);
  }

  // --- drempeladvies voor de gele rand ----------------------------------------
  console.log('\n=== Drempel voor handmatige controle ===');
  console.log('drempel  gemarkeerd  fouten die je zo vangt');
  for (const t of [0.6, 0.7, 0.8, 0.9, 0.95, 0.99]) {
    let flagged = 0;
    let caught = 0;
    for (let i = 0; i < y.length; i++) {
      if (confidence[i] < t) {
        flagged++;
        if (y[i] !== predicted[i]) caught++;
      }
    }
    const pct = errors.length ? ((caught / errors.length) * 100).toFixed(0) : '100';
    console.log(
      `${padL(t.toFixed(2), 7)}  ${padL(flagged, 10)}  ${padL(`${caught}/${errors.length}`, 8)} (${pct}%)`
    );
  }
  return { accuracy: acc, errors: errors.length };
}

module.exports = { report };
