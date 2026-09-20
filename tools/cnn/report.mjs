// Rapport over alle meetrondes (cv_0.json ... cv_5.json) in een uitvoermap.
// Gebruik: node tools/cnn/report.mjs uitvoermap
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const preds = fs.readdirSync(dir).filter((f) => /^cv_\d+\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const names = ["leeg", "wit", "zwart"];
const argmax = (p) => p.indexOf(Math.max(...p));
const wrong = (p) => argmax(p.probs) !== p.y;

const total = preds.length;
const errors = preds.filter(wrong);
console.log(`Totaal: ${(100 * (1 - errors.length / total)).toFixed(2)}% goed  (${errors.length} fout op ${total} velden)`);

const perBoard = new Map();
for (const p of preds) {
  const b = perBoard.get(p.photo) ?? { errors: 0, style: p.style };
  if (wrong(p)) b.errors++;
  perBoard.set(p.photo, b);
}
const boards = [...perBoard.values()];
console.log(`Foutloze borden: ${boards.filter((b) => b.errors === 0).length}/${boards.length}; hooguit 1 fout: ${boards.filter((b) => b.errors <= 1).length}/${boards.length}; gemiddeld ${(errors.length / boards.length).toFixed(2)} fout per bord`);

const conf = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of preds) conf[p.y][argmax(p.probs)]++;
console.log("\nVerwarring (rij = waar, kolom = voorspeld):");
console.log("          " + names.map((n) => n.padStart(6)).join(" "));
conf.forEach((row, i) => console.log(names[i].padEnd(10) + row.map((v) => String(v).padStart(6)).join(" ")));

console.log("\nPer boekstijl:");
const styles = new Map();
for (const p of preds) {
  const s = styles.get(p.style) ?? { n: 0, e: 0 };
  s.n++; if (wrong(p)) s.e++;
  styles.set(p.style, s);
}
for (const [name, s] of [...styles].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${name.padEnd(20)} ${(100 * (1 - s.e / s.n)).toFixed(1).padStart(5)}%  (${s.e} fout op ${s.n})`);
}

console.log("\nGele rand: bij welke zekerheid markeren we een veld als onzeker?");
console.log("  drempel   gemarkeerd   deel v.d. fouten gevonden");
for (const t of [0.6, 0.7, 0.8, 0.9, 0.95, 0.98]) {
  const flagged = preds.filter((p) => Math.max(...p.probs) < t);
  const caught = flagged.filter(wrong).length;
  console.log(`  ${String(t).padEnd(9)} ${(100 * flagged.length / total).toFixed(1).padStart(5)}%      ${(100 * caught / Math.max(1, errors.length)).toFixed(0).padStart(4)}%`);
}
