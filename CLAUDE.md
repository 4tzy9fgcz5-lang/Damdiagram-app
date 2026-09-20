# Werkafspraken

- Jan van der Star is niet-technisch. Communiceer uitsluitend in gewoon, jargonvrij
  Nederlands. Elke vraag gaat vergezeld van een concreet voorstel.
- Ik push nooit zelf naar GitHub. Ik commit lokaal (na elk afgerond stapje); Jan
  pusht altijd zelf via GitHub Desktop. "Gepusht" in mijn eigen verslagen betekent
  dus alleen "lokaal gecommit", tenzij Jan zelf bevestigt dat hij gepusht heeft.
- Werk in kleine, zelfstandig te testen stappen. Test een UI-wijziging altijd
  daadwerkelijk in de browser (zie "Testen tijdens ontwikkeling" hieronder) voor je
  meldt dat iets werkt.

# Status en vervolgstappen (bijgewerkt 2026-09-21)

Dit is een groeiende Nederlandse dam-app (werknaam "Dam-database", eerder
"Damstencil"): standen verzamelen (handmatig, of via een foto van een boekdiagram),
oplossingen intikken door op het bord te klikken, en stencils samenstellen die als
Word-document worden geëxporteerd. Alles lokaal in de browser (IndexedDB), geen
server, geen build-stap.

## Architectuur — kort overzicht

- Routing/render in `src/ui/app.js`: `#/nieuw` (invoer/correctie), `#/foto`
  (foto-import), `#/database` (overzicht), `#/stand/:id` (detailpagina, alleen-
  lezen), `#/stencils`/`#/stencil/:id`, `#/backup`, `#/import`.
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

## Veldherkenning: twee classifiers naast elkaar

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
- **Bulk-import (gemeten 2026-09-21 op volle resolutie, 107 kandidaten uit 33
  paginafoto's).** Geen 8x8 in deze route, maar `detectMultiBoard.js` levert de
  buitenrand mét zwarte bordrand: het 10x10-raster lag daardoor tot een halve
  veldbreedte naast de velden (`refineGrid` corrigeert maar ±1,2% verschuiving/±3%
  schaal, dat is te weinig voor een rand van 5-13%). Nu snijdt
  `bulkImportView.js` per gevonden diagram de rand weg met
  `tightenCornersOnDrawable()` (`detectBoard.js`; dezelfde `stripBorderToPlayfield`,
  dus max. 8% per kant, en het oorspronkelijke kader blijft alleen staan als dat
  >15% beter bij het patroon past). Op de meetplaatjes staat het raster daarna in
  vrijwel alle gevallen op de velden. Let op: de detectie in de app draait op 1600px
  (`detectMultiBoard.js`, `WORKING_SIZE`), NIET op 700px zoals bij een losse foto —
  op 700px lijken tekstblokken op diagrammen. Bekende rest: tekstblokken/foto's
  worden soms als "diagram" gevonden (Jan verwijdert die in het overzicht), en een
  foto waarop het bord maar ~25% van het beeld beslaat (IMG_1056) geeft in de bulk-
  detectie kleine onzin-kaders. Herkenning op de oranje/sepia stijl (pagina 855108d9)
  is zwak bij beide herkenners (oud 22, nieuw 17 stukken, oneens over 27 van de 50
  velden) — dat is classificatie, geen geometrie. Meetprogramma:
  `tools/meetBulkImport.mjs`.
- **Damlogica uit.** `classifyWithComparison()` past de stand niet meer aan
  (`enforceRules` wordt niet meer aangeroepen) en markeert geen extra velden op
  basis van balans/"dam?". Alleen de waarschuwingen "geen enkel stuk herkend" en
  ">20 van één kleur" blijven. De code in `plausibility.js` (+ tests) staat er nog,
  voor als we het later slimmer willen doen.
- **Oude herkenning weer de standaard** (hoeken-/resultatenscherm). Meting met
  de echte app-code op de 6 gelabelde foto's uit `testdata/testfotos/` (fouten
  oud/nieuw): 0127 2/6, 0497 29/18 (hoeken hier onbruikbaar), 0533 3/7, 0616
  11/0, 532 0/10, aa9874c2 0/6 — totaal 45 vs 47, maar oud wint op 4 van 6.
  Ze falen op VERSCHILLENDE plekken: de oude ziet op 0616 alle witte schijven
  over het hoofd, de nieuwe mist er op 532 juist. "Als één van beide een schijf
  ziet, neem die" gaf 41 fouten en op één foto een slechter resultaat — niet
  overgenomen. Het gele onenigheid-randje blijft het vangnet.
- **Hertraining op Jans export van 140 diagrammen (2026-09-21) — geen winst.**
  Werkwijze (vanuit de project-root, dit overschrijft niets als je de export in een
  aparte map uitpakt): (1) `#/backup` → "Trainingsmateriaal" → ZIP; (2) uitpakken in
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
   Zit nu op `#/backup`, kaart "Trainingsmateriaal voor de fotoherkenning" —
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
