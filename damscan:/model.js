'use strict';

/**
 * Multinomiale logistische regressie (softmax) voor 3 klassen.
 * Eén beslissing per veld: leeg / wit / zwart. Geen cascade, dus een fout in de
 * bezettingsstap kan de kleurstap niet meer besmetten.
 *
 * Pure JS, geen dependencies. Het model is minuscuul (3 x 8 getallen).
 */

const CLASSES = ['empty', 'white', 'black'];

function standardize(vector, mu, sigma) {
  return vector.map((v, i) => (v - mu[i]) / (sigma[i] || 1));
}

function softmax(scores) {
  const m = Math.max(...scores);
  const ex = scores.map((s) => Math.exp(s - m));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / sum);
}

/** @returns {{probs:number[], label:string, confidence:number}} */
function predict(model, vector) {
  const z = standardize(vector, model.mu, model.sigma);
  const scores = model.W.map((w) => {
    let s = w[w.length - 1]; // bias
    for (let i = 0; i < z.length; i++) s += w[i] * z[i];
    return s;
  });
  const probs = softmax(scores);
  let best = 0;
  for (let k = 1; k < probs.length; k++) if (probs[k] > probs[best]) best = k;
  return { probs, label: CLASSES[best], confidence: probs[best] };
}

/**
 * @param {number[][]} X  features
 * @param {number[]} y    klasse-indices
 */
function train(X, y, opts = {}) {
  const { epochs = 600, lr = 0.5, l2 = 1e-3 } = opts;
  const n = X.length;
  const d = X[0].length;
  const K = CLASSES.length;

  // standaardiseren
  const mu = new Array(d).fill(0);
  const sigma = new Array(d).fill(0);
  for (let i = 0; i < d; i++) {
    let s = 0;
    for (const x of X) s += x[i];
    mu[i] = s / n;
    let v = 0;
    for (const x of X) v += (x[i] - mu[i]) ** 2;
    sigma[i] = Math.sqrt(v / Math.max(1, n - 1)) || 1;
  }
  const Z = X.map((x) => standardize(x, mu, sigma));

  // klassegewichten, zodat een zeldzame klasse (weinig lege velden in een
  // openingsstand) niet wordt weggedrukt
  const counts = new Array(K).fill(0);
  for (const c of y) counts[c]++;
  const wClass = counts.map((c) => (c ? n / (K * c) : 0));

  const W = Array.from({ length: K }, () => new Array(d + 1).fill(0));

  for (let ep = 0; ep < epochs; ep++) {
    const grad = Array.from({ length: K }, () => new Array(d + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const z = Z[i];
      const scores = W.map((w) => {
        let s = w[d];
        for (let j = 0; j < d; j++) s += w[j] * z[j];
        return s;
      });
      const p = softmax(scores);
      const cw = wClass[y[i]];
      for (let k = 0; k < K; k++) {
        const err = (p[k] - (y[i] === k ? 1 : 0)) * cw;
        for (let j = 0; j < d; j++) grad[k][j] += err * z[j];
        grad[k][d] += err;
      }
    }
    for (let k = 0; k < K; k++) {
      for (let j = 0; j <= d; j++) {
        const reg = j < d ? l2 * W[k][j] : 0;
        W[k][j] -= (lr * (grad[k][j] / n + reg));
      }
    }
  }
  return { W, mu, sigma, classes: CLASSES.slice() };
}

module.exports = { train, predict, CLASSES };
