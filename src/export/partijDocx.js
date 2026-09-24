import * as docxLib from "../../lib/docx.mjs?v=20260925a";
import { createStartBoard } from "../core/board.js?v=20260925a";
import { parseFen } from "../core/fen.js?v=20260925a";
import { plyColor, plyMoveNumber } from "../core/draughtsMoves.js?v=20260925a";
import { hoofdlijnKnopen, notatieKortMetVoorloopnul } from "../core/zettenboom.js?v=20260925a";
import { naamPrint } from "../core/namen.js?v=20260925a";
import { bouwZettenRooster, zetParen } from "./zetRooster.js?v=20260925a";

const { Document, Packer, Paragraph, TextRun, convertMillimetersToTwip } = docxLib;

function mmToTwip(mm) {
  return convertMillimetersToTwip(mm);
}

const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = 16;
const FONT = "Courier New";
// Het rooster (zie zetRooster.js) staat kleiner dan de rest van de tekst — nodig om 5 zetparen
// per regel in Courier New (breder dan een gewoon lettertype) op de pagina te laten passen
// (Jans melding 2026-09-24: "veel loze ruimte tussen de zetten en regels").
const ROOSTER_SIZE = 19; // 9,5pt

// Een boom is "kaal" (geen aantekeningen) als er nergens een variant of commentaar in zit — dan
// past de partij in het rooster van 5 zetten per regel (zie `zetRooster.js`). Zodra er ergens
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

// Bouwt de Word-inhoud (titel t/m notatie) voor ÉÉN partij, zonder de omringende Document/
// sectie — losgetrokken van `buildPartijDocxBlob` zodat `buildMeerderePartijenDocxBlob`
// hieronder (meerdere partijen tegelijk afdrukken, Jans wens 2026-09-24) exact hetzelfde blok
// per partij kan hergebruiken en er alleen pagina-einden tussen hoeft te zetten.
function partijChildren(partij) {
  const titel =
    [naamPrint(partij.witVoornaam, partij.witAchternaam), naamPrint(partij.zwartVoornaam, partij.zwartAchternaam)]
      .filter(Boolean)
      .join(" - ") || "Partij";
  // "Toernooi, ronde en datum mogen allemaal op dezelfde regel" (Jan).
  const metaRegel = [partij.toernooi, partij.ronde ? `ronde ${partij.ronde}` : "", partij.datum].filter(Boolean).join(", ");

  const { turn } = partij.beginFen ? parseFen(partij.beginFen) : { board: createStartBoard(), turn: "white" };
  const hoofdlijn = hoofdlijnKnopen(partij.wortel);
  const usableWidthMm = PAGE_MM.width - 2 * MARGIN_MM;

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
    ? bouwZettenRooster(zetParen(hoofdlijn, turn), { usableWidthMm, font: FONT, size: ROOSTER_SIZE, uitslag: partij.uitslag })
    : notatieParagrafen(partij.wortel, turn, partij.uitslag);
  children.push(...notatieChildren);
  return children;
}

function pageSetup() {
  return {
    size: { width: mmToTwip(PAGE_MM.width), height: mmToTwip(PAGE_MM.height) },
    margin: { top: mmToTwip(MARGIN_MM), bottom: mmToTwip(MARGIN_MM), left: mmToTwip(MARGIN_MM), right: mmToTwip(MARGIN_MM) },
  };
}

// Fase 2, stap 4 (uitbreiding); bijgewerkt 2026-09-23/24 (CLAUDE.md-feedback) met printopmaak: een
// partij printen. Bewust een eigen, EENVOUDIG document i.p.v. dit in docx.js (de stencil-export)
// te passen — dat bestand is helemaal op het herhalende opgaven/oplossingen-blad van een
// opgaveblad gebouwd, een partij is gewoon één doorlopend document. Bewust ALLEEN de notatie
// (bevestigd door Jan): geen diagrammen halverwege de tekst zoals damkunst.nl — dat is losstaand
// van de filmmodule (stap 5), die zijn eigen diagrammen al heeft.
export async function buildPartijDocxBlob(partij) {
  const doc = new Document({
    sections: [{ properties: { page: pageSetup() }, children: partijChildren(partij) }],
  });
  return Packer.toBlob(doc);
}

// Meerdere partijen in één Word-bestand, elk op een eigen pagina — Jans wens (2026-09-24): "ik
// wil een optie om meerdere partijen tegelijk af te drukken." Zelfde opbouw per partij als
// hierboven, alleen met een pagina-einde ertussen i.p.v. een aparte sectie per partij (dat
// laatste zou ook kunnen, maar een pagina-einde is eenvoudiger en geeft hetzelfde resultaat
// omdat elke partij toch al met dezelfde pagina-instellingen werkt).
export async function buildMeerderePartijenDocxBlob(partijen) {
  const children = [];
  partijen.forEach((partij, i) => {
    if (i > 0) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    children.push(...partijChildren(partij));
  });
  const doc = new Document({ sections: [{ properties: { page: pageSetup() }, children }] });
  return Packer.toBlob(doc);
}
