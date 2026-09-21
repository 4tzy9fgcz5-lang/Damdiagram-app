# Werkafspraken

- Jan van der Star is niet-technisch. Communiceer uitsluitend in gewoon, jargonvrij
  Nederlands. Elke vraag gaat vergezeld van een concreet voorstel.
- Ik push nooit zelf naar GitHub. Ik commit lokaal (na elk afgerond stapje); Jan
  pusht altijd zelf via GitHub Desktop. "Gepusht" in mijn eigen verslagen betekent
  dus alleen "lokaal gecommit", tenzij Jan zelf bevestigt dat hij gepusht heeft.
- Werk in kleine, zelfstandig te testen stappen. Test een UI-wijziging altijd
  daadwerkelijk in de browser (zie "Testen tijdens ontwikkeling" hieronder) voor je
  meldt dat iets werkt.
- Jan is damtrainer en kent het spel goed; hij is geen programmeur. Leg keuzes uit
  in gewoon Nederlands en zeg erbij wat hij zelf moet doen (welk commando, welke
  map). Is iets een keuze over damregels of trainingspraktijk: vraag het hem, hij is
  de expert. Verzin geen damkennis (openingsnamen, bronnen, oplossingen).
- **Eerst lezen en plannen, dan pas bouwen.** Bij een nieuwe fase van de uitbreiding
  (zie hieronder): beschrijf eerst wat ik van plan ben en wacht op akkoord.
- **Bestaande gegevens zijn heilig.** Elke wijziging aan het databaseschema moet
  bestaande standen behouden (migratie of afleiden bij het lezen, nooit leegmaken).
  Vraag Jan vóór zo'n wijziging een back-up te maken (`#/instellingen/backup`); de
  database staat in zijn browser en ik kan er zelf geen kopie van maken.
- **Raak niet aan zonder opdracht:** de foto-herkenning (`damscan/`,
  `src/recognition/`) en de regelengine (`src/core/draughtsMoves.js`) worden bij
  het werk aan de uitbreiding gebruikt, niet gewijzigd. Moet er toch iets
  veranderen, meld dat eerst.
- **Testen met echte voorbeelden** (PDN-partijen met commentaar, studies met
  zijvarianten) uit `testdata/`. Een stap is pas klaar als die voorbeelden goed
  laden, goed getoond worden en goed printen. `testdata/` staat buiten GitHub;
  kleine, zelfgemaakte voorbeelden voor de automatische tests mogen wel in git.
- Voeg geen zware afhankelijkheden toe zonder het te melden en uit te leggen.

# Uitbreiding: dam-toolkit (plan van Jan, 2026-09-21)

Jan wil de app uitbreiden van een tool voor opdrachtvellen naar een grotere
dam-toolkit met drie nieuwe onderdelen: een **studiestanden**-database, een
**partijen**-database (met commentaar, print en de filmopdracht) en een
**openingen**-database (zoeken op naam en op stand). De inventarisatie van wat er
al is staat in `INVENTARISATIE.md` (2026-09-21); lees die eerst bij werk hieraan.

Kort: veel bouwstenen zijn er al (bord, afspeler, klikinvoer, damregels, Word-
export, back-up). Het grote gat is een echte **zettenboom**: nu heeft een stand een
hoofdlijn plus één laag zijvarianten (`zetten` + `zijvarianten`), zonder commentaar
per zet en zonder varianten in varianten.

## Damkennis (gecontroleerd tegen de code, 2026-09-21)

- **Regelvariant:** Nederlands/internationaal dammen, 10x10. De code gaat hier
  overal van uit (50 velden, damrij = rij 0 en 9). **Fries dammen of andere
  varianten worden niet ondersteund** en zijn ook niet gepland.
- **Veldnummering:** 1 t/m 50 op de donkere velden; zwart start op 1-20, wit op
  31-50 en speelt naar lagere nummers (`src/core/board.js`). Klopt met het plan.
- **Notatie:** gewone zet `32-28`, slag `28x19`. De code schrijft een meerslag met
  **alle landingsvelden** (`22x33x40`, `moveToNotation`), PDN schrijft meestal alleen
  begin en einde (`22x40`), soms met tussenvelden. Een PDN-lezer moet beide kunnen en
  de zet opzoeken uit de toegestane zetten. Er bestaan ringslagen (schijf komt op zijn
  beginveld terug) die op twee kanten kunnen: dat geeft twee zetten met dezelfde
  uitkomst — kies er één.
- **Zetnummering:** één nummer per paar; wit begint altijd een nieuw nummer, dus als
  zwart begint komt er "12. ... 33-28" (`plyMoveNumber`).
- **FEN:** `W:W31,K32:B1,2` (aan zet, dan wit, dan zwart). PDN-bestanden gebruiken
  ook bereiken (`31-50`); `parseFen` kan dat nog niet en moet dat leren (kleine
  aanpassing in `fen.js`, niet in de regelengine).
- **Betrouwbaarheid regelengine:** doorgerekend vanaf de beginstelling geeft hij op
  diepte 1-7 exact de bekende referentie-aantallen (9, 81, 658, 4.265, 27.117,
  167.140, 1.049.442). Dieper telt hij alleen ringslag-dubbelen extra, geen
  regelfouten.
- Schijven en dammen zijn twee soorten stukken; wit en zwart.

## Woordenlijst (Nederlands = wat in de app en in code voorkomt)

| Term | Betekenis |
|---|---|
| stand | positie op het bord: schijven en dammen, en wie aan zet is |
| diagram | afbeelding van een stand (op papier of scherm) |
| opdrachtvel | werkblad met opdrachten voor de speler |
| antwoordvel | hetzelfde blad met de oplossing erin |
| combinatie | stand met een winnende reeks slagen/offers |
| studie | langere uitwerking van een stand, met zijvarianten en tekst |
| partij | volledig gespeelde of modelpartij (PDN) |
| opening | beginfase met naam; kan meerdere namen (aliassen) hebben |
| zijvariant | alternatieve reeks zetten binnen een studie of partij |
| filmen | trainingsopdracht: de 6 belangrijkste momenten van een partij intekenen |

## Doelarchitectuur (uitgangspunten)

Studies, partijen en openingslijnen zijn dezelfde soort ding: een **beginstand,
een zettenboom (hoofdlijn met zijvarianten) en tekst bij stand of zet**. Ze
verschillen in metadata en in de manier van invoer. Bouw dus één gedeeld model
en drie weergaven daarvan, geen drie losse systemen.

- **Zettenboom:** elke zet wordt gecontroleerd door de regelengine. Een
  onmogelijke zet wordt gemarkeerd, niet stilzwijgend opgeslagen. Komt naast het
  bestaande `zetten`/`zijvarianten` en wordt bij het lezen daaruit afgeleid (zoals
  `normalizeCategorieen`), zodat bestaande standen ongemoeid blijven.
- **Positie-index:** van elke stand in elke lijn wordt een canonieke weergave
  opgeslagen (bezette velden + wie aan zet), zodat zoeken op stand een gewone
  opzoeking is en transposities gevonden worden. Zoeken werkt over alle
  onderdelen heen (partijen, studies, openingen). Nu bestaat alleen een index op de
  beginstand van elke stand (`fen`/`mirrorFen`).
- **Tekst uit boekscans is foutgevoelig.** Laat herkenning bij het diagram, laat
  de oplossing plakken of typen in notatie en laat de regelengine die
  controleren. Houd altijd een correctiestap.
- **Herkomst en rechten:** houd bij elk item de bron vast (boek, auteur,
  toernooi, link). Of er een gedeelde database komt met materiaal uit boeken is
  een openstaande keuze; ga niet uit van een gedeelde database zonder overleg.
- **Import van toernooibase:** begin met PDN-bestand of plakken. Bouw geen
  scraper zonder overleg.
- **Eén zetten-omzetter** (tekst -> zetten, gestuurd door de regelengine) voor zowel
  PDN-import als het "oplossingen via foto meesturen"-plan verderop; niet twee
  bouwen. Startpunt: `tools/meetOplossingen.mjs`.
- **Engine-analyse (Scan):** buiten scope voor nu. Niet bouwen.
- **Lokaal en voor één gebruiker** blijft de opzet (IndexedDB in de browser); hosting
  met inlog/dossiers voor meerdere gebruikers is nog niet beslist (backend-taal
  open). Houd gegevens per onderdeel uit- en inleesbaar.

## Fasering ("Uitbreiding, fase 1-4")

Niet te verwarren met de fases 0-3 van het herkenning-verbeterplan verderop.

1. **Kern:** zettenboom, validatie, positie-index, viewer om door een boom te
   stappen.
2. **Partijen:** PDN inladen, doorspelen, commentaar per zet, printen, en de
   filmmodule (zie hieronder).
3. **Studies:** bestaande foto-invoer plus oplossing met zijvarianten en tekst;
   printen.
4. **Openingen:** lijnen en namen; zoeken op naam en op stand.

Voorstel voor stap-voor-stap uitwerking van fase 1: `INVENTARISATIE.md`, onderdeel 7
(nog niet uitgevoerd; wacht op akkoord van Jan).

## Filmmodule (onderdeel van fase 2)

Doel: een trainer maakt van een partij een **opdrachtvel** en een **antwoordvel**.

- Niet bij elke partij nodig. Het proces wordt alleen doorlopen als de trainer
  een partij in de filmmodule opent.
- **Opdrachtvel:** partijgegevens bovenaan (spelers, datum, toernooi), een regel
  voor de naam van de speler, dan de notatie, dan 6 lege diagrammen. Er wordt
  niets aangeklikt; de speler moet zelf de belangrijkste momenten vinden.
- **Antwoordvel:** dezelfde pagina, maar de trainer heeft 6 momenten (zetten)
  aangeklikt en de diagrammen zijn ingevuld met die standen. Onder elk diagram
  staat het zetnummer en optioneel een korte toelichting (dezelfde tekst als het
  commentaar bij die zet).
- **Notatie-opmaak:** 5 zetnummers per regel (1-5, 6-10, 11-15, ...). Elk
  zetnummer heeft wit en zwart naast elkaar, dus 5 witte en 5 zwarte zetten per
  regel. Een laatste regel met minder zetten blijft kort; eindigt de partij na een
  witte zet, dan blijft de zwarte plek leeg.
- **Opslag:** bij de partij komt een verwijzing naar de gemaakte filmopdracht,
  zodat het niet opnieuw hoeft. Bewaar daarbij ook de 6 gekozen zetnummers en het
  aantal diagrammen (standaard 6, instelbaar bijv. 4 of 8), niet alleen de
  PDF's, zodat de vellen opnieuw te genereren en aan te passen zijn.
- **Techniek:** komt als nieuwe pagina-bouwer naast `src/export/docx.js` (die de
  bestaande kop, marges, diagram-naar-plaatje en pagina-onderdelen hergebruikt); het
  huidige stencil (`buildOpgavenTable`) is op opgaven gebouwd. Voorstel: eerst alleen
  als Word-bestand, de HTML-voorbeeldweergave (`stencilPreview.js`) later.

## Openstaande punten (uitbreiding)

- Hosting voor meerdere gebruikers (inlog, dossiers): eerder besproken, nog niet
  beslist. Backend-taal is open.
- Vragen aan Jan die nog beantwoord moeten worden: `INVENTARISATIE.md`, onderdeel 6
  (o.a. prioriteit partijen/studies, voorbeeldpartijen aanleveren, velden van een
  partij, of zoeken ook gespiegelde standen moet vinden).

# Status en vervolgstappen (bijgewerkt 2026-09-21, nacht)

Dit is een groeiende Nederlandse dam-app (werknaam "Dam-database", eerder
"Damstencil"): standen verzamelen (handmatig, of via een foto van een boekdiagram),
oplossingen intikken door op het bord te klikken, en stencils samenstellen die als
Word-document worden geëxporteerd. Alles lokaal in de browser (IndexedDB), geen
server, geen build-stap.

## Architectuur — kort overzicht

- Routing/render in `src/ui/app.js`: `#/nieuw` (invoer/correctie), `#/foto`
  (foto-import), `#/database` (overzicht), `#/stand/:id` (detailpagina, alleen-
  lezen), `#/bulk`/`#/bulk-diagram` (bulk-import van een paginafoto),
  `#/stencils`/`#/stencil/:id`, `#/instellingen` (met o.a. `#/instellingen/backup`),
  `#/import`.
- IndexedDB via `src/db/*.js`: `standen` (nu ook met `zetten` — de aangeklikte
  oplossing, zie hieronder — en `boekstijl`), `lijsten` (herbruikbare tags,
  waaronder nu ook `boekstijl`), `stencils`, `herkenningCorrecties`
  (`herkenningLog.js` — logt bij elke foto-opslag automatisch: rechtgetrokken
  beeld + uiteindelijke stand + boekstijl, als toekomstig trainingsmateriaal voor
  de fotoherkenning).
- **Sinds 2026-09-18: filtercategorieën zijn generiek en zelf te beheren.**
  Speelsysteem en Type zijn niet langer eigen velden op een stand, maar de
  twee starterswaarden van `src/db/categorieen.js` (leeft in dezelfde
  `lijsten`-store als voorheen, nu met een `label`-veld — dat onderscheidt een
  categorie-record van een gewone lijst zoals `boekstijl`). Een stand heeft nu
  één generiek `categorieen`-veld (`{ [key]: string[] }`) i.p.v. losse
  `speelsystemen`/`types`-velden; `standen.js` (`normalizeCategorieen`) leidt
  dat terugwaarts-compatibel af voor oudere, nog niet-gemigreerde records —
  geen aparte migratiestap nodig. Beheer (toevoegen/hernoemen/verwijderen van
  een hele categorie) zit in Instellingen -> Database
  (`renderDatabaseSettingsSection` in `settingsView.js`); de waarden binnen
  een categorie beheer je nog steeds met "+ nieuw" op het invoerscherm
  (ongewijzigd, via `lijsten.js`'s `getList`/`addListValue`).
- **Oplossing wordt niet meer getypt maar aangeklikt.** `src/core/draughtsMoves.js`
  is een eigen, geteste damregels-motor (gewone zetten, slagplicht, de
  meeste-slaan-regel, vliegende dam, en: een schijf die tijdens het slaan over de
  damrij komt maar nog kan doorslaan blíjft een schijf — pas dam als de slag daar
  écht eindigt). `src/ui/solutionInput.js` is de klikbare invoer (rondt automatisch
  af zodra er nog maar één zet mogelijk is). `src/ui/solutionPlayer.js` is de
  alleen-lezen afspeelweergave (◀◀ / ▶ / ▶▶, zoals toernooibase).
- **Sinds 2026-09-16: zijvarianten.** Een stand kan naast `zetten` (de
  hoofdlijn) ook `zijvarianten` hebben: `[{ id, vanaf, zetten }]`, waarbij
  `vanaf` het 0-based indexnummer in de hoofdlijn is dat de variant vervangt.
  `draughtsMoves.js` heeft `formatZettenSequence`/`formatZettenMetVarianten`/
  `plyColor`/`plyMoveNumber` voor de zetnummering; `resolveOplossingTekst`
  (dus ook de Word-export) toont varianten tussen haakjes. Toevoegen kan
  zowel bij het intikken (`solutionInput.js`, knop "Zijvariant toevoegen",
  geneste aanroep van zichzelf met `allowVariations: false` — geen
  varianten-op-varianten) als achteraf via "Bewerken" op een bestaande
  stand. Bij afspelen (`solutionPlayer.js`) spring je ná het einde van de
  hoofdlijn met "volgende" terug naar de eerste zijvariant; automatisch
  afspelen (de klok-knop) blijft bewust binnen de hoofdlijn.
- **Sinds 2026-09-16: vorige/volgende op de standdetailpagina.** Kom je er
  via de database-pagina, dan onthoudt `src/ui/app.js` (`standNavIds`) de
  toen zichtbare, gefilterde/gesorteerde lijst van standen, en toont
  `standDetailView.js` daarmee "Vorige"/"Volgende"-knoppen. Vanuit een
  opgaveblad geopend: geen navigatie (nog niet ondersteund).

## Veldherkenning: drie classifiers naast elkaar (standaard: neuraal netwerkje, sinds 2026-09-21)

- **Neuraal netwerkje (standaard)**: `src/recognition/cnnModel.js` (rekenkern, puur JS,
  exact dezelfde code in de browser en in Node) + `cnnClassify.js` (koppeling) +
  `damscan/cnn_weights.json` (3 netwerkjes, kansen gemiddeld). Zie "Neuraal netwerkje"
  hieronder voor werkwijze, meting en hertrainen.

- **Oud**: `src/recognition/classify.js` — handgetunede heuristiek (kmeans-
  splitsing, lichthelling-correctie). `CONFIDENCE_THRESHOLD = 0.65`.
- **Sinds 2026-09-20: vangnet tegen omgekeerd zwart/leeg (oude classifier).**
  Op een foto met gearceerde donkere velden en effen zwarte schijven koos de
  oude classifier de zwarte schijven als "zeker leeg" (minste textuur) en zag
  daardoor alle gearceerde lege velden als schijf: zwart en leeg precies
  omgedraaid, witte schijven wél goed (gemeld door Jan). Oorzaak was geen
  foto-probleem maar een aanname in `classifyStandard()` (`classify.js`).
  `reclassifyWhenBlackIsInverted()` grijpt alleen in als >= 4 velden veel
  donkerder zijn dan het bord (midden < 0,4 x mediaan) en het hoofdresultaat
  die grotendeels "leeg" noemt; dan = donker zwart, duidelijk lichter dan de
  lege velden = wit. Op de 4 testfoto's met bekende stand exact dezelfde
  uitkomst als voorheen. Test: `tests/classify.test.js` (echte meetwaarden).
- **Nieuw** (sinds 2026-09-15; sinds 2026-09-21 NIET meer de standaard, zie "Herkenning-verbeterplan" hieronder): `src/recognition/newFeatures.js` /
  `newModel.js` / `newClassify.js` — ES-module-poort van `damscan/features.js`,
  `damscan/model.js`, `damscan/classify.js`. **Werkt per bord, niet per veld**:
  `classifyBoard(crops)` moet alle 50 velduitsnedes in één keer krijgen, want de
  kenmerken worden genormaliseerd t.o.v. de andere velden van hetzelfde diagram.
  `FLAG_BELOW = 0.9`. Gewichten komen uit `damscan/weights.json`, opgehaald via
  `fetch()` in `diagramCaptureView.js` (`WEIGHTS_VERSION`-constante — **na elke
  hertraining met de hand ophogen**, dit valt buiten het cache-bust-script
  hieronder).
- Schakelaar zit in `src/ui/diagramCaptureView.js` (hoeken-scherm én resultaten-
  scherm, altijd gesynchroniseerd). Wisselen op het resultatenscherm herclassificeert
  dezelfde, al rechtgetrokken foto opnieuw — geen hoeken opnieuw nodig.
- **Sinds 2026-09-16: automatische vergelijking, ongeacht welke classifier
  gekozen is.** `classifyWithComparison()` in `diagramCaptureView.js` laat bij elke
  herkenning ook de andere classifier op de achtergrond meekijken (puur ter
  vergelijking, de gekozen classifier blijft bepalend voor de getoonde stand) en
  markeert velden waar ze een ander stuk zien als onzeker (`disagreementFields`,
  samengevoegd met de eigen onzeker-velden van de gekozen classifier) — dit bleek
  uit de vergelijking veruit de grootste resterende foutenbron te dekken, groter
  dan wat elke classifier voor zichzelf al als onzeker herkent.
- **Sinds 2026-09-20: automatische rastercorrectie vóór classificatie.**
  `refineGrid()` in `src/recognition/gridRefine.js` draait in
  `diagramCaptureView.js` direct na het rechttrekken, voor beide classifiers:
  zoekt een kleine translatie/schaal/rotatie van het 10x10-raster die de
  randsterkte langs de rasterlijnen maximaliseert (het bordpatroon zelf is
  altijd een schaakbord, ongeacht de stukken erop), en trekt het beeld met die
  correctie nogmaals recht. Vangt op dat de 4 aangewezen hoekpunten net niet
  exact op de speelveldrand zaten. Zichtbaar onder "Toon herkenningsstappen".
  Werkt samen met `stripBorderToPlayfield()` in `detectBoard.js` (zie
  "Openstaand" → Fase 1 hieronder voor het volledige verhaal): die snijdt vóór
  het rechttrekken al een eventuele dikke bordrand grof weg, `refineGrid()`
  polijst daarna de laatste kleine restfout (met name restrotatie) weg.
- `damscan/` is een los Node/CommonJS-trainingspijplijn (inmiddels in git
  getrackt). Vanuit de project-root: `node damscan/train.js labels.txt crops
  damscan/weights.json`. `labels.txt`, `crops/`, `check/` zijn gitignored
  (auteursrechtelijk gevoelige boekplaatjes, alleen lokaal bij Jan).
- `tests/compare.html` — lokale, **gitignored** vergelijkweergave: draait oud en
  nieuw naast elkaar op de gelabelde `crops/`+`labels.txt`-set, toont per veld het
  verschil, en telt per classifier de fouten plus apart hoeveel velden ze het
  oneens zijn. Werkt alleen via `python3 -m http.server 8000`, nooit op GitHub
  Pages (de data staat niet in git).

## Openstaand / eerstvolgende stappen

### Oplossingen via foto meesturen (plan + meting, 2026-09-21) — stap 1-4 gebouwd (via plakken)

**Stand (2026-09-21, avond):** stap 1-4 zijn klaar en lokaal gecommit. Jan heeft GEEN
Anthropic-API-sleutel, dus stap 3 is gebouwd als **"Claude-chat als lezer + plakken"**: geen
sleutel, geen server. Alleen "later koppelen aan al opgeslagen standen op nummer" (stap 5) en
een eventuele echte API-aanroep (dan wordt het plakken automatisch; zelfde tekstvorm) ontbreken.
- **Stap 3 — plakken:** in het bulk-overzicht (`bulkImportView.js`) een kader "Oplossingen erbij":
  knop "Kopieer opdracht voor Claude" (`src/ui/oplossingOpdracht.js`, vaste opdracht: één
  oplossing per regel "570. 1. 21 - 17 22 x 11 ...", niets corrigeren, varianten behouden, in één
  codeblok) en een plakvak. `splitOplossingenTekst` (`solutionParser.js`) verdeelt per regel op
  nummer (volgorde maakt niet uit; negeert ```/**/opsommingstekens). Live status "gevonden voor
  X van Y diagrammen". De geplakte tekst blijft onthouden (`uiSettings.js`, localStorage) voor de
  volgende foto; knop "Wis geplakte tekst".
- **Stap 4 — invullen:** `bulkQueue`-diagram krijgt `oplossingTekst` -> `pendingRecognition` ->
  `initialOplossingTekst` in `editorView.js`. Daar staat boven de klikbare oplossing een paneel
  "Oplossing uit het boek": leest de tekst met `parseOplossing` op het huidige bord + beurt, vult
  `zetten`/`zijvarianten` in, en meldt (groen/oranje/rood) wat er niet klopte. Zodra het bord of
  "wie is aan zet" verandert, wordt opnieuw gelezen (250 ms uitstel) — zo dient het inlezen zelf
  als controle op de herkende stand. Knoppen: "Opnieuw inlezen", en bij een oplossing die met de
  andere kleur begint "Zet zwart/wit aan zet". Bij een bestaande stand (bewerken) is er geen
  paneel. Uitgeprobeerd in de echte app met de 12 diagrammen 582-593 en de tekst van de 24
  oplossingen: gewoon, deels (584), variant (586), weggelaten antwoorden (585), herstelde zet
  (588) en de beurt-knop werken.
- **Stap 2 — de gedeelde zetten-omzetter:** `src/core/solutionParser.js` (`parseOplossing`,
  `splitOplossingenPerNummer`); tests `tests/solutionParser.test.js`. Geeft `zetten` +
  `zijvarianten` (zelfde vorm als `solutionInput.js`) en `meldingen` in gewoon Nederlands
  (`fout` / `let-op` / `info`), plus `volledig`, `betrouwbaar`, `hersteld`, `aangevuld`. Zetten
  die net niet mogen (1-2 tekens verschil) worden hersteld naar de dichtstbijzijnde toegestane
  zet, mét melding; `herstel: false` zet dat uit. Op de 24 echte oplossingen: 22 volledig
  (2 niet: 580 en 584, zie meting). Bedoeld om ook voor PDN-import te hergebruiken (zie
  uitbreidingsplan). Meten: `node tools/meetOplossingen.mjs boards.json lezing.txt`.
- **Stap 1 — nummer boven het diagram:** `src/recognition/numberOcr.js` (strook boven het bord
  -> Tesseract.js, geladen van jsDelivr zodra nodig, dus internet nodig; zonder internet blijft
  handmatig invullen werken). Nummers die niet gelezen zijn of niet in de doorlopende reeks
  passen worden uit de reeks afgeleid (`fillMissingNumbers`, rij- én kolomvolgorde). In de
  echte app op de 24 diagrammen: 24/24 goed (7 afgeleid, gemarkeerd "afgeleid, controleer").
  Bulk-overzicht (`bulkImportView.js`) toont per diagram een nummerveld; het nummer gaat via
  `bulkQueue` -> `initialNummer` naar de editor en wordt bewaard als `nummer` (tekst) op de stand
  (veld "Nummer in het boek", ook in de detailweergave). Bestaande standen hebben het veld niet
  en blijven werken (leeg).

Wens van Jan: naast de diagramfoto('s) ook foto('s) van de oplossingenpagina's (achterin
het boek, dus meestal een andere sessie) meesturen; de app leest de diagramnummers en de
oplossingen en vult na het controleren van de stand automatisch het klikbare oplossingsbord
in, met een foutmelding als iets niet klopt. Stappenplan: (1) nummer boven elk diagram lezen
en op het bulk-overzicht tonen/corrigeren, en bij de stand bewaren (`nummer`); (2) zetten-
omzetter (tekst -> `zetten`/`zijvarianten`, gestuurd door `draughtsMoves.js`), (3) scherm
voor oplossingenpagina's + koppelen op nummer, (4) invullen in `createSolutionInput`
(`initialZetten`/`initialZijvarianten`) pas nadat de stand gecontroleerd is, (5) optioneel:
later koppelen aan al opgeslagen standen op nummer+boekstijl.

**Meting (Jans foto's IMG_0766-0770 -> `testdata/oplossingen/`, Russisch boek, diagrammen
570-593 en oplossingen 558-598).** Meetprogramma: `tools/meetOplossingen.mjs` (speelt een
afgelezen oplossing zet voor zet na op de herkende stelling; stellingen uit
`tools/bulkCheck/boardsDriver.js`). Ontleden gestuurd door de damregels (bij elke zet: welke
TOEGESTANE zet past als begin van de resterende tekst?) lost spatie-/cijferplakkers op
("31 - 278 - 12" = 31-27 8-12), en kent: zetnummers, "x." als slotteken, `!`/`?`, Cyrillisch
commentaar, varianten tussen haakjes en met `A)`, en weggelaten gedwongen antwoorden
("43 - 39, 9. 49 x 7", met komma).
- **Nummers boven de diagrammen lezen met Tesseract (strook boven het gevonden bord, geen
  cijferlijst): 21/24 goed**, de 3 missers zijn met de doorlopende reeks te herstellen.
- **Oplossingstekst lezen met Tesseract (lokaal, gratis): ongeschikt** — 1/24 volledig
  nagespeeld, bij 11/24 zelfs het nummer niet eens gevonden (scheve/gebogen pagina,
  buurpagina in beeld, spaties en tekens door elkaar). Bijsnijden + cijfers-only hielp niet.
- **Lezen door een taalmodel met beeld (Claude; hier gemeten via mijn eigen lezing van de
  foto's op dezelfde resolutie als de API zou krijgen, dus een vervanger, niet de echte
  API-aanroep): 24/24 goed gelezen, 19/24 volledig nagespeeld.** De 5 rest: 584 = tekst
  na de laatste zet is commentaar ("met onvermijdelijke dreiging 24-2x"), 576 = boek/
  diagram wijkt af (boek: "6 x 17", toegestaan is 16x7: cijfers verwisseld), 578 = boek:
  42x5, toegestaan 42x4 (één veld ernaast), 580 en 588 = de twee diagrammen met een
  sterretje "*)" in het boek; bij beide klopt de gedrukte stelling niet met de gedrukte
  oplossing. Stelling herkend door de app klopte in alle 4 gecontroleerde gevallen met
  de foto. Dus: vrijwel alle "fouten" zijn bronfouten of commentaar, geen leesfouten —
  precies wat de foutmelding moet opvangen. Ideeën: dichtstbijzijnde toegestane zet
  voorstellen (geel, ter bevestiging) i.p.v. stilzwijgend herstellen.
- Let op: Jan noemde 20 diagrammen, het zijn er 24 (2 pagina's van 12); in dit boek lopen de
  nummers per rij, in het Poolse boek (`testdata/pages5/IMG_0669`) per kolom — dus altijd
  het nummer echt lezen, niet uit de volgorde afleiden.
- Nog niet gemeten: de echte API-aanroep (vraagt een eigen Anthropic-API-sleutel van Jan,
  alleen lokaal bewaard, nooit in de code/GitHub; foto's gaan dan naar Anthropic).

### Neuraal netwerkje (2026-09-21) — nu de standaardherkenner

Aanleiding: hertrainen van de oude logistische regressie (`damscan/`) op Jans 140
nieuwe diagrammen gaf geen winst (92,2%). Daarom een sterker model gebouwd op
dezelfde gelabelde velduitsneden.

- **Model:** 2 conv-lagen (3x3, 8 en 16 filters) + 2 dichte lagen, ~14.000
  gewichten, invoer 2 kanalen van 26x26 per veld (kanaal 0: helderheid genormaliseerd
  t.o.v. alle 50 velden van HETZELFDE diagram, dus ongevoelig voor drukstijl/
  belichting; kanaal 1: dezelfde uitsnede binnen het veld zelf genormaliseerd = vorm
  los van contrast). Drie netwerkjes (andere startwaarden) worden gemiddeld, elk met
  terugspiegelen (TTA); ~1,2 s per bord in de browser. Getraind met Adam, 24 rondes,
  willekeurige verstoringen (verschuiven ±2px, spiegelen, contrast/helderheid).
- **Eerlijke meting (6 meetrondes, steeds een groep boekstijlen buiten de training):
  98,8% goed, 98 fout op 8200 velden, 142/164 borden foutloos, gemiddeld 0,6 fout
  per bord** — de logistische regressie haalt op dezelfde data 92,2% (640 fout).
  Langer trainen (40 rondes) gaf niets (98,7%). Per stijl: Jermakov 100%, Boezjinski
  98,6%, Kovrizjkin 99,6%, Damspel_Kleingoed 100%, **Koeperman 94,5% (zwakste)**;
  diagrammen zonder stijl ("onbekend", 68 stuks) zijn per diagram verdeeld over de
  rondes, dat cijfer (98,4%) is dus iets optimistischer. Gele rand bij zekerheid
  < 0,95 (`CNN_FLAG_BELOW`): ~5% van de velden gemarkeerd, vangt 56% van de fouten
  (0,98: 7% / 68%). Op de 6 testfoto's met bekende stand in de echte app: 13 fouten
  (oud 45, nieuw 47), 0 op 5 van de 6; alleen IMG_0497 (hoekdetectie vindt geen bord)
  gaat mis, met 41 gele velden. NB: een deel van die 6 foto's kan in de trainingsdata
  zitten, dit is een controle op de koppeling, niet de meting zelf.
- **Bij dit werk gevonden en opgelost:** `gridRefine.js` vulde na de kleine
  verschuiving het stuk buiten de foto met WIT (band van ~6px langs de rand), waardoor
  de netwerkjes de witte schijven op de onderste rij (46-50) misten. Nu randherhaling
  (`warpPerspective(..., clampEdges = true)`); alleen daar, de rest van de detectie
  gebruikt nog het witte invulgedrag.
- **Herkenner kiezen:** schakelaar op het hoeken-/resultatenscherm en in het
  correctiescherm (drie opties). Bij "Neuraal netwerk" is er geen vergelijking met de
  oude herkenning (die levert alleen ruis: de oude is veel minder nauwkeurig) — alleen
  de eigen zekerheid < 0,95 markeert. Bij "Oude"/"Nieuwe" blijft het onenigheid-randje.
- **Hertrainen** (nieuwe export via `#/instellingen/backup`; ook in `tools/cnn/train.mjs` beschreven):
  1) export uitpakken in een LEGE map (labels.txt + crops/), eventueel eerdere data
  eraan toevoegen; 2) `tools/cnn/run-all.sh labels.txt crops uitvoermap` = 6
  meetrondes parallel (~1 min op 10 kernen) + rapport; 3) `node tools/cnn/train.mjs
  final labels.txt crops uitvoermap <seed>` voor seed 1, 2, 3 (parallel, ~1 min);
  4) de drie `cnn_weights_seedN.json` samenvoegen tot `damscan/cnn_weights.json`
  (`{ beschrijving, getraind_op, meting_onbekende_stijl, models: [..3..] }`);
  5) `CNN_WEIGHTS_VERSION` in `diagramCaptureView.js` met de hand ophogen (buiten het
  cache-bust-script). `train.mjs` heeft ook `gradcheck` (terugweg vs. numerieke
  schatting). De boekstijlgroepen per meetronde staan bovenin `train.mjs`
  (`STYLE_FOLD`): een nieuwe stijl moet daar in een groep, anders valt hij bij
  "onbekend".
- **Nog te doen / ideeën:** Koeperman is de zwakste stijl (meer voorbeelden helpen
  hier waarschijnlijk wel); dammen (schijf met dam) worden nog steeds niet herkend
  (labels tellen ze als gewone schijf); bord-vergelijking van snelheid: 600 doorlopen per
  bord, TTA kan naar 2 spiegelingen als 1,2 s te traag voelt.

### Correcties na Jans testronde (2026-09-21)

Jan meldde na de Fase 1/2-werkzaamheden: (1) nog steeds vaak een 8x8- i.p.v.
10x10-selectie, (2) de damlogica-aanpassingen (Fase 2) waren afleidend en
brachten geen verbetering, (3) de oude herkenning is op veel diagrammen beter
dan de nieuwe. Aanpak en uitkomst:

- **8x8-selectie — oorzaak gevonden en aangepakt.** Twee bronnen, beide in
  `detectBoard.js`: (a) als stap 1 niets vindt (strak bijgesneden diagram, dun/
  licht randje) viel de app terug op een vaste marge van 12% per kant — bij een
  bord dat het beeld vult snijdt dat ruim één veld per kant weg = precies 8x8;
  (b) soms pakt stap 1 een klein stukje gearceerde velden aan voor het hele bord.
  Nieuw: `src/recognition/gridFit.js` (`gridFitScore()`) meet hoe goed een kader
  bij een 10x10-patroon past (zwakste van de 18 binnenlijnen, gedeeld door de
  randsterkte tussen de lijnen). `detectPlayfieldFromImageData()` vergelijkt het
  gevonden kader met "hele foto (rand weggesneden)" en kiest het alternatief
  alleen als het >15% beter past en zelf een echt patroon laat zien
  (score >= 0,6); een gevonden kader kleiner dan 20% van de foto wordt alleen
  behouden als de hele foto niet minstens 90% zo goed past. De vaste 12%-marge
  telt alleen nog mee als stap 1 NIETS vond, en nooit ten koste van een gevonden
  kader. **Bewust weggelaten:** een extra "kader per kant bijstellen"-stap
  (coördinaat-afdaling op dezelfde score) — die sneed op strakke foto's juist te
  veel weg (nieuwe 8x8-selecties), dus te riskant. Bekende rest: een strak
  bijgesneden foto met een titelregel erboven krijgt de titelregel mee in het
  kader (lichte scheefstand van het raster), en foto's met een breed zwart kader
  om het bord (IMG_1058) vallen terug op de vaste marge.
- **Bulk-import: hoeken zoeken op het patroon (2026-09-21, nacht).** Eerste test op
  Jans 5 paginafoto's (IMG_0664/0665/0668/0669/0670 -> `testdata/pages5/*.jpg`,
  gitignored) met alleen de automatische kaders: van 53 volledig zichtbare diagrammen
  werden er 48 gevonden, 17 (35%) daarvan verkeerd ingekaderd. **Oorzaken:**
  `detectMultiBoard.js` voegt de hoeken van de omhullende rechthoek van elke vlek toe
  aan de hull (`points.push([minx, miny]...)`), dus het kader is altijd een RECHTE
  rechthoek (te ruim bij een scheef genomen foto, nummer/onderschrift dat de bordrand
  raakt doet mee), en `stripBorderToPlayfield` snijdt weer een rechte rechthoek.
  **Oplossing:** `src/recognition/quadFit.js` zoekt de vier echte hoeken direct op het
  dambordpatroon (`fitBoardQuad`): maat = afgeknot gemiddelde van de lichte cellen min
  dat van de donkere (donker = rij+kolom oneven, 5x5 punten per cel), patroonzoektocht
  met 12 verplaatsingen (8 hoeken + 4 zijden), 4 startposities (0/4/8/12% kleiner),
  tiebreak op randsterkte langs het kader, daarna een fijnafstelling op de 11+11
  rasterlijnen (`gridLineScore`, max 12% van de zijde, patroonmaat mag niet zakken).
  `patternSeparation` (kans dat een lichte cel lichter is dan een donkere; 0,5 = geen
  patroon) en het contrast wijzen niet-borden af: tekst, een hand, een foto scoorden
  0,52-0,65 en contrast 3-7, het vaagste echte bord 0,71 en 16 (`bulkDetect.js`:
  drempels 0,6 en 10). Gemiste borden: `findMissingBoards` bepaalt uit de gevonden
  borden de kolommen en rijen (min. 2 gevonden) en past op elk leeg kruispunt een bord
  (drempel 0,68, want het kruispunt is voorspeld). Alles zit in `bulkDetect.js`
  (`detectBulkBoards`, leesvolgorde rij voor rij), gebruikt door `bulkImportView.js`;
  de oude `tightenCorners*`-functies zijn verwijderd. ~1 s per pagina.
  **Resultaat op de 5 pagina's:** alle 53 volledig zichtbare diagrammen gevonden
  (3+6+20+12+12; alleen half zichtbare diagrammen op de andere pagina worden niet gevonden), de hand is weg, en de
  33 oudere pagina's geven 53 borden (was 62 kandidaten, waarvan ~8 geen bord: tekst,
  persoon, onzinkaders; pagina's zonder diagram -> 0). Bij 0664, 0665, 0669, 0670 staan
  alle borden goed ingekaderd en kloppen alle stukaantallen; **pagina 0668 (20 vage
  miniaturen) zit op ~13 van 20 goed** — bij de andere ligt het raster nog een halve
  cel te laag/opzij (stukken op de rasterlijn, gele velden). Volgende stap daarvoor:
  de uitlijning laten sturen door de zekerheid van het neurale netwerkje (raster in
  kleine stapjes verschuiven en de stand met de hoogste totale zekerheid kiezen, bij
  het herkennen i.p.v. bij het zoeken), of de schuifverstoring bij het trainen van het
  netwerkje vergroten. Testhulp: `tools/bulkCheck/` (server + driver). Tests:
  `tests/quadFit.test.js`.
- **Losse foto met een stuk van een ander diagram erbij (Jan, 2026-09-21).** Foto's
  `IMG_0747`/`IMG_0749` (`testdata/losse/`, gitignored): het bord in het midden, met
  boven en onder een stuk van het volgende/vorige diagram. **Oorzaak:** de oude
  losse-foto-detectie (`detectPlayfieldByBlob`: grootste donkere vlek -> Otsu ->
  rechte rechthoek) pakt bij een buurdiagram dat het bord raakt een vlek die het bord
  en een stuk van de buren omvat, en de rand-weg-snij-stap hoort dan een rechte
  rechthoek te vinden op een vlek die er niet meer op lijkt (0747: kader half over
  het buurbord; 0749: op 700px zelfs `null`, dus de vaste 12%-marge). **Oplossing**
  (`detectPlayfieldFromImageData` in `detectBoard.js`, drie lagen): (1)
  `findBoardNearCenterByBlobs`: dezelfde vlekken als de bulk-import, elke vlek met
  `fitBoardQuad` op het patroon gepast, het bord dat het midden van de foto bevat wint;
  eerst gewone gevoeligheid, dan gevoeliger (`BLOB_OFFSETS` 10/6/3; drempels
  geruitheid >= 0,78, contrast >= 10, oppervlak >= 10%, een bord mag 97% van het beeld
  vullen); (2) `findCenterBoard` (quadFit.js): grove+fijne vensterscan rond het midden
  op patroon-contrast + zwakste-zijde-randsterkte, als er geen vlek een bord is; (3) de
  oude aanpak als laatste terugval. ~0,15 s per foto (eerst een versie van 2 s: dure
  fits op te kleine vlekken; nu eerst op vlekgrootte filteren). Nagemeten op alle 130
  foto's uit `~/Downloads/Dammen` (`regress.mjs`-achtige vergelijking oud/nieuw):
  ~36 veranderen, en de veranderingen zijn vrijwel altijd verbeteringen (titelregel/
  nummer boven het bord valt uit het kader). **Bekende beperkingen (gemeten):**
  (a) de patroonmaat gaat uit van de gebruikelijke oriëntatie (donker waar rij+kolom
  oneven, linksboven licht) — dat is ook wat de rest van de app aanneemt
  (`fieldToCoord`). Drie foto's uit de map Miniaturen (123, 125, 127) en een
  zijwaarts genomen foto (054) hebben de donkere hoek aan de andere kant; daar zit
  het kader precies één rij ernaast (of valt terug). Wil Jan die stijl ook, dan moet
  er een spiegel/kantel-stap bij die de rest van de app ook nodig heeft. (b)
  `IMG_9860` (veel borden dicht op elkaar in beeld) blijft fout, net als eerder.
  (c) een schaduw over een deel van het bord (0749) laat de herkenner twee lege
  donkere velden als zwarte schijf zien; die staan wel geel. **Testbord-fout
  gevonden:** de synthetische testborden in `tests/detectBoard.test.js` hadden de
  donkere velden op de "andere" plek (linksboven donker) en zaten daardoor een veld
  ernaast; nu in de gebruikelijke oriëntatie. De test "snijdt nooit meer dan een
  randbreedte weg" is vervangen door "vindt bij een 20% kader het echte 10x10-patroon".
- **Damlogica uit.** `classifyWithComparison()` past de stand niet meer aan
  (`enforceRules` wordt niet meer aangeroepen) en markeert geen extra velden op
  basis van balans/"dam?". Alleen de waarschuwingen "geen enkel stuk herkend" en
  ">20 van één kleur" blijven. De code in `plausibility.js` (+ tests) staat er nog,
  voor als we het later slimmer willen doen.
- **Oude herkenning weer de standaard** (hoeken-/resultatenscherm; sinds later diezelfde nacht ingehaald door het neurale netwerkje, zie boven). Meting met
  de echte app-code op de 6 gelabelde foto's uit `testdata/testfotos/` (fouten
  oud/nieuw): 0127 2/6, 0497 29/18 (hoeken hier onbruikbaar), 0533 3/7, 0616
  11/0, 532 0/10, aa9874c2 0/6 — totaal 45 vs 47, maar oud wint op 4 van 6.
  Ze falen op VERSCHILLENDE plekken: de oude ziet op 0616 alle witte schijven
  over het hoofd, de nieuwe mist er op 532 juist. "Als één van beide een schijf
  ziet, neem die" gaf 41 fouten en op één foto een slechter resultaat — niet
  overgenomen. Het gele onenigheid-randje blijft het vangnet.
- **Hertraining op Jans export van 140 diagrammen (2026-09-21) — geen winst.**
  Werkwijze (vanuit de project-root, dit overschrijft niets als je de export in een
  aparte map uitpakt): (1) `#/instellingen/backup` → "Trainingsmateriaal" → ZIP; (2) uitpakken in
  een lege map; eventueel de oude `labels.txt` eraan plakken en `crops/` samenvoegen;
  (3) `node damscan/train.js <map>/labels.txt <map>/crops <map>/weights_nieuw.json`
  (duurt ~4 min bij 164 diagrammen; alleen de kandidaat-gewichten worden
  weggeschreven, `damscan/weights.json` blijft ongemoeid); (4) pas na een gunstige
  meting `weights_nieuw.json` naar `damscan/weights.json` kopiëren en
  `WEIGHTS_VERSION` in `diagramCaptureView.js` ophogen. Toetsen op ongeziene data:
  `node damscan/evaluate.js labels.txt crops weights.json`. Uitkomst: 164 diagrammen
  (13 "stijlen"), eerlijke meting op een onbekende stijl 92,2% (variant "beide");
  het HUIDIGE model (getraind op 24) haalt op de 140 nieuwe, ongeziene diagrammen al
  92,4% — dus 140 extra voorbeelden lossen de fouten niet op (het model, een
  logistische regressie op 14 kenmerken, zit tegen zijn grens; fouten zijn gelijk
  verdeeld: buitenrand-velden 9,2%, binnenste 6,7%). Niet geïnstalleerd. Volgende
  stap zou een sterker model zijn (bv. klein neuraal netwerkje op de 8200 gelabelde
  velduitsneden), niet meer data. Let op bij de data: 68 van de 140 diagrammen
  hebben geen boekstijl (tellen als één stijl "onbekend"), en "Kovrizjkin" en
  "Kovrizkin" zijn twee spellingen van dezelfde stijl (tellen als twee).
  **Export-fout hersteld:** een boekstijl met een spatie ("Damspel Kleingoed") gaf
  een ongeldige regel in `labels.txt` waardoor `train.js` direct stopte;
  `boardToLabelLine()` (`labelFormat.js`) zet spaties nu om in `_`.
- **Meetprogramma:** `tools/meetHoekdetectie.mjs` (Node, geen browser) draait de
  detectie op een map PNG's en tekent de gevonden kaders. Gebruikt met Jans 130
  foto's uit `~/Downloads/Dammen` (bijna alle boekstijlen); zie de kop van het
  bestand. Draai dit opnieuw bij elke wijziging aan `detectBoard.js`/`gridFit.js`
  — de losse tests alleen zijn te grof gebleken.

### Herkenning-verbeterplan (2026-09-20)

Extern plan van Jan (`~/Downloads/damdiagram_verbeterplan.md`, niet in git). Ik
heb het gereviewd tegen de bestaande code; onderstaande volgorde is de
bijgestelde versie (niet de volgorde uit het originele plan):

- **Fase 0 — klaar (2026-09-20):** de damregel-controles die de nieuwe
  classifier al berekende (te veel stukken van één kleur, gewone schijf op de
  achterste rij) werden weggegooid; die worden nu getoond op het
  resultatenscherm van de fotoherkenning én tellen mee als onzeker veld. Zie
  `sanityCheck()` in `newClassify.js`, gebruikt in `diagramCaptureView.js`.
- **Fase 1 — klaar (2026-09-20), twee delen, na vier mislukte pogingen
  onderweg (zie hieronder):**
  1. Kleine correctie ná het rechttrekken (`src/recognition/gridRefine.js`,
     `refineGrid()`) — geen gebruik van de classifier zelf (te traag om
     tientallen keren per foto te draaien), maar van de vaststelling dat het
     bordpatroon zelf altijd een schaakbordpatroon is: score = opgetelde
     Sobel-randsterkte langs de 18 rasterlijnen, kleine translatie/schaal/
     rotatie daarop geoptimaliseerd (coördinaat-afdaling, ruim onder de 50ms
     per foto). Tests: `tests/gridRefine.test.js`.
  2. **Belangrijker, pas toegevoegd nadat Jan liet zien dat 1. voor hem geen
     verschil maakte:** de automatische hoekdetectie zelf (`detectBoard.js`)
     pakte de buitenkant van de zwarte rand om het speelveld, niet het
     schaakbordpatroon erbinnen. `stripBorderToPlayfield()` snijdt die rand
     nu weg. **Primair (`findDarkBandInnerEdge()`):** de zwarte rand is een
     egaal donkere band; de gemiddelde helderheid per rij/kolom van het
     rechtgetrokken beeld springt aan de binnenkant ervan steil omhoog — die
     plek (steilste stijging) is de patroonrand. Werkt ook op donkere/vage
     foto's. Alleen gebruikt als de band duidelijk donker genoeg is
     (`DARK_BAND_RATIO` 0.6 t.o.v. het midden van het bord) en niet
     onbegrijpelijk ver van de grove schatting ligt. **Terugval:** grove
     gekoppelde schatting van celbreedte+start uit een randsterkte-
     projectieprofiel (`findGridAxisRough()`), per kant gepreciseerd naar de
     dichtstbijzijnde echte piek (`refineEdge()`, met een marge van 40% van
     een cel, de uiterste 1,5% van het beeld overgeslagen, en samenvoegen of
     onderscheiden van pieken via een "vallei" ertussen). Tests:
     `tests/detectBoard.test.js`.
  Beide draaien automatisch bij elke herkenning (ook bulk-import), zichtbaar/
  toegepast vóór classificatie. Geverifieerd met Jans eigen testfoto's in
  `testdata/` (niet alleen synthetische plaatjes), door de gevonden hoeken
  als overlay op de foto te tekenen. Bewust NIET gedaan: "aanpak B" uit het
  plan (voorspelde vs. gecorrigeerde hoekpunten loggen voor een toekomstig
  hoek-model) — blijft openstaan.
  - *Mislukte pogingen onderweg (allemaal door Jan of eigen tests afgekeurd):*
    (a) per-rij/kolom-**variantie** (ruis in de rand telde als patroon);
    (b) `gridRefine`-aanpak met een breed zoekbereik (periodieke aliasing);
    (c) projectieprofiel dat de score van 9 interne lijnen maximaliseert —
    kiest bij bijna-gelijke scores een plek nog binnen de rand (Jan: "nauwelijks
    verbetering"), en één gekoppelde celbreedte over beide kanten laat een
    rand die links dikker is dan rechts niet toe; (d) puur de sterkste
    randpiek nemen — de buitenkant van de rand (papier→rand) is vaak
    sterker dan de binnenkant (rand→patroon).
  - **Terugval gevonden door Jan (2026-09-20) en opgelost:** bij losse foto's
    pakte de automatische selectie soms een 8x8-raster i.p.v. 10x10 (een of
    twee cellen per kant te veel weggesneden). Oorzaak: `findGridAxisRough()`
    mocht een celbreedte van 0,72 t.o.v. het bord kiezen (aliasing op het
    schaakbordpatroon), en de randdetectie had geen bovengrens. Fix:
    `MAX_BORDER_FRACTION` = 8% — een rand is per kant nooit meer dan dat
    (gemeten op echte foto's: tot ~6,5%, een hele cel is 10%), gebruikt in de
    grove zoektocht, bij de donkere-band-methode en als laatste klem.
    **Testmethode die dit vond:** de 5 bulk-paginafoto's in
    `testdata/bulkpages/` geven ~45 losse diagrammen; die uitsnijden (zoals
    `cropAroundCorners`) en door `detectCornersFromImageData` +
    `stripBorderToPlayfield` halen en de inset per kant uitrekenen. Vóór de fix
    13 van 45 met een kant >8% (tot 27%), erna 0 (grootste 8,0%). Tip voor
    toekomstige wijzigingen aan `detectBoard.js`: draai dit opnieuw.
  - **Belangrijke bevinding (2026-09-20), nog niet opgelost:** met de strakke
    hoeken haalt de OUDE classifier op de 4 testfoto's met bekende stand
    (`testdata/testfotos/standen.txt`; IMG_0377 = de "532"-foto) samen maar
    5 fouten (0/1/3/1), de NIEUWE classifier 23 (was 11 bij de vorige,
    ruimere hoeken). De uitsneden zelf zijn schoon en gecentreerd; de nieuwe
    classifier mist witte schijven op donkere velden met 97-100% "leeg". De
    nieuwe classifier is dus gevoelig voor de hoek-geometrie waarop hij
    getraind is. Vervolg: hertrainen op strakke crops (export uit stap 1
    hieronder), of tijdelijk de oude classifier als standaard.
  - **Bekende resterende beperking:** op sommige foto's blijft aan één kant
    (meestal rechts/onder) nog een dun streepje rand over — bij gekromde
    pagina's kan één rechthoek niet overal perfect passen.
  - `testdata/IMG_532.jpeg` (gitignored, alleen lokaal) is de exacte foto
    waarmee Jan dit meldde — een goede "moeilijke" foto om een volgende keer
    weer tegenaan te testen bij wijzigingen aan `detectBoard.js`/
    `gridRefine.js`. `testdata/testfotos/` had 'm al staan (identiek bestand,
    ander diagram dan waar de map oorspronkelijk voor bedoeld was).
- **Fase 2 — klaar (2026-09-20):** `src/recognition/plausibility.js`
  (`checkPlausibility(board, confidences)` + `warningFields()`), voor BEIDE
  herkenners gelijk (de oude had voorheen geen damregel-controle); vervangt in
  `diagramCaptureView.js` de eigen `sanityCheck()` van de nieuwe herkenner
  (die blijft bestaan maar wordt daar niet meer gebruikt). Regels: geen enkel
  stuk herkend (waarschijnlijk foute hoeken), >20 van één kleur, gewone
  schijf op de eigen damrij ("dam?") — die blijven waarschuwingen — en
  **materiaalbalans**. Bevestigd door Jan: in ~95% van zijn opgaven is het
  aantal wit/zwart gelijk, enige normale afwijking is 1 stuk.
  **Sinds dezelfde dag corrigeert de balansregel ook actief** (Jan wilde meer
  dan een waarschuwing): `enforceRules(board, probs)` zet zo weinig en zo
  goedkoop mogelijk velden om tot het verschil ≤ 1 is (leeg→stuk van de
  kleur met te weinig, stuk→leeg, of stuk→andere kleur), kosten = log-verhouding
  van de kansen per veld; nooit een gewone schijf op de eigen damrij, dammen
  blijven ongemoeid. De kansen per veld zijn het gemiddelde van beide
  herkenners (de oude levert alleen een gekozen antwoord + zekerheid, de rest
  wordt gelijk verdeeld: `probsFromConfidences`). Aangepaste velden worden
  altijd als onzeker (geel) gemarkeerd en apart gemeld in de waarschuwing
  ("heeft de app 8 veld(en) aangepast: veld 47 (leeg → wit), …"), zichtbaar
  in `diagramCaptureView.js` (`classifyWithComparison`). Meting op de 4
  testfoto's met goede hoeken en bekende stand: nieuwe herkenning 23 → 6
  fouten, oude 5 → 5 (twee foto's 1 beter, één 1 slechter). Foto IMG_0497
  (hoekdetectie stap 1 vindt niets, dus standaardhoeken) is onbruikbaar ~
  13-20 fouten; niet door dit opgelost. Tests: `tests/plausibility.test.js`.
  Op de "532"-testfoto: nieuwe herkenning wit 4/zwart 13 → 8 velden
  aangepast → 25 van 26 goed. Géén aparte confidence voor "dam" (dammen
  worden nooit automatisch herkend, zie classify.js).
- **Fase 3 — daarna:** onzekerheid tegen schaduw/boekstijl. De nieuwe
  classifier is al vanaf het begin ontworpen om ongevoelig te zijn voor
  drukstijl/belichting (lokale kenmerken per veld + normalisatie over de 50
  velden van hetzelfde bord, zie `newFeatures.js`) — het plan zijn voorstel
  (CLAHE-achtige lokale contrastcorrectie) overlapt daar grotendeels mee. Wat
  wél nieuw en waarschijnlijk het proberen waard is: tijdens trainen
  kunstmatig variaties toevoegen (donkerder/lichter, wazig, vergeeld) —
  `damscan/train.js` doet dat nu niet.
- Hertrainen op de ~150 gescande diagrammen (stap 4 uit het plan) kan al, via
  de exportknop uit stap 1 hieronder.

0. Jan wil een **instellingen-pagina** (nog te maken) met een subheader
   "database". Daar moet de aanname "alle standen in de database hebben een
   oplossing" een plek krijgen — dit verving het filter "Met en zonder
   oplossing" op de database-pagina (2026-09-16 weggehaald, zie
   `src/ui/databaseView.js`), dat niet meer zinvol was onder die aanname.
1. **Klaar (2026-09-16): export van `herkenningLog` naar `labels.txt` + crops.**
   Zit nu op `#/instellingen/backup`, kaart "Trainingsmateriaal voor de fotoherkenning" —
   `buildTrainingZip()` in `src/export/trainingExport.js` zet het hele logboek om
   naar een ZIP (`labels.txt` + `crops/diagNN/01.png..50.png`) in precies het
   formaat dat `damscan/train.js` verwacht. Uitpakken in de project-root
   (overschrijft `crops/`+`labels.txt`) en daarna opnieuw trainen. (De oude, losse
   "Exporteer voor labelen"-flow blijft bewust verwijderd — dit loopt nu via het
   logboek.)
2. **Klaar (2026-09-16): geel randje bij onenigheid tussen oud en nieuw.** Zie
   hierboven bij "Veldherkenning". Eerstvolgende logische vervolgstap zou zijn om
   in de praktijk te zien hoeveel dit daadwerkelijk scheelt zodra Jan er een tijd
   mee gescand heeft.
3. Na elke nieuwe `damscan/weights.json`: `WEIGHTS_VERSION` in
   `src/ui/diagramCaptureView.js` met de hand ophogen (dit bestand heette
   eerder `photoImportView.js`, inmiddels losgetrokken zodat foto-import en
   bulk-import dezelfde hoeken/herken-stap delen).
4. Zwakke stijlen uit de laatste training (Kovrizkin, Koeperman) zouden het meest
   baat hebben bij een paar extra gescande diagrammen uit precies die boeken —
   makkelijker nu de export uit stap 1 er is.
5. IMG_0976's onscherpte is bevestigd een fotokwaliteitsprobleem, geen bug — hier
   niets aan doen.
6. **Klaar (2026-09-16): dubbele `render()` bij het laden van de pagina.**
   `src/ui/app.js` riep bij elke paginalading zowel `render()` direct aan als
   via een `DOMContentLoaded`-listener — een module-script draait al ná het
   parsen (zoals `defer`), dus die listener vuurde altijd een tweede keer.
   Gaf een race tussen twee gelijktijdige `renderDatabaseView`-aanroepen met
   als zichtbaar gevolg dubbele opties in de filter-dropdowns. De
   `DOMContentLoaded`-listener is verwijderd; alleen de directe `render()`-
   aanroep (eerste keer laden) en de `hashchange`-listener (navigatie) blijven
   over.

## Testen tijdens ontwikkeling

- Lokaal: `python3 -m http.server 8000` vanuit de project-root, dan de Browser-
  tool naar `http://localhost:8000/...`.
- **Cache-valkuil**: de browser cachet JS-modules soms hardnekkig op exact
  dezelfde `?v=`-URL, zelfs na een "verse" navigatie in dezelfde tab — dit gaf
  meerdere keren verwarrende, inconsistente testresultaten deze sessie. Bij een
  onverklaarbaar/inconsistent resultaat: open een gloednieuwe tab in plaats van de
  bestaande te hergebruiken, en/of hoog de cache-bust-versie nog een keer op.
- Automatische tests: `tests/tests.html` (zelfde server). Eén bekende, altijd
  falende test hoort daarbij en is geen regressie: "vindt een duidelijke zwarte
  bordrand op een verder effen foto" (hoekdetectie-test, al bekend probleem).
- `tests/compare.html` alleen lokaal, voor de classifier-vergelijking (zie boven).

# Cache-busting

GitHub Pages (via Fastly) caches every file for 10 minutes (`max-age=600`), even
for a brand-new visitor or a private/incognito window — a hard refresh does
**not** bypass this, only a genuinely new URL does. That caused a lot of "ik heb
gepusht en getest maar zie geen verschil" confusion in the past.

Every relative import across `src/`, `tests/`, and `index.html` therefore carries
a shared `?v=YYYYMMDDx` query string (e.g. `?v=20260914a`). When you edit any file
that's meant to go live, bump this version string on **every** relative import in
**every** `src/*.js`/`tests/*.js` file and in `index.html` (script + stylesheet
tag), in the same commit — not just in the file you changed. A one-off script to
do this in one pass:

```bash
python3 - <<'EOF'
import re, glob

VERSION = "YYYYMMDDx"  # bump this

def bump_file(path):
    with open(path, encoding="utf-8") as f:
        content = original = f.read()
    def repl(m):
        prefix, path_part, suffix = m.group(1), m.group(2), m.group(3)
        return f'{prefix}{path_part.split("?")[0]}?v={VERSION}{suffix}'
    content = re.sub(r'(from\s+")((?:\.\./|\./)[^"]+)(")', repl, content)
    content = re.sub(r'(^import\s+")((?:\.\./|\./)[^"]+)(")', repl, content, flags=re.MULTILINE)
    content = re.sub(r'(import\(\s*")((?:\.\./|\./)[^"]+)("\s*\))', repl, content)
    if content != original:
        open(path, "w", encoding="utf-8").write(content)
        return True
    return False

for path in glob.glob("src/**/*.js", recursive=True) + glob.glob("tests/*.js"):
    bump_file(path)
EOF
```

Then manually bump the two `?v=` occurrences in `index.html` (the `<link>` and
`<script>` tags) and, if relevant, `tests/tests.html`'s imports, to the same value.

Because the *whole graph* shares one version token, bumping it guarantees every
file refreshes together — no partial mix of old and new files, which is what
made earlier caching symptoms so confusing to diagnose.
