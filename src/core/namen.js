// Spelernamen: intern bewaard als los voornaam/achternaam-veld (Jans wens, CLAUDE.md-feedback
// 2026-09-23: op het scherm "Voornaam Achternaam", op de afdruk "Achternaam Voornaam"). Deze
// twee weergaven zijn dus altijd afgeleid van dezelfde twee velden — nergens een aparte
// "printnaam" om bij te houden.
//
// `splitNaam` zet een oude, ongesplitste naam ("Jan van der Star") om in de twee velden, voor
// zowel het automatisch invullen vanuit geplakte partijtekst als het tonen van een partij die
// vóór deze wijziging al met één naamveld was opgeslagen (zie `normalizeSpelers` in
// partijen.js). Een vaste lijst tussenvoegsels: geen woordenboek, dus een onbekend tussenvoegsel
// wordt gewoon bij de voornaam gerekend — altijd te corrigeren in het formulier.
const TUSSENVOEGSELS = new Set([
  "van", "der", "den", "de", "ten", "ter", "te", "'t", "op", "in", "aan", "het", "bij", "vande", "vander", "von", "di", "le", "la",
]);

export function splitNaam(volledig) {
  const delen = String(volledig ?? "").trim().split(/\s+/).filter(Boolean);
  if (delen.length <= 1) return { voornaam: "", achternaam: delen[0] ?? "" };
  let splitIndex = delen.length - 1;
  while (splitIndex > 0 && TUSSENVOEGSELS.has(delen[splitIndex - 1].toLowerCase())) splitIndex--;
  return { voornaam: delen.slice(0, splitIndex).join(" "), achternaam: delen.slice(splitIndex).join(" ") };
}

export function naamWeergave(voornaam, achternaam) {
  return [voornaam, achternaam].filter(Boolean).join(" ");
}

export function naamPrint(voornaam, achternaam) {
  return [achternaam, voornaam].filter(Boolean).join(" ");
}
