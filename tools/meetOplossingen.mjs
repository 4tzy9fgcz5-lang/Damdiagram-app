// Meetprogramma voor het inlezen van oplossingen uit een foto (buiten de app, in Node).
// Neemt de herkende stellingen (boards.json: [{ nummer, fen }], te maken met
// tools/bulkCheck/boardsDriver.js) en een tekst met de afgelezen oplossingen (een "lezing":
// Tesseract-uitvoer, of een handmatige/Claude-lezing) en laat elke oplossing door de echte
// app-code (src/core/solutionParser.js) omzetten en nagespeelde zetten tellen. Een zet die niet
// mag = leesfout (of een fout in het boek).
//
// Gebruik (vanuit de project-root):
//   node tools/meetOplossingen.mjs boards.json lezing.txt [lezing2.txt ...] [--zonder-herstel]
import fs from "node:fs";
import { parseFen } from "../src/core/fen.js";
import { parseOplossing, splitOplossingenTekst } from "../src/core/solutionParser.js";

const args = process.argv.slice(2);
const herstel = !args.includes("--zonder-herstel");
const [boardsFile, ...readings] = args.filter((a) => !a.startsWith("--"));
const boards = JSON.parse(fs.readFileSync(boardsFile, "utf8"));
const numbers = boards.map((b) => b.nummer);

for (const file of readings) {
  const chunks = splitOplossingenTekst(fs.readFileSync(file, "utf8"), { verwacht: numbers }).perNummer;
  console.log(`\n===== ${file} (herstel ${herstel ? "aan" : "uit"}) =====`);
  const stat = { volledig: 0, deels: 0, ontbreekt: 0, zetten: 0, hersteld: 0, aangevuld: 0 };
  for (const b of boards) {
    const chunk = chunks[b.nummer];
    if (chunk === undefined) {
      console.log(`${b.nummer}  ontbreekt in de tekst`);
      stat.ontbreekt++;
      continue;
    }
    const { board } = parseFen(b.fen);
    let r = parseOplossing(chunk, { board, turn: "white", herstel });
    if (r.fout?.andereBeurt) {
      r = parseOplossing(chunk, { board, turn: "black", herstel });
      console.log(`     (de app zou hier de knop "Zet zwart aan zet" tonen)`);
    }
    stat.zetten += r.zetten.length;
    stat.hersteld += r.hersteld.length;
    stat.aangevuld += r.aangevuld.length;
    if (r.volledig) stat.volledig++;
    else stat.deels++;
    console.log(`${b.nummer} ${r.volledig ? "VOLLEDIG" : "deels   "} zetten ${String(r.zetten.length).padStart(2)}, varianten ${r.zijvarianten.length}`);
    for (const m of r.meldingen) console.log(`     [${m.niveau}] ${m.tekst}`);
  }
  console.log(`samenvatting: volledig ${stat.volledig}, deels ${stat.deels}, ontbreekt ${stat.ontbreekt}; ${stat.zetten} zetten; hersteld ${stat.hersteld}, aangevuld ${stat.aangevuld}`);
}
