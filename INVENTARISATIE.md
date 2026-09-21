# Inventarisatie van de Damdiagram-app

Opgesteld op 2026-09-21, op basis van het lezen van de code. Er is bij dit onderzoek
niets aan de app veranderd (de enige aanpassing is `CLAUDE.md`, zie onderdeel 5).
Waar iets is gemeten of gedraaid, staat dat erbij; wat ik niet kon nagaan, staat
bij de vragen.

## 1. Samenvatting

- Het is een **werkende, groeiende website** (geen server, geen bouwstap) van bijna
  10.000 regels, op GitHub Pages. Alle gegevens staan in de browser van de gebruiker.
- Ruim een derde van de code is fotoherkenning (foto -> stand). Dat deel is het best
  uitgewerkt en getest (98,8% goed op onbekende boekstijlen).
- **De damregels zijn betrouwbaar.** Bij een eigen controle (alle mogelijke
  partijverlopen tot 7 zetten diep tellen) komt de regelengine precies op de bekende
  aantallen uit. Dieper (8-9) telt hij een klein aantal *dubbele* zetten extra: dat
  is een ringslag die twee kanten op kan, met dezelfde uitkomst. Geen regelfout.
- Er is al een **bord, een afspeler met zijvarianten, een klikbare invoer, een
  Word-export en een back-up**. Jouw inschatting klopt: veel bouwstenen zijn er.
- **Het grote gat is de zettenboom.** Een stand heeft nu een hoofdlijn plus één laag
  zijvarianten, geen commentaar per zet en geen varianten in varianten. Partijen,
  studies en openingen hebben dat wel nodig.
- Er is **geen PDN-lezer**, geen zoeken op een stand *binnen* een zettenlijn, en
  geen partij-, studie- of openingsgegevens. Wel begint een zetten-omzetter
  (`tools/meetOplossingen.mjs`) al te bestaan.
- Het databaseschema kan **veilig uitgebreid** worden zonder bestaande standen aan te
  raken (dezelfde werkwijze als bij de filtercategorieën).
- Gezondheid: goed. Van de 152 automatische tests draaien er 98 zonder browser en
  die slagen allemaal; de andere 54 (fotobeeld, database, Word) hebben een browser
  nodig en zijn door mij niet gedraaid.

## 2. Per onderwerp

### 2.1 Overzicht en opzet

- **Techniek:** een statische website: gewone HTML, CSS en JavaScript-modules. Geen
  framework, geen bouwstap, geen server. Start: `index.html` laadt
  `src/ui/app.js`. Lokaal testen met `python3 -m http.server 8000`. Live op
  GitHub Pages. De enige meegeleverde bibliotheek is `lib/docx.mjs` (Word-bestanden).
  Voor losse hulpprogramma's in Node is alleen `pngjs` geïnstalleerd.
- **Mappen in `src/`:**
  - `core/` — bord, veldnummering, FEN, damregels (`draughtsMoves.js`), snelle
    tekstinvoer.
  - `db/` — de database (standen, lijsten en categorieën, stencils, back-up,
    deel-link, herkenningslogboek).
  - `diagram/` — tekent een bord als SVG-plaatje.
  - `export/` — Word (`docx.js`), plaatje/PNG, CSV en leesbare export, ZIP,
    trainingsmateriaal.
  - `recognition/` — alle fotoherkenning (ongeveer 4.000 regels).
  - `stencil/` — indeling en voorbeeldweergave van opgavebladen.
  - `ui/` — de schermen (`app.js` is de routekaart).
- **Schermen (routes):** `#/nieuw`, `#/foto`, `#/bulk`, `#/bulk-diagram`, `#/database`,
  `#/stand/:id`, `#/stencils`, `#/stencil/:id`, `#/instellingen` (met daarin
  back-up en database-instellingen) en `#/import`.
- Naast `src/`: `damscan/` (los trainingsprogramma voor de fotoherkenning),
  `tools/` (meetprogramma's, ook los), `tests/`, `testdata/` (eigen foto's, niet op
  GitHub), `lib/`.

### 2.2 Regelengine

- **Waar:** `src/core/draughtsMoves.js` (259 regels), met `board.js` (velden, kleuren,
  spiegelen), `fen.js` en `validate.js`.
- **Variant:** Nederlands/internationaal dammen, 10x10, 50 velden, vliegende dam.
  Overal vast ingebouwd (`FIELD_COUNT = 50`, damrij = rij 0 en 9). **Fries dammen
  en andere varianten worden niet ondersteund**, ook niet als voorbereiding.
- **Nummering:** veld 1 linksboven (tweede kolom van de bovenste rij), zwart start op
  1-20, wit op 31-50 en speelt naar lagere nummers. Linksonder (veld 46) is donker.
  Dat is de gebruikelijke opstelling.
- **Wat hij kan:** alle toegestane zetten van een stand geven (`getLegalMoves`), een
  zet uitvoeren (`applyMove`), slagplicht, meeste-slaan-regel (alle stukken tellen
  even zwaar, ook dammen), vliegende dam, geslagen stukken blijven pas na de hele
  slag weg, een schijf die tijdens het slaan over de damrij komt en nog kan
  doorslaan blijft een schijf. Een zet is een object
  `{ van, pad, geslagen, wordtDam }`.
- **Wat hij niet kan:** het einde van een partij herkennen (geen zet meer =
  verloren, remiseregels) en zetten in tekstvorm lezen. Beide zijn voor de eerste
  fasen niet nodig; de uitslag van een partij komt uit PDN.
- **Betrouwbaarheid, wat ik gemeten heb:**
  - 15 eigen tests in `tests/draughtsMoves.test.js`: alle geslaagd. Ze dekken
    gewone zetten, slagplicht, meeste-slaan, vliegende dam, promotie, ringslag.
    Ze testen niet: zwart aan zet, en een hele partij doorspelen.
  - **Doorrekenen vanaf de beginstelling** (in een tijdelijk bestand buiten het
    project, niets aangepast): aantal mogelijke partijverlopen op diepte 1 t/m 7 =
    9, 81, 658, 4.265, 27.117, 167.140 en 1.049.442. Dat zijn precies de bekende
    referentiecijfers voor internationaal dammen (bron: Perft-tabel, zie
    [Aart's Blog](https://aartbik.blogspot.com/2012/10/bikdam-international-checkers.html)
    en het [World Draughts Forum](https://damforum.nl/viewtopic.php?t=2308)).
    Zo'n uitkomst is een sterk bewijs dat zetten, slagen en dammen kloppen.
  - Op diepte 8 en 9 telt de engine 6.483.971 en 41.022.614 tegen de
    referentie 6.483.961 en 41.022.423 (10 en 191 te veel). Oorzaak
    onderzocht: in 10 stellingen (op diepte 8) kan een schijf een ringslag maken
    die op het beginveld eindigt en dezelfde 4 stukken slaat, rechtsom of linksom;
    de engine geeft die als **twee zetten met dezelfde uitkomst**, de referentie
    telt er één. Voorbeeld: `B:W21,22,31,32,34,...` (zwart 17: 17x26x37x28x17 en
    17x28x37x26x17). Dat is geen regelfout, maar heeft twee gevolgen: bij het
    inlezen van een PDN-zet zijn beide paden gelijkwaardig (kies er één), en bij
    het klikken kan de tweede volgorde als aparte keuze verschijnen.

### 2.3 Database

- **Type:** IndexedDB in de browser (naam `damstencil_app`, schemaversie 2). Elk
  apparaat/browser heeft zijn eigen database; er is geen synchronisatie.
- **Archieven (tabellen):** `standen`, `lijsten` (herbruikbare keuzelijsten en de
  filtercategorieën), `stencils` (opgavebladen), `meta`, `herkenningCorrecties`
  (per foto-opslag: het rechtgetrokken beeld, de uiteindelijke stand en de
  boekstijl, als trainingsmateriaal).
- **Wat staat er per stand** (`src/db/standen.js`): `id`, `fen` en `mirrorFen`
  (de stand als tekst en zijn spiegelbeeld, beide doorzoekbaar), `opdracht`,
  `oplossing` (oude, getypte tekst), **`zetten`** (de aangeklikte oplossing,
  lijst van zet-objecten), **`zijvarianten`** (`[{ id, vanaf, zetten }]`),
  `auteur`, `jaartal`, `publicatie`, `categorieen` (vrij uit te breiden
  filtercategorieën, standaard Speelsysteem en Type), `moeilijkheid` (cijfer,
  1-5, leeg = 3 bij sorteren), `notities`, `boekstijl`, `foto` (rechtgetrokken
  scan als plaatje, wordt niet meegestuurd in deel-links), `gebruiktIn`,
  `createdAt`, `updatedAt`.
- **Zettenboom?** Nee. Het is een **hoofdlijn plus zijvarianten van één niveau**:
  een variant vervangt de hoofdzet op plek `vanaf` en heeft zelf een platte lijst.
  Geen varianten in varianten, geen tekst of teken (!, ?) per zet, geen
  "aan zet"-veld los van de FEN. Het zit vast ingebouwd in speler en invoer
  (`allowVariations: false` bij de geneste invoer).
- **Speltype / combinatietype / moeilijkheid:** speltype en combinatietype zijn er
  als de twee starters van de vrije categorieën (`speelsysteem` en `type`, met
  eigen waarden); de gebruiker kan er categorieën bij maken. Moeilijkheid is een
  gewoon cijfer en wordt in filter en sortering gebruikt. Er is dus geen aparte
  "speltype"-structuur nodig; de bestaande categorieën kunnen dat dragen.
- **Uitbreidbaarheid:** goed. Schemawijzigingen lopen via genummerde stappen in
  `schema.js`; oude records worden bij het lezen aangevuld (voorbeeld:
  `normalizeCategorieen`), dus geen bestaand record hoeft omgezet te worden.
- **Wat er niet is:** velden voor spelers, datum, toernooi, resultaat en
  bron-link (nodig voor partijen), en een index op *alle* stellingen in een
  zettenlijn. Er is wel een zoek-op-stand voor de *beginstand* van elke stand
  (dubbelenwaarschuwing, exact en gespiegeld).

### 2.4 Foto-invoer (niet aangeraakt)

Keten, van foto tot opslag:

1. **Foto kiezen** (`#/foto` losse foto, of `#/bulk` een pagina met meer diagrammen).
2. **Bord vinden** (`detectBoard.js`, `detectMultiBoard.js`, `quadFit.js`,
   `bulkDetect.js`): vier hoeken op het dambordpatroon, gemiste borden aanvullen.
   Handmatig hoeken verslepen kan altijd.
3. **Rechttrekken** (`homography.js`) en **fijn uitlijnen** (`gridRefine.js`).
4. **Herkennen per veld** (`diagramCaptureView.js`): drie herkenners; het
   **neurale netwerkje** (`cnnModel.js`, gewichten in `damscan/cnn_weights.json`) is
   de standaard, met de oude en de nieuwe herkenner als keuze. Twijfelachtige
   velden krijgen een gele rand.
5. **Correctie** in de bordeditor (`editorView.js`): jij tikt fouten recht en
   klikt de oplossing aan.
6. **Opslaan** (`standen` plus een regel in `herkenningCorrecties`).

Stand van zaken volgens `CLAUDE.md` (niet zelf opnieuw gemeten): 98,8% goed op
onbekende boekstijlen, 142 van 164 borden foutloos, zwakste stijl Koeperman
(94,5%). Dammen (schijf met dam) worden nooit automatisch herkend; die tik je zelf
aan. In ontwikkeling: uitlijning van vage miniaturen (pagina 0668: ~13 van 20
goed), en het **inlezen van de oplossingen uit een foto** (zie 2.7 en risico 6).
`damscan/` is een los trainingsprogramma (Node); de app zelf gebruikt alleen de
gewichtenbestanden.

### 2.5 Opdrachtvellen en print

- **Techniek:** Word-bestanden (`.docx`) via de meegeleverde bibliotheek, geen
  PDF-generatie. Daarnaast een voorbeeldweergave in de browser (HTML), die je via
  de browser kunt afdrukken of als PDF opslaan.
- **Werking:** een stencil (`stencils`-archief) bevat titel, club, datum, opdrachtregel
  en een lijst van standen met een eigen opdrachttekst. `docx.js` maakt pagina's
  met een kop en een raster van 1-12 diagrammen (`stencil/layout.js`), elk diagram
  eerst als SVG getekend en dan als PNG in het document gezet. Apart
  oplossingenblad, sorteren op moeilijkheid.
- **Herbruikbaar voor andere bladen?** Deels. Herbruikbaar: pagina-instelling,
  kopregel, het tekenen van een (ook leeg) diagram en het omzetten naar plaatje,
  het rastermaken, tekst opmaken. Niet herbruikbaar: de tabelopbouw
  (`buildOpgavenTable`) is op opgaven gebouwd. Een filmblad (kop, naamregel,
  notatie met 5 zetnummers per regel, 6 lege diagrammen) is dus **een nieuwe
  pagina-bouwer die de bestaande onderdelen gebruikt**, geen aanpassing van het
  huidige stencil.
- **Let op:** elk bladtype bestaat nu **twee keer** (Word en HTML-voorbeeld).

### 2.6 Interface

- Standen worden getoond op `#/stand/:id` (alleen-lezen, met afspeler en
  vorige/volgende) en bewerkt via `#/nieuw/:id` (bord, gegevens, klikbare
  oplossing). Het overzicht met filters, sorteren en dubbelen-controle staat op
  `#/database`.
- **Herbruikbare bordonderdelen:** ja.
  `renderDiagramSVG` (bord tekenen), `boardEditor.js` (bord klikbaar bewerken),
  `solutionPlayer.js` (◀◀ ▶ ▶▶, klok voor automatisch afspelen, zijvarianten,
  optie "oplossing verbergen") en `solutionInput.js` (klikinvoer met
  afdwingen van slagplicht). **De afspeler en de invoer (samen ongeveer 850 regels)
  werken echter op het platte model** (hoofdlijn + één laag varianten). Voor een
  boom moeten ze grotendeels opnieuw, al kun je het uiterlijk en het bord
  behouden.

### 2.7 Testen en gegevens

- **Tests:** 20 testbestanden (ruim 2.000 regels, 152 tests) in `tests/`, te draaien via
  `tests/tests.html` in een browser. Ik draaide de onderdelen die zonder browser
  kunnen in Node: **98 geslaagd**, geen fout in de regelengine, veldnummering, FEN,
  diagram, stencil, plausibiliteit, labels, neuraal netwerk (rekenkern) en
  homografie. De overige 54 van de 152 tests (hoekdetectie, raster, database, Word, foto-uitsnede)
  vragen een browser en heb ik niet gedraaid. `CLAUDE.md` noemt één bekende, altijd
  falende test (hoekdetectie, zwarte rand).
- **Voorbeeldgegevens:** `testdata/` heeft alleen foto's (diagrammen, paginafoto's,
  oplossingenpagina's) en staat bewust buiten GitHub (auteursrecht). **Er zijn geen
  PDN-partijen, geen studies met zijvarianten en geen openingen.**
- **Waar staat de database:** in de browser van elk apparaat (IndexedDB). **Back-up:**
  ja, `#/instellingen/backup`: één bestand met standen, lijsten, stencils en het
  herkenningslogboek (dus ook de foto's; het bestand kan groot worden). Terugzetten
  kan samenvoegen of vervangen. De app herinnert je na 14 dagen. Standen kunnen
  ook via een link naar een ander apparaat. Er is geen automatische back-up en ik
  kan de database in jouw browser zelf niet lezen of kopiëren.

## 3. Hergebruik per fase

| | Kan blijven / hergebruikt | Moet nieuw | Moet aangepast |
|---|---|---|---|
| **1. Kern** | regelengine (zetten kiezen en uitvoeren), bord tekenen, bordeditor, FEN, database-hulpjes, back-up, testopzet | zettenboom (knopen met zet, commentaar, kinderen), tekst -> zet-omzetter (PDN), positiesleutel + index (nieuw archief), boom-viewer | FEN moet bereiken lezen (`31-50`, PDN doet dat); afspeler en invoer op de boom; back-up en deel-link moeten de nieuwe archieven meenemen; schema naar versie 3 |
| **2. Partijen** | boom, viewer, Word-onderdelen (kop, diagram naar plaatje, pagina) | PDN-lezer met kop, commentaar, varianten en uitslag; archief `partijen`; velden spelers/datum/toernooi/uitslag/bron; **filmmodule** met notatieopmaak (5 zetnummers per regel), 6-diagrammen-blad, opslag van de gekozen zetnummers; databaseoverzicht voor partijen | zetnummering en `moveToNotation` naar PDN-schrijfwijze (begin-eind), of beide toestaan; import van een grote PDN met meerdere partijen |
| **3. Studies** | bestaande foto-invoer, stand + oplossing, categorieën | de studie = een stand met een boom en tekst; Word-blad voor een studie | oplossing op de boom laten steunen; eventueel type "studie" in de categorieën |
| **4. Openingen** | boom, viewer, positie-index | archief openingen met naam(-en), aliassen; zoeken op naam; zoeken op stand (leest de positie-index) | positie-index moet partijen, studies en openingen samen doorzoeken |

## 4. Risico's

1. **Het platte oplossingsmodel.** Speler en invoer (ongeveer 850 regels) gaan uit
   van hoofdlijn + één laag varianten. Wie de boom invoert zonder dat te
   regelen, breekt de bestaande standen. Aanpak: boom naast het oude formaat,
   omzetten bij het lezen, oude schermen laten staan tot de nieuwe bewezen is.
2. **Notatie-verschil.** De app schrijft `22x33x40` (alle landingsvelden), PDN
   schrijft `22x40`, en soms met tussenvelden. Er zijn ook ringslagen met twee
   gelijkwaardige paden (zie 2.2). De omzetter moet daar tegen kunnen.
3. **FEN zonder bereiken.** `parseFen` leest `31,32,...` maar geen `31-50`, terwijl
   PDN-bestanden dat vaak gebruiken. Kleine aanpassing, maar hij moet erin.
4. **Alles in één browser.** Eén apparaat = één database; een leeggemaakte browser
   (bijvoorbeeld door Safari) is verlies zonder back-up. Met partijen (duizenden,
   met varianten en tekst) en een index op elke stand wordt dat gevoeliger en
   groter; haalbaar in IndexedDB, maar het vraagt een bewust ontwerp.
5. **Hosting voor meerdere gebruikers** (uit het plan) botst met de huidige
   opzet zonder server. Niet nu beslissen; de gegevens zo houden dat
   export/import per onderdeel blijft werken.
6. **Werk dat al onderweg is en overlapt.** Het plan "oplossingen uit een foto
   meesturen" (in `CLAUDE.md`, nog niet gebouwd) bevat dezelfde zetten-omzetter
   als de PDN-lezer. Bouw één omzetter voor beide, niet twee.
7. **Twee printroutes per blad** (Word en voorbeeld) verdubbelt het werk per nieuw
   bladtype. Voorstel: filmblad eerst alleen als Word.
8. **Bron en rechten.** `foto` in een stand en de trainingsdata zijn uit boeken
   (auteursrecht, staat buiten GitHub). Voor partijen/openingen zijn er nog geen
   velden voor toernooi, spelers, datum, uitslag, link. Voor een gedeelde database
   moet daar eerst over gesproken worden (het plan zegt dat ook).
9. **Testen.** Bijna een derde van de tests (54 van 152) vraagt een browser. Voor het inlezen van
   honderden partijen is een Node-test handiger; de regelengine en het bord
   draaien al zonder browser.
10. **Wisselende cache-nummers.** Elke wijziging op de live site vraagt dat de
    versiecode overal wordt opgehoogd (zie "Cache-busting" in `CLAUDE.md`), dus
    veel bestanden per stap. Bekend en beheersbaar.
11. **Regelengine niet wijzigen** (afspraak): alles wat hierboven nieuw is, kan
    ernaast gebouwd worden. Alleen `fen.js` moet iets kunnen (bereiken).
12. **Lange `CLAUDE.md`.** Bijna 700 regels en elke sessie gelezen; het deel over
    fotoherkenning is het grootste. Zie vraag 5.

## 5. Correcties op `CLAUDE.md`

Alles wat in het plan-bestand als **[CONTROLEER]** stond, en wat ik ernaast vond.
Alles is verwerkt in de nieuwe sectie "Uitbreiding: dam-toolkit" in `CLAUDE.md`.

| Punt in het plan | Bevinding |
|---|---|
| Regelvariant Nederlands/internationaal, consequent? | **Ja**, overal 10x10 met 50 velden. Fries dammen wordt **niet** ondersteund. |
| Veldnummering 1-50, wit van 50 naar 1 | **Klopt** (`board.js`): zwart 1-20, wit 31-50, wit speelt naar lagere nummers. |
| Notatie `32-28`, `28x19`; meerdere slagen | Gewone zet `32-28` klopt. Een meerslag schrijft de code als `28x19x10` met **alle landingsvelden** (`moveToNotation`); PDN gebruikt meestal alleen begin en einde. Beide moeten gelezen kunnen worden. |
| Zetnummering per paar | **Klopt** (`plyMoveNumber`); bij zwart-begint komt "12. ... 33-28". |
| Openstaand: hoe is de database opgezet? | Stand + oplossing als platte lijst, zie 2.3. **Geen boom.** |
| Openstaand: stand van `damscan/` | Zie 2.4. |

Overige correcties die ik in `CLAUDE.md` aantrof en heb aangepast:

- `#/backup` bestaat niet als route. Back-up en trainingsexport staan op
  `#/instellingen/backup` (4 plekken aangepast). `#/bulk` en `#/bulk-diagram`
  stonden niet in de routelijst en zijn toegevoegd.
- De nummering "Fase 1-3" van het herkenningsplan verwart met de nieuwe fases van
  de uitbreiding. De nieuwe heten in `CLAUDE.md` "Uitbreiding, fase 1-4".

Wijzigingen aan `CLAUDE.md` in één lijst:

1. Nieuwe sectie "Uitbreiding: dam-toolkit" toegevoegd (uit het plan-bestand, met
   de uitkomsten van deze inventarisatie).
2. Werkafspraken uitgebreid met de afspraken uit het plan (eerst plannen, geen
   damkennis verzinnen, bestaande gegevens heilig, testen met echte voorbeelden,
   geen zware afhankelijkheden).
3. `#/backup` -> `#/instellingen/backup` (4 plekken), routelijst aangevuld.

Niet aangepast: `README.md`. Die is verouderd (noemt "Fase 1", 89%/85%
herkenning, "nog niet gebouwd: geavanceerd zoeken"), maar is niet in de opdracht
genoemd.

## 6. Vragen aan de gebruiker

Elke vraag met een voorstel.

1. **Wat is het eerst nodig: partijen met de filmopdracht, of studies?** Voorstel:
   zoals in het plan, eerst partijen. (Studies zijn technisch het dichtst bij wat er
   al is en komen dan snel daarna.)
2. **Kun je 5 tot 10 echte PDN-partijen aanleveren (liefst met commentaar en
   varianten) en 3 studies met zijvarianten?** Voorstel: zet ze in
   `testdata/pdn/` en `testdata/studies/`. Die mappen blijven buiten GitHub; ik
   maak daarnaast een paar kleine zelfgemaakte voorbeelden die wel in de tests
   mogen.
3. **Moet zoeken op stand ook gedraaide of gespiegelde standen vinden?** Wat telt in
   het dammen als dezelfde stand? Voorstel: eerst alleen exact; de huidige
   "gespiegeld"-melding blijft zoals hij is.
4. **Blijft de app voor één gebruiker op eigen apparaten, tot fase 4 klaar is?**
   Voorstel: ja. Hosting met inlog beslissen we daarna, met de gegevens al zo dat
   ze per onderdeel uit- en ingevoerd kunnen worden.
5. **Mag ik de fotoherkenningsgeschiedenis uit `CLAUDE.md` verplaatsen naar een
   apart bestand** (bijvoorbeeld `docs/HERKENNING.md`), zodat `CLAUDE.md`
   kort blijft? Voorstel: ja, na fase 1, niet nu. Nu is alleen samengevoegd.
6. **Welke velden horen bij een partij?** Voorstel: wit, zwart, datum, toernooi,
   ronde, uitslag, bron/link, plus vrije notities. Dit is jouw expertise.
7. **De filmopdracht:** blijft "6 momenten" de standaard, en zijn de zetnummers voor
   de speler zichtbaar in de notatie (ja, volgens het plan)? Voorstel: alles
   zoals in het plan; aantal is instelbaar.
8. **De oplossingen-uit-foto-wens** die al in `CLAUDE.md` staat: eerst dat afmaken,
   of wachten tot de PDN-omzetter er is en die dan gebruiken? Voorstel: wachten en
   één omzetter bouwen voor beide.

## 7. Voorstel voor fase 1 (de kern)

Dit is een voorstel, geen uitvoering. Elke stap eindigt met een lokale commit;
jij pusht.

**Stap 0 — voorbereiding (jij).** Maak een back-up via `#/instellingen/backup` en
bewaar hem buiten de projectmap. Lever de voorbeeldpartijen en studies aan (vraag 2).
*Klaar als:* het back-upbestand staat op je schijf en de map met voorbeelden is gevuld.

**Stap 1 — boom-model, zonder schermen.** Nieuw bestand `src/core/zettenboom.js`:
een knoop heeft een zet, commentaar, tekens (!, ?) en kinderen (het eerste kind is
de hoofdlijn). Functies: zet toevoegen (gecontroleerd door de regelengine, een
onmogelijke zet wordt gemarkeerd), oude `zetten`+`zijvarianten` omzetten naar een
boom en terug.
*Klaar als:* elke bestaande stand uit een back-up omgezet wordt en de tekst
(`formatZettenMetVarianten`) daarna **letterlijk hetzelfde** is; nieuwe tests groen.

**Stap 2 — zet uit tekst lezen (PDN).** Nieuw bestand (bijvoorbeeld
`src/core/pdn.js`), gebaseerd op `tools/meetOplossingen.mjs`: leest `32-28`,
`28x19`, `28x19x10`, ringslag met twee paden, en `[FEN "..."]` met bereiken;
zoekt de zet uit de toegestane zetten. Kleine aanpassing aan `fen.js` (bereiken).
*Klaar als:* de voorbeeldpartijen volledig doorgespeeld worden, een expres
verkeerde zet wordt gemarkeerd met zetnummer, en het aantal partijverlopen op
diepte 7 blijft gelijk aan de referentie.

**Stap 3 — stand-index.** Een canonieke sleutel per stand (bezette velden + wie aan
zet) en een nieuw archief (schema 3, alleen toevoegen); een functie om alle
posities van een boom te indexeren en op te zoeken. Standen ongemoeid.
*Klaar als:* zoeken op een stand de bestaande standen vindt en twee verschillende
zettenvolgordes naar dezelfde stand dezelfde sleutel geven (transpositie-test).

**Stap 4 — boom-viewer.** Een nieuw scherm dat door een boom stapt, met commentaar
en aanklikbare varianten, gebouwd op het bestaande bord en de bestaande knoppen.
De oude speler blijft staan.
*Klaar als:* getest in de browser op de voorbeeldpartijen en op drie bestaande
standen met zijvarianten, die er hetzelfde uitzien als in de oude speler.

**Stap 5 — oude speler vervangen (alleen na akkoord).** Pas als stap 4 in de
praktijk goed werkt, vervangt de nieuwe viewer de oude speler op
`#/stand/:id`; de invoer blijft dan nog even.
*Klaar als:* geen standdetailpagina meer op de oude speler steunt en alle bestaande
standen nog gewoon openen.

**Migratie:** schema 3 voegt alleen archieven toe. Bestaande standen worden niet
omgezet in de database; de boom wordt bij het lezen afgeleid. Terugdraaien is dus
altijd mogelijk.
