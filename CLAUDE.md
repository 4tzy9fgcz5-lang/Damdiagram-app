# Werkafspraken

- Jan van der Star is niet-technisch. Communiceer uitsluitend in gewoon, jargonvrij
  Nederlands. Elke vraag gaat vergezeld van een concreet voorstel.
- Ik push nooit zelf naar GitHub. Ik commit lokaal (na elk afgerond stapje); Jan
  pusht altijd zelf via GitHub Desktop. "Gepusht" in mijn eigen verslagen betekent
  dus alleen "lokaal gecommit", tenzij Jan zelf bevestigt dat hij gepusht heeft.
- Werk in kleine, zelfstandig te testen stappen. Test een UI-wijziging altijd
  daadwerkelijk in de browser (zie "Testen tijdens ontwikkeling" hieronder) voor je
  meldt dat iets werkt.

# Status en vervolgstappen (bijgewerkt 2026-09-18)

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
  `fetch()` in `photoImportView.js` (`WEIGHTS_VERSION`-constante — **na elke
  hertraining met de hand ophogen**, dit valt buiten het cache-bust-script
  hieronder).
- Schakelaar zit in `src/ui/photoImportView.js` (hoeken-scherm én resultaten-
  scherm, altijd gesynchroniseerd). Wisselen op het resultatenscherm herclassificeert
  dezelfde, al rechtgetrokken foto opnieuw — geen hoeken opnieuw nodig.
- **Sinds 2026-09-16: automatische vergelijking, ongeacht welke classifier
  gekozen is.** `classifyWithComparison()` in `photoImportView.js` laat bij elke
  herkenning ook de andere classifier op de achtergrond meekijken (puur ter
  vergelijking, de gekozen classifier blijft bepalend voor de getoonde stand) en
  markeert velden waar ze een ander stuk zien als onzeker (`disagreementFields`,
  samengevoegd met de eigen onzeker-velden van de gekozen classifier) — dit bleek
  uit de vergelijking veruit de grootste resterende foutenbron te dekken, groter
  dan wat elke classifier voor zichzelf al als onzeker herkent.
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
   `src/ui/photoImportView.js` met de hand ophogen.
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
