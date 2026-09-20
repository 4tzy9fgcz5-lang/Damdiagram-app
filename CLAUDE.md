# Werkafspraken

- Jan van der Star is niet-technisch. Communiceer uitsluitend in gewoon, jargonvrij
  Nederlands. Elke vraag gaat vergezeld van een concreet voorstel.
- Ik push nooit zelf naar GitHub. Ik commit lokaal (na elk afgerond stapje); Jan
  pusht altijd zelf via GitHub Desktop. "Gepusht" in mijn eigen verslagen betekent
  dus alleen "lokaal gecommit", tenzij Jan zelf bevestigt dat hij gepusht heeft.
- Werk in kleine, zelfstandig te testen stappen. Test een UI-wijziging altijd
  daadwerkelijk in de browser (zie "Testen tijdens ontwikkeling" hieronder) voor je
  meldt dat iets werkt.

# Status en vervolgstappen (bijgewerkt 2026-09-20)

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
- **Nieuw** (sinds 2026-09-15, nu standaard): `src/recognition/newFeatures.js` /
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

### Herkenning-verbeterplan (2026-09-20)

Extern plan van Jan (`~/Downloads/damdiagram_verbeterplan.md`, niet in git). Ik
heb het gereviewd tegen de bestaande code; onderstaande volgorde is de
bijgestelde versie (niet de volgorde uit het originele plan):

- **Fase 0 — klaar (2026-09-20):** de damregel-controles die de nieuwe
  classifier al berekende (te veel stukken van één kleur, gewone schijf op de
  achterste rij) werden weggegooid; die worden nu getoond op het
  resultatenscherm van de fotoherkenning én tellen mee als onzeker veld. Zie
  `sanityCheck()` in `newClassify.js`, gebruikt in `diagramCaptureView.js`.
- **Fase 1 — klaar (2026-09-20), twee delen, na twee mislukte pogingen
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
     nu weg via een projectieprofiel: per rij/kolom de Sobel-randsterkte
     optellen over de HELE breedte/hoogte, en daarin de celbreedte +
     startpositie zoeken die de 9 interne rasterlijnen het best laat
     samenvallen met echte randen (`findGridAxis()`). Bij gelijke score de
     voorkeur voor zo min mogelijk wegsnijden (>3% beter nodig om een kleinere
     spacing te kiezen) — anders vindt het bij een erg regelmatig schaakbord
     soms toevallig een net-te-klein raster. Tests: `tests/detectBoard.test.js`.
  Beide draaien automatisch bij elke herkenning (ook bulk-import), zichtbaar/
  toegepast vóór classificatie. Geverifieerd met Jans eigen testfoto's in
  `testdata/` (niet alleen synthetische plaatjes) — zie de twee mislukte
  tussenstappen hieronder, die zijn precies daarom verworpen. Bewust NIET
  gedaan: "aanpak B" uit het plan (voorspelde vs. gecorrigeerde hoekpunten
  loggen voor een toekomstig hoek-model) — blijft openstaan.
  - *Mislukte poging 1:* per-rij/kolom-**variantie** i.p.v. randsterkte-som —
    een rand met wat drukstructuur/scanruis werd daarmee soms al als
    "patroon" herkend, dus bleef er nog een zichtbare rand over. Dit was de
    eerste versie die Jan testte en terecht afkeurde ("nog steeds rand
    meegenomen").
  - *Mislukte poging 2:* `gridRefine.js`'s eigen aanpak (kleine translatie/
    schaal/rotatie, score = randsterkte-som) met een veel breder zoekbereik
    toepassen op de ONgestripte hoeken, in de hoop dat één brede zoektocht
    alles in één keer zou oplossen — liep vast op periodieke aliasing (een
    verkeerd geschaald/verschoven raster kan bij een herhalend
    schaakbordpatroon toevallig ook goed scoren). Vandaar de two-stage aanpak
    hierboven: eerst grof met een projectieprofiel (ongevoelig voor die
    aliasing omdat het over de hele rij/kolom optelt), dan pas de bestaande,
    kleine `gridRefine`-correctie als laatste polijststap.
  - **Bekende resterende beperking:** op sommige foto's blijft aan één kant
    (meestal rechts/onder) nog een dun streepje rand over, ook na beide
    correcties — geen volledige oplossing, wel een forse verbetering t.o.v.
    "de hele rand werd als bord gezien". Niet verder achtervolgd: kans op
    overfitten op deze paar testfoto's, en de rest van de pijplijn (fase 0/2/3)
    kan hier prima mee leven.
  - `testdata/IMG_532.jpeg` (gitignored, alleen lokaal) is de exacte foto
    waarmee Jan dit meldde — een goede "moeilijke" foto om een volgende keer
    weer tegenaan te testen bij wijzigingen aan `detectBoard.js`/
    `gridRefine.js`. `testdata/testfotos/` had 'm al staan (identiek bestand,
    ander diagram dan waar de map oorspronkelijk voor bedoeld was).
- **Fase 2 — daarna:** een volwaardige plausibiliteitslaag met damlogica,
  bovenop wat Fase 0 al doet. **Belangrijk, bevestigd door Jan:** in zijn
  opgaven-database is het aantal schijven wit/zwart in ~95% van de gevallen
  precies gelijk; de enige normale afwijking is een verschil van exact 1
  schijf. Dat mag dus direct als automatische regel (verhoog verdachtheid bij
  een groter verschil), geen aparte validatie op de eigen dataset nodig. Géén
  aparte confidence voor "dam" toevoegen — dammen worden bewust nooit
  automatisch herkend (zie classify.js), dus deze laag werkt met alleen
  leeg/wit/zwart.
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
