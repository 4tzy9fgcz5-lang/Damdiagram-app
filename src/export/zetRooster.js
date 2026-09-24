import * as docxLib from "../../lib/docx.mjs?v=20260925a";
import { plyColor, plyMoveNumber } from "../core/draughtsMoves.js?v=20260925a";
import { notatieKortMetVoorloopnul } from "../core/zettenboom.js?v=20260925a";

const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, TableLayoutType, convertMillimetersToTwip } = docxLib;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLE_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const COLS = 5;

// "5 zetnummers per regel (1-5, 6-10, 11-15, ...)" (Jan) — gedeeld door partijDocx.js en
// filmDocx.js. Gebouwd naar aanleiding van Jans melding (2026-09-24, na het uitproberen van een
// echte partij en filmopdracht): "diagrammen passen niet op de pagina, er zit veel loze ruimte
// tussen de zetten en regels". Oorzaak: de vorige versie plakte de 5 zetparen aan elkaar met
// losse spaties in ÉÉN doorlopende tekstregel — in een monospace lettertype (Courier New, op
// Jans verzoek) is dat een stuk breder dan in een gewoon lettertype, dus de regel paste vaak niet
// meer op de pagina (Word wikkelt 'm dan af, midden in een zetpaar) en de losse spaties zelf
// vielen groter uit dan bedoeld. Nu een ECHTE tabel (5 kolommen, vaste breedte,
// `layout: FIXED` — zonder dat laatste negeert Word de opgegeven kolombreedtes en bepaalt hij ze
// zelf op basis van de inhoud, wat precies de bron van dit soort pas-niet-problemen is): elke
// kolom is dan gegarandeerd even breed, en zelfs een net-te-lang zetpaar (bv. bij een drietallig
// zetnummer) wikkelt hooguit binnen zijn eigen cel af, zonder de rest van het rooster te
// verstoren.
export function bouwZettenRooster(paren, { usableWidthMm, font, size, uitslag }) {
  if (paren.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: uitslag || "(nog geen zetten)", font, size })] })];
  }
  const colWMm = usableWidthMm / COLS;
  const colWidthTwip = convertMillimetersToTwip(colWMm);
  const rows = [];
  for (let j = 0; j < paren.length; j += COLS) {
    const groep = paren.slice(j, j + COLS);
    const laatsteRegel = j + COLS >= paren.length;
    const cells = groep.map((p, idx) => {
      let tekst = `${p.nummer}. ${p.wit}${p.zwart ? " " + p.zwart : ""}`;
      if (uitslag && laatsteRegel && idx === groep.length - 1) tekst += ` ${uitslag}`;
      return new TableCell({
        width: { size: colWidthTwip, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: [new Paragraph({ children: [new TextRun({ text: tekst, font, size })], spacing: { after: 40, before: 0 } })],
      });
    });
    while (cells.length < COLS) {
      cells.push(new TableCell({ width: { size: colWidthTwip, type: WidthType.DXA }, children: [new Paragraph({ children: [] })] }));
    }
    rows.push(new TableRow({ children: cells }));
  }
  return [
    new Table({
      width: { size: convertMillimetersToTwip(usableWidthMm), type: WidthType.DXA },
      columnWidths: new Array(COLS).fill(colWidthTwip),
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
      rows,
    }),
  ];
}

// Zet een hoofdlijn om in de zetparen die `bouwZettenRooster` verwacht ({ nummer, wit, zwart }).
export function zetParen(hoofdlijn, beurt0) {
  const paren = [];
  let i = 0;
  if (plyColor(beurt0, 0) === "black") {
    paren.push({ nummer: plyMoveNumber(beurt0, 0), wit: "", zwart: notatieKortMetVoorloopnul(hoofdlijn[0].zet) });
    i = 1;
  }
  for (; i < hoofdlijn.length; i += 2) {
    paren.push({
      nummer: plyMoveNumber(beurt0, i),
      wit: notatieKortMetVoorloopnul(hoofdlijn[i].zet),
      zwart: hoofdlijn[i + 1] ? notatieKortMetVoorloopnul(hoofdlijn[i + 1].zet) : "",
    });
  }
  return paren;
}
