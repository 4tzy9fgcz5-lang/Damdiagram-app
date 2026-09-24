import { describe, it, assertEqual } from "./test-runner.js?v=20260925b";
import { splitNaam, naamWeergave, naamPrint } from "../src/core/namen.js?v=20260925b";

describe("namen: splitNaam", () => {
  it("splitst een gewone naam op het laatste woord", () => {
    assertEqual(splitNaam("Wouter Sipma"), { voornaam: "Wouter", achternaam: "Sipma" });
  });

  it("houdt een tussenvoegsel bij de achternaam", () => {
    assertEqual(splitNaam("Jan van der Star"), { voornaam: "Jan", achternaam: "van der Star" });
  });

  it("laat een naam van één woord als achternaam staan", () => {
    assertEqual(splitNaam("Wiersma"), { voornaam: "", achternaam: "Wiersma" });
  });

  it("werkt op een lege naam", () => {
    assertEqual(splitNaam(""), { voornaam: "", achternaam: "" });
  });
});

describe("namen: weergave", () => {
  it("naamWeergave is voornaam-achternaam, naamPrint is achternaam-voornaam", () => {
    assertEqual(naamWeergave("Jan", "van der Star"), "Jan van der Star");
    assertEqual(naamPrint("Jan", "van der Star"), "van der Star Jan");
  });

  it("laat een ontbrekende voornaam gewoon weg (geen dubbele spatie)", () => {
    assertEqual(naamWeergave("", "Wiersma"), "Wiersma");
    assertEqual(naamPrint("", "Wiersma"), "Wiersma");
  });
});
