// Opgaveblad automatisch samenstellen: standen kiezen op moeilijkheidsgraad,
// verdeeld over "niveaus" (hele sterren), zonder standen die al in een eerder
// blad van hetzelfde trainingsprogramma staan. Alleen logica, geen scherm.
//
// Een halve ster telt bij de hele ster eronder (2 en 2,5 = niveau 2);
// 0,5 ster valt onder niveau 1.

export const VERDELING_OPTIES = [
  { key: "gelijk", label: "Gelijkmatig over alle niveaus" },
  { key: "makkelijk", label: "Meer makkelijk dan moeilijk" },
  { key: "oplopend", label: "Oplopend per blad (bij meer dan 1 blad: elk blad iets moeilijker)" },
  { key: "zelf", label: "Zelf bepalen per niveau" },
];

export function niveauVan(moeilijkheid) {
  if (moeilijkheid == null) return null;
  return Math.max(1, Math.floor(moeilijkheid));
}

export function niveausTussen(min, max) {
  const lijst = [];
  for (let n = min; n <= max; n++) lijst.push(n);
  return lijst;
}

// Verdeelt `totaal` diagrammen over de niveaus (laag -> hoog). Geeft { niveau: aantal }.
// - gelijk: elk niveau evenveel; een restje gaat naar de moeilijkste niveaus.
// - makkelijk: gewichten lopen lineair van 2 (makkelijkste) naar 1 (moeilijkste).
// - zelf: de ingevulde aantallen (`handmatig`), zoals ze zijn.
export function verdeelAantal(totaal, niveaus, modus, handmatig = {}) {
  const uit = {};
  if (niveaus.length === 0) return uit;
  if (modus === "zelf") {
    for (const n of niveaus) uit[n] = Math.max(0, Math.floor(Number(handmatig[n]) || 0));
    return uit;
  }
  const gewichten = niveaus.map((_, i) =>
    modus === "makkelijk" && niveaus.length > 1 ? 2 - i / (niveaus.length - 1) : 1
  );
  const aantallen = verdeelOpGewichten(totaal, gewichten);
  niveaus.forEach((n, i) => (uit[n] = aantallen[i]));
  return uit;
}

// Grootste-rest-methode: verdeelt `totaal` zo evenredig mogelijk over de gewichten.
// Restje: grootste afgeronde deel eerst; bij gelijkspel het laatste (moeilijkste) niveau.
function verdeelOpGewichten(totaal, gewichten) {
  const som = gewichten.reduce((a, b) => a + b, 0);
  const ideaal = gewichten.map((g) => (totaal * g) / som);
  const aantallen = ideaal.map((x) => Math.floor(x + 1e-9));
  let rest = totaal - aantallen.reduce((a, b) => a + b, 0);
  const volgorde = ideaal
    .map((x, i) => ({ i, frac: x - Math.floor(x + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  for (let k = 0; rest > 0; k = (k + 1) % volgorde.length, rest--) aantallen[volgorde[k].i]++;
  return aantallen;
}

// Doorlopend plan: `aantalBladen` bladen van `perBlad` diagrammen, elk blad iets moeilijker.
// Blad 1 volgt "meer makkelijk" (gewichten 2 -> 1 van laag naar hoog niveau), het laatste blad
// het spiegelbeeld (1 -> 2), de bladen ertussen schuiven geleidelijk op. Geeft een lijst
// { niveau: aantal }, één per blad.
export function verdeelReeks(aantalBladen, perBlad, niveaus) {
  const reeks = [];
  for (let b = 0; b < aantalBladen; b++) {
    const t = aantalBladen > 1 ? b / (aantalBladen - 1) : 0.5;
    const gewichten = niveaus.map((_, j) => {
      const p = niveaus.length > 1 ? j / (niveaus.length - 1) : 0.5;
      return (1 - t) * (2 - p) + t * (1 + p);
    });
    const aantallen = verdeelOpGewichten(perBlad, gewichten);
    const uit = {};
    niveaus.forEach((n, i) => (uit[n] = aantallen[i]));
    reeks.push(uit);
  }
  // Afronding kan twee opeenvolgende bladen gelijk maken. Dan schuift er telkens één diagram
  // (van het laagste niveau dat nog iets heeft) een niveau op, tot het blad echt moeilijker is.
  const gemiddelde = (aant) => niveaus.reduce((som, n) => som + n * aant[n], 0);
  for (let b = 1; b < reeks.length; b++) {
    while (gemiddelde(reeks[b]) <= gemiddelde(reeks[b - 1])) {
      const i = niveaus.findIndex((n, k) => k < niveaus.length - 1 && reeks[b][n] > 0);
      if (i === -1) break;
      reeks[b][niveaus[i]]--;
      reeks[b][niveaus[i + 1]]++;
    }
  }
  return reeks;
}

// Kiest alle bladen van een reeks achter elkaar uit dezelfde voorraad: een stand die op een
// eerder blad staat, komt op geen enkel ander blad van de reeks terug.
export function kiesReeks({ standen, uitgesloten = new Set(), aantallenPerBlad, aanvullen = false, rng = Math.random }) {
  const gebruikt = new Set(uitgesloten);
  return aantallenPerBlad.map((aantallen) => {
    const r = kiesStandenVoorBlad({ standen, uitgesloten: gebruikt, aantallen, aanvullen, rng });
    for (const s of r.gekozen) gebruikt.add(s.id);
    return r;
  });
}

function schud(lijst, rng) {
  const a = [...lijst];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// standen: kandidaten (al gefilterd op categorie). uitgesloten: Set van stand-id's die niet mogen.
// aantallen: { niveau: gewenst aantal }. aanvullen: bij een tekort uit het dichtstbijzijnde niveau halen.
// Geeft { gekozen (laag -> hoog), tekorten, aangevuld, zonderSterren, uitgeslotenAantal }.
export function kiesStandenVoorBlad({ standen, uitgesloten = new Set(), aantallen, aanvullen = false, rng = Math.random }) {
  const niveaus = Object.keys(aantallen).map(Number).sort((a, b) => a - b);
  const pool = {};
  for (const n of niveaus) pool[n] = [];
  let zonderSterren = 0;
  let uitgeslotenAantal = 0;
  for (const s of standen) {
    const n = niveauVan(s.moeilijkheid);
    if (n == null) {
      zonderSterren++;
      continue;
    }
    if (!(n in pool)) continue;
    if (uitgesloten.has(s.id)) {
      uitgeslotenAantal++;
      continue;
    }
    pool[n].push(s);
  }
  for (const n of niveaus) pool[n] = schud(pool[n], rng);

  const gekozen = [];
  const tekorten = [];
  for (const n of niveaus) {
    const neem = pool[n].splice(0, aantallen[n]);
    gekozen.push(...neem);
    if (neem.length < aantallen[n]) tekorten.push({ niveau: n, gevraagd: aantallen[n], beschikbaar: neem.length });
  }

  let aangevuld = 0;
  if (aanvullen) {
    for (const t of tekorten) {
      let nodig = t.gevraagd - t.beschikbaar;
      // Dichtstbijzijnde niveau eerst; bij gelijke afstand het makkelijkere.
      const buren = niveaus.filter((n) => n !== t.niveau).sort((a, b) => Math.abs(a - t.niveau) - Math.abs(b - t.niveau) || a - b);
      for (const b of buren) {
        while (nodig > 0 && pool[b].length > 0) {
          gekozen.push(pool[b].shift());
          nodig--;
          aangevuld++;
        }
        if (nodig === 0) break;
      }
    }
  }

  // Makkelijk -> moeilijk (stabiel: binnen dezelfde moeilijkheid blijft de willekeurige volgorde).
  gekozen.sort((a, b) => a.moeilijkheid - b.moeilijkheid);
  return { gekozen, tekorten, aangevuld, zonderSterren, uitgeslotenAantal };
}

// Welke stand-id's staan al in een eerder opgaveblad van dit programma?
export function standIdsInProgramma(stencils, programma, behalveStencilId = null) {
  const ids = new Set();
  const naam = (programma ?? "").trim().toLowerCase();
  if (!naam) return ids;
  for (const st of stencils) {
    if (st.id === behalveStencilId) continue;
    if ((st.programma ?? "").trim().toLowerCase() !== naam) continue;
    for (const item of st.standen ?? []) ids.add(item.standId);
  }
  return ids;
}
