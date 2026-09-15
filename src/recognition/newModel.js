// Poort van damscan/model.js naar de browser (ES module i.p.v. CommonJS) — alleen
// het voorspel-gedeelte (`predict`), want trainen gebeurt via `node damscan/train.js`
// en de gewichten komen uit damscan/weights.json. Logica ONGEWIJZIGD overgenomen.

export const CLASSES = ['empty', 'white', 'black'];

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
export function predict(model, vector) {
  const v = model.columns ? model.columns.map((c) => vector[c]) : vector;
  const z = standardize(v, model.mu, model.sigma);
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
