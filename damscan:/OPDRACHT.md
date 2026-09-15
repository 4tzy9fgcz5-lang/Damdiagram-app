# Opdracht voor Claude Code

Deze map bevat een vervangende veldclassificatie voor de damstand-scanner.
Voer de stappen hieronder **één voor één** uit. Stop na elke stap en wacht op
akkoord. Niet vooruitwerken.

Algemene regels voor deze klus:

- Raak de rasterdetectie en de perspectiefcorrectie niet aan. Die werken.
- Verwijder de bestaande classificatie niet. Die blijft staan tot uit de meting
  blijkt dat de nieuwe beter is.
- Geen opschoning, geen refactor, geen naamswijzigingen buiten wat hier staat.
- Installeer alleen `pngjs`, en alleen als dev-dependency.

---

## Stap 1 — crops wegschrijven

Zoek in de bestaande code de plek waar een foto in 50 veld-uitsnedes wordt
verdeeld, vlak voordat de classificatie begint.

Bouw daar een manier om die 50 uitsnedes als PNG weg te schrijven naar:

```
crops/<fotonaam>/01.png ... 50.png
```

Index 1 = veld 1, in dezelfde nummering die de app al gebruikt. Maak het
bereikbaar zonder dat de gebruiker code hoeft aan te passen: een knop "dump
crops" in de editor, of een script dat een map met foto's verwerkt — kies wat bij
deze codebase past en leg uit hoe het aangeroepen wordt.

**Stoppunt:** laat zien welke opdracht of knop de gebruiker moet gebruiken, en
bevestig dat er voor één foto 50 bestanden op de juiste plek staan.

---

## Stap 2 — beginstand voor het labelen

De invoer zijn diagrammen uit damboeken, elk met een eigen drukstijl. De
gebruiker gaat 15 à 20 diagrammen labelen, maar wil niet 50 velden per diagram
intypen. Laat daarom de **bestaande** classificatie zijn uitkomst schrijven in
het formaat van `labels.js` (zie `formatLabelLine`), één regel per foto:

```
diag01 @kraakman  W: 31-35,37,38,40  Z: 12,14,16-20
```

De `@tag` is de bron (boek of tijdschrift) en wordt gebruikt om per stijl te
kunnen meten. Vul hem in als de bron af te leiden is uit de bestandsnaam of map;
zo niet, laat hem leeg en vraag de gebruiker hem aan te vullen.

Voeg die regels samen in `labels.txt`. De gebruiker corrigeert daarna met de hand
de velden die fout staan.

Maak het corrigeren mogelijk zonder telwerk: schrijf per foto ook een
controlebeeld weg naar `check/<diagramnaam>.png`. Dat is het rechtgetrokken diagram met
over elk speelveld het veldnummer, en een markering van wat de classificatie
daar denkt te zien. De gebruiker legt dat beeld naast `labels.txt` en ziet in één
oogopslag welke nummers niet kloppen.

**Stoppunt:** lever `labels.txt` op met een regel per verwerkte foto, plus de
controlebeelden, en leg in twee zinnen uit hoe de gebruiker een fout veld
corrigeert.

---

## Stap 3 — meten

Controleer eerst `BG_BAND`, `CENTER_R` en `RING_R` bovenin `features.js`. Dat
zijn fracties van de veldbreedte en ze moeten passen bij de crop-marge van deze
app. Kijk naar een echte crop per stijl: de buitenste band (`BG_BAND`) moet bord zijn, ook
als er een schijf op het veld staat. Stel bij indien nodig en zeg wat je hebt
aangepast en waarom.

Draai dan:

```
node damscan/train.js labels.txt crops damscan/weights.json
```

Het rapport geeft twee cijfers: één voor een stijl die het model kent en één
voor een stijl die het nooit heeft gezien. Dat tweede cijfer is het cijfer dat
telt. Als het veel lager ligt, meld dat expliciet.

**Stoppunt:** toon de volledige uitvoer. Wijzig nog niets aan de app.

---

## Stap 4 — inbouwen naast het oude

Bouw de nieuwe classifier in via `damscan/classify.js`, achter een schakelaar
zodat de oude en de nieuwe naast elkaar kunnen draaien op dezelfde foto. Gebruik
`confidence` uit het model voor de gele rand in de editor, met de drempel die
`train.js` in de drempeltabel aanraadt.

**Stoppunt:** laat op dezelfde foto zien wat de oude en wat de nieuwe uitkomst
is, en hoeveel velden elk fout heeft ten opzichte van `labels.txt`.

Pas als de nieuwe aantoonbaar beter is, en na akkoord van de gebruiker, mag de
oude classificatie eruit.

---

## Als iets niet lukt

Verzin geen omweg en pas de bestanden in `damscan/` niet aan om een foutmelding
te omzeilen. Meld wat er misgaat en vraag hoe verder.
