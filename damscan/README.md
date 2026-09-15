# Veldclassificatie voor damdiagram-scanner

Vervangt stap 1a, het arceringsfilter, stap 1b en stap 2 door **één beslissing per veld**.
Rasterdetectie en perspectiefcorrectie blijven zoals ze zijn.

## Waarom dit anders is

| nu | hier |
|---|---|
| k-means over alle 50 std-waarden | elk veld los beoordeeld |
| globaal lichtvlak op "alle lege velden" | midden vergeleken met de rand van hetzelfde veld |
| bezetting eerst, dan kleur | leeg/wit/zwart in één keer |
| 6 handmatige constanten | drempels uit je data |
| vaste drempel over alle boeken | elk veld afgezet tegen het eigen diagram |
| betrouwbaarheid 0.75/0.6 | kans uit het model |

Twee dingen tegelijk:

**Geen foutpropagatie.** Een verkeerd als leeg geclassificeerd veld kan de
kleurbepaling van andere velden niet meer verpesten, want er is geen gedeelde
lichtfit meer.

**Wel stijlaanpassing.** Elk kenmerk wordt uitgedrukt ten opzichte van de andere
49 velden van hetzelfde diagram. "Is dit veld donker vergeleken met dit bord"
betekent in elk boek hetzelfde; "is dit veld donker" niet, want het ene boek
drukt het speelveld licht en het andere donker. Dat is hetzelfde voordeel dat de
oude k-means had, maar zonder dat één fout veld de rest meesleept.

`train.js` zet drie varianten tegen elkaar — alleen absoluut, alleen relatief, of
beide — en kiest degene die het beste scoort op een stijl die het model nooit
heeft gezien. Welke dat is hangt van je diagrammen af, dus dat wordt gemeten en
niet geraden.

## Stap 1 — crops dumpen

Je rasterstap heeft de 50 uitsnedes al. Schrijf ze weg als PNG:

```
crops/foto01/01.png ... 50.png
crops/foto02/...
```

In de browser, per veld (`canvas` is je uitgesneden veld):

```js
const a = document.createElement('a');
a.download = `${String(square).padStart(2, '0')}.png`;
a.href = canvas.toDataURL('image/png');
a.click();
```

Beter is een knop "dump crops" die een zip maakt, of in Node de crops direct
naar schijf schrijven. Grootte maakt niet uit zolang die per foto consistent is;
32–64 px is ruim genoeg.

## Stap 2 — labelen door te corrigeren

Laat je **huidige** pipeline de stand uitspugen in dit formaat en corrigeer de
fouten met de hand. Dat is vijf aanpassingen per foto in plaats van vijftig
invoeren.

```
diag01 @kraakman  W: 31-35,37,38,40  Z: 12,14,16-20
diag02 @hoogland  W: 28,33,39        Z: -
```

De `@tag` is de stijl: het boek of tijdschrift waar het diagram uit komt. Die tag
is geen administratie maar de kern van de meting — zie stap 3. Verzin één naam
per bron en gebruik die consequent.

Alles wat niet genoemd wordt is leeg. `formatLabelLine()` in `labels.js` maakt
zo'n regel voor je.

## Stap 3 — trainen en meten

```bash
npm install pngjs
node train.js labels.txt crops weights.json
```

`train.js` traint niet zomaar, het meet eerst. Je krijgt twee cijfers:

**Onbekende stijl.** Elk boek wordt beoordeeld door een model dat dat boek nooit
heeft gezien. Dit is het cijfer dat telt, want het voorspelt wat er gebeurt als
je morgen een diagram uit een nieuw tijdschrift scant.

**Bekende stijl, onbekend diagram.** Hetzelfde, maar nu mogen andere diagrammen
uit hetzelfde boek wel meetrainen. Dit cijfer is altijd hoger.

Het verschil tussen die twee is de maat voor hoe stijlafhankelijk je classifier
is. Staat de eerste op 92% en de tweede op 99%, dan is je probleem niet de
classificatie maar de generalisatie, en helpt het toevoegen van diagrammen uit
nóg een nieuw boek meer dan welke codewijziging ook.

Verder krijg je per meting een confusiematrix, precisie en recall per klasse, een
uitsplitsing per stijl, het aantal foutloze borden, een lijst van fouten
gesorteerd op zelfverzekerdheid, en een tabel die laat zien welke drempel voor de
gele rand hoeveel fouten vangt.

Die foutenlijst is het echte gereedschap. "Zelfverzekerd én fout" bovenaan wijst
je precies naar de gevallen waar de features tekortschieten, en de featurewaarden
staan erachter zodat je ziet welke.

Om een wijziging te toetsen op foto's die niet in de trainingsset zaten:

```bash
node evaluate.js holdout.txt crops weights.json
```

## Stap 4 — inbouwen

```js
const { createClassifier } = require('./classify');
const clf = createClassifier(require('./weights.json'));

const { squares, warnings } = clf.classifyBoard(crops);
// squares[i] = { square, label, confidence, probs, flagged }
```

`confidence` is de kans uit het model, dus direct bruikbaar voor je gele rand.
Zet `FLAG_BELOW` in `classify.js` op de waarde die `train.js` adviseert: kies de
drempel waarbij je de meeste fouten vangt zonder dat je halve bord geel wordt.

`warnings` bevat de telcontrole (max 20 per kleur) en de promotievelden. Let op:
wit op 1-5 is niet onmogelijk maar juist de plek waar **dammen** staan. Omdat je
dammen bewust niet herkent, is dat geen foutsignaal — daarom staat het als
`type: 'promotion'` en wordt er niets gecorrigeerd.

## Afstellen

Bovenin `features.js` staan drie geometrische constanten die van je crop-marge
afhangen:

- `CENTER_R` (0.22) — straal van het middengebied
- `BG_BAND` (0.44) — de buitenste band die als bord-referentie geldt
- `RING_R` (0.36) — waar de schijfrand wordt verwacht

Als je crops strak om het veld zitten en de schijven vrijwel het hele veld
vullen, moet `BG_BAND` omhoog en `RING_R` mee. Controleer met één crop per stijl:
de achtergrondband mag geen schijf bevatten. Dit zijn de enige getallen die je zelf
kiest; de rest komt uit de data.

## Als de onbekende-stijl-score te laag blijft

Dan is het geen drempelprobleem maar een informatieprobleem, en train je een klein
CNN op de crops zelf (32×32 grijswaarden, drie klassen). De evalset en het
labelformaat uit deze map gebruik je dan ongewijzigd — dat is precies waarom je
die eerst bouwt.

Bij gedrukte diagrammen heb je daarbij een voordeel dat je bij foto's van een
echt bord niet zou hebben: **je kunt trainingsdata genereren**. Een diagramveld is
lijnwerk met een handvol parameters — arceringshoek, lijnafstand, lijndikte,
papiertint, schijfstraal, dikte van de cirkelrand, gevulde of open schijf — plus
scan-effecten als onscherpte, ruis, scheefstand en jpeg-artefacten. Daar kun je
tienduizenden gelabelde velden uit rollen die veel meer stijlen beslaan dan jij
ooit uit boeken bij elkaar scant. `make-fake-data.js` is daar een minimaal
voorbeeld van.

Je echte gelabelde diagrammen blijven dan de meetlat; de gegenereerde data is
alleen voedsel voor het model.

## Bestanden

- `features.js` — 7 kenmerken per veld, allemaal lokaal genormaliseerd
- `model.js` — softmax-regressie, trainen en voorspellen, geen dependencies
- `labels.js` — lezen en schrijven van damnotatie
- `dataset.js` — crops + labels inladen
- `train.js` — trainen met cross-validatie en rapportage
- `evaluate.js` — bestaande gewichten scoren op een labelset
- `report.js` — de rapportage
- `classify.js` — runtime, dit gebruikt je app
- `make-fake-data.js` — synthetische diagrammen in vier stijlen, om de pipeline te proberen
