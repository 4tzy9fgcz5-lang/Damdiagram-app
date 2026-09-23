import * as docxLib from "../../lib/docx.mjs?v=20260923o";
import { createStartBoard } from "../core/board.js?v=20260923o";
import { parseFen } from "../core/fen.js?v=20260923o";
import { plyColor, plyMoveNumber } from "../core/draughtsMoves.js?v=20260923o";
import { hoofdlijnKnopen, notatieKortMetVoorloopnul } from "../core/zettenboom.js?v=20260923o";
import { naamPrint } from "../core/namen.js?v=20260923o";

const { Document, Packer, Paragraph, TextRun, convertMillimetersToTwip } = docxLib;

function mmToTwip(mm) {
  return convertMillimetersToTwip(mm);
}

const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = 20;
const FONT = "Courier New";

// Een boom is "kaal" (geen aantekeningen) als er nergens een variant of commentaar in zit — dan
// past de partij in het rooster van 5 zetten per regel (zie `notatieRooster`). Zodra er ergens
// wél iets staat, gebruiken we de doorlopende vorm met varianten tussen haakjes en commentaar op
// een eigen regel (`notatieParagrafen`) — Jans keuze (CLAUDE.md-feedback 2026-09-23): "Gebruik
// het rooster alleen bij kale partijen zonder aantekeningen. Voor uitgebreidere analyses kan je
// die 5 zetten per regel loslaten."
function isKaleBoom(wortel) {
  function bezoek(knoop) {
    if (knoop.kinderen.length > 1) return false;
    return knoop.kinderen.every((kind) => !kind.commentaar && bezoek(kind));
  }
  return bezoek(wortel);
}

// "Wederzijds 5 zetten per regel: regel 1 begint met zet 1, regel 2 met zet 6, ..." — elke regel
// bevat 5 zetnummer-paren ("N. wit zwart"). De uitslag komt na de allerlaatste zet op dezelfde
// regel ("71. 22-06 38-42 72. 04-18 2-0"), zoals Jan vroeg.
function notatieRooster(hoofdlijn, beurt0, uitslag) {
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
  if (paren.length === 0) return uitslag ? [uitslag] : ["(nog geen zetten)"];

  const regels = [];
  for (let j = 0; j < paren.length; j += 5) {
    const groep = paren.slice(j, j + 5);
    let regel = groep.map((p) => `${p.nummer}. ${p.wit}${p.zwart ? " " + p.zwart : ""}`).join("     ");
    if (uitslag && j + 5 >= paren.length) regel += `     ${uitslag}`;
    regels.push(regel);
  }
  return regels;
}

// De doorlopende vorm voor een geannoteerde partij: hoofdlijn met genest `(varianten)` — net als
// `formatteerBoomTekst` — maar dan als losse Word-alinea's i.p.v. platte tekst, zodat commentaar
// op een eigen regel kan staan i.p.v. tussen accolades midden in de zetten (Jans wens, net als bij
// de boom-viewer op het scherm: zie `zettenboomPlayer.js`/CLAUDE.md, "Boom-viewer: drie dingen
// gecorrigeerd"). De uitslag komt na de allerlaatste zet, in dezelfde alinea.
function notatieParagrafen(wortel, beurt0, uitslag) {
  const paragrafen = [];
  let buffer = [];

  function flush() {
    if (buffer.length) paragrafen.push(new Paragraph({ children: buffer, spacing: { after: 60 } }));
    buffer = [];
  }
  function schrijf(text) {
    buffer.push(new TextRun({ text, font: FONT, size: 22 }));
  }

  function schrijfZet(knoop, ply, forceerZetnummer) {
    const kleur = plyColor(beurt0, ply);
    if (kleur === "white") schrijf(`${plyMoveNumber(beurt0, ply)}. `);
    else if (forceerZetnummer) schrijf(`${plyMoveNumber(beurt0, ply)}. ... `);
    schrijf(notatieKortMetVoorloopnul(knoop.zet) + (knoop.teken ?? "") + " ");
    if (knoop.commentaar) {
      flush();
      paragrafen.push(
        new Paragraph({ children: [new TextRun({ text: knoop.commentaar, italics: true, font: FONT, size: 20 })], spacing: { after: 100 } })
      );
    }
  }

  function schrijfReeks(ouderKnoop, ply) {
    if (ouderKnoop.kinderen.length === 0) return;
    const [hoofdKind, ...varianten] = ouderKnoop.kinderen;
    schrijfZet(hoofdKind, ply, false);
    for (const variant of varianten) {
      schrijf("(");
      schrijfZet(variant, ply, true);
      schrijfReeks(variant, ply + 1);
      schrijf(") ");
    }
    schrijfReeks(hoofdKind, ply + 1);
  }

  schrijfReeks(wortel, 0);
  if (uitslag) schrijf(uitslag);
  flush();
  return paragrafen.length ? paragrafen : [new Paragraph({ children: [new TextRun({ text: "(nog geen zetten)", font: FONT, size: 22 })] })];
}

// Fase 2, stap 4 (uitbreiding); bijgewerkt 2026-09-23 (CLAUDE.md-feedback) met printopmaak: een
// partij printen. Bewust een eigen, EENVOUDIG document i.p.v. dit in docx.js (de stencil-export)
// te passen — dat bestand is helemaal op het herhalende opgaven/oplossingen-blad van een
// opgaveblad gebouwd, een partij is gewoon één doorlopend document. Bewust ALLEEN de notatie
// (bevestigd door Jan): geen diagrammen halverwege de tekst zoals damkunst.nl — dat is losstaand
// van de filmmodule (stap 5), die zijn eigen diagrammen al heeft.
export async function buildPartijDocxBlob(partij) {
  const titel =
    [naamPrint(partij.witVoornaam, partij.witAchternaam), naamPrint(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  // "Toernooi, ronde en datum mogen allemaal op dezelfde regel" (Jan).
  const metaRegel = [partij.toernooi, partij.ronde ? `ronde ${partij.ronde}` : "", partij.datum].filter(Boolean).join(", ");

  const { turn } = partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
  const hoofdlijn = hoofdlijnKnopen(partij.wortel);

  const children = [
    new Paragraph({ children: [new TextRun({ text: titel, bold: true, font: FONT, size: 32 })], spacing: { after: 160 } }),
  ];
  if (metaRegel) {
    children.push(new Paragraph({ children: [new TextRun({ text: metaRegel, font: FONT, size: 22, color: "555555" })], spacing: { after: 60 } }));
  }
  if (partij.bron) {
    children.push(new Paragraph({ children: [new TextRun({ text: partij.bron, font: FONT, size: 22, color: "555555" })], spacing: { after: 60 } }));
  }
  if (partij.notities) {
    children.push(new Paragraph({ children: [new TextRun({ text: partij.notities, italics: true, font: FONT, size: 22 })], spacing: { before: 120, after: 200 } }));
  }

  const notatieChildren = isKaleBoom(partij.wortel)
    ? notatieRooster(hoofdlijn, turn, partij.uitslag).map(
        (regel) => new Paragraph({ children: [new TextRun({ text: regel, font: FONT, size: 22 })], spacing: { after: 40 } })
      )
    : notatieParagrafen(partij.wortel, turn, partij.uitslag);
  children.push(...notatieChildren);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwip(PAGE_MM.width), height: mmToTwip(PAGE_MM.height) },
            margin: { top: mmToTwip(MARGIN_MM), bottom: mmToTwip(MARGIN_MM), left: mmToTwip(MARGIN_MM), right: mmToTwip(MARGIN_MM) },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
