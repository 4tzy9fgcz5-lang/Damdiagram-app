import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260923o";
import { buildCsv, buildPdnText } from "../src/export/portable.js?v=20260923o";

const stand = {
  fen: "W:W13,15,33:B1,5,30",
  opdracht: "Speciale opdracht",
  oplossing: "33-28",
  auteur: "Jansen",
  jaartal: 2001,
  publicatie: "Damboek; deel 2",
  categorieen: { speelsysteem: ["Keller"], type: ["lokzet"] },
  moeilijkheid: 3,
  notities: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("leesbare export", () => {
  it("bouwt geldige CSV met kop en waarden, met correcte quoting", () => {
    const csv = buildCsv([stand]);
    const lines = csv.split("\r\n");
    assertEqual(lines[0], "fen;opdracht;oplossing;auteur;jaartal;publicatie;speelsystemen;types;moeilijkheid;notities;aangemaakt");
    assertTrue(lines[1].includes('"Damboek; deel 2"'));
    assertTrue(lines[1].startsWith("W:W13,15,33:B1,5,30;"));
  });

  it("bouwt leesbare tekst met FEN en metadata", () => {
    const text = buildPdnText([stand]);
    assertTrue(text.includes('[FEN "W:W13,15,33:B1,5,30"]'));
    assertTrue(text.includes("Jansen, 2001, Damboek; deel 2"));
    assertTrue(text.includes("Oplossing: 33-28"));
  });
});
