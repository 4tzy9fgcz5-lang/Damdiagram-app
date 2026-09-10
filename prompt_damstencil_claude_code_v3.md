# Opdracht: Damstencil-app (foto → stand → database → A4-opgavestencil in Word)

## Over mij en hoe je met mij werkt
- Ik ben een serieuze dammer (internationaal dammen, 10×10). Ik maak opgavestencils voor clubleden en damvrienden: A4-vellen met maximaal 12 diagrammen, plus een oplossingenblad.
- **Ik heb geen technische ervaring.** Jij doet al het technische werk. Als ik zelf iets moet doen (een account aanmaken, ergens op klikken), leg je dat stap voor stap uit in eenvoudig Nederlands, zonder vakjargon. Ik typ zelf geen code en geen terminalcommando's.
- Stel je vragen aan mij in gewone taal, met een voorstel erbij. Dus niet "welk framework?", maar "ik stel X voor omdat Y, akkoord?".

## Het probleem
Leuke standen vind ik in damboeken en online. Nu moet ik elke stand opzetten in de Oerterp Diagram Maker, het plaatje naar Word kopiëren en daar kolom- en regelafstanden handmatig goedzetten. Dat kost veel tijd. Bovendien raak ik standen kwijt: ik heb geen overzicht van wat ik al heb verzameld en welke opgaven ik al eens heb gebruikt.

## Doel
Een app waarmee ik:
1. Met mijn telefoon een foto maak van een diagram in een boek, of een screenshot kies van een online bord.
2. De herkende stand snel controleer en corrigeer.
3. De stand opsla in mijn eigen **database** met oplossing, bron, speelsysteem en type.
4. Uit die database stencils samenstel, de teksten aanpas en een Word-bestand download met opgaven en oplossingenblad.

## Vastgestelde keuzes
- **Webapp in de browser.** Hij werkt op telefoon én laptop, zonder dat ik iets hoef te installeren.
- **Gratis en zonder betaalde diensten of API's.** Alle beeldherkenning gebeurt op het apparaat zelf, in de browser. Foto's worden nergens naartoe gestuurd.
- **De database staat in de browser zelf** (bijvoorbeeld IndexedDB). Er is geen eigen server nodig.
- **Gratis hosting**, bijvoorbeeld via GitHub Pages of Netlify, zodat ik de app via een link op mijn telefoon open. Jij regelt de publicatie en ik volg alleen klikinstructies. Kies de optie die voor mij het eenvoudigst te onderhouden is, en leg uit hoe updates online komen.
- **Installeerbaar op het beginscherm (PWA)**, zodat de app ook zonder internet werkt. Op iPhones is dit extra belangrijk: Safari kan opgeslagen gegevens van websites wissen die een tijd niet gebruikt zijn. Geïnstalleerde apps op het beginscherm hebben daar geen last van. Controleer of dit nog klopt en leg mij uit hoe ik de app installeer.

## Domeinkennis (niet van afwijken)
- Bord 10×10. Alleen de 50 donkere velden worden gebruikt, genummerd 1–50 volgens de standaardnotatie. Het veld linksboven is licht. Veld 1 is het eerste donkere veld in de bovenste rij (tweede kolom), veld 5 zit rechtsboven. Veld 46 is het donkere hoekveld linksonder, veld 50 zit rechtsonder. Wit speelt van onder naar boven.
- Stukken: witte schijf, zwarte schijf, witte dam, zwarte dam.
- Gebruik de PDN/FEN-notatie voor dammen als interne standaard en voor import/export, bijvoorbeeld `W:W31,32,33,K45:B1,2,3,K7`. De eerste letter geeft aan wie aan zet is, `K` betekent dam. Dit is dezelfde notatie als in de Oerterp Diagram Maker.
- Oplossingen staan in de gewone damnotatie. Een zet is een streepje, een slag een x, bijvoorbeeld `1. 33-28 22x33 2. 38x29 ...`. Dammers schrijven dit niet altijd even consequent, dus accepteer vrije tekst.
- Onmogelijke standen: een witte schijf op veld 1–5, een zwarte schijf op veld 46–50, of meer dan 20 stukken per kleur. Geef hier een waarschuwing bij, maar blokkeer niets.

## Diagramstijl (belangrijk)
Ik wil precies de stijl van de Oerterp Diagram Maker van de KNDB (https://toernooibase.kndb.nl/applet/oerterpapplet2.0/get/diagram.php). In de map `referentie/` staan twee voorbeelden op 300×300 pixels:
- `leeg_bord.png`: een leeg bord;
- `voorbeeldstand.png`: stand `W:W13,15,33:B1,5,30` (wit op 13, 15, 33; zwart op 1, 5, 30).

Gemeten kenmerken bij 300×300 px:
- De donkere velden zijn lichtgrijs `#C4C4C4`, de lichte velden wit `#FFFFFF`.
- Dubbele rand: buiten een zwarte lijn van ca. 3 px, dan ca. 2 px wit, dan een dunne grijze lijn van 1 px (ca. `#666666`). De velden beginnen op ca. 6 px van de buitenkant en zijn ca. 28,9 px groot.
- De schijven zijn in lichte perspectief getekend: een platte schijf van schuin boven gezien, met een zichtbare bovenkant (ellips) en een zijrand. Een witte schijf is wit met een zwarte omtrek. Een zwarte schijf is zwart met lichte lijntjes die bovenkant en zijrand scheiden.
- Hoe dammen eruitzien staat niet in mijn voorbeelden. De Oerterp-tool heeft een adres dat een plaatje maakt vanuit een FEN: `https://toernooibase.kndb.nl/applet/oerterpapplet2.0/createdia2.php?fen=...&size=300` (in de pagina staan backslashes in het pad; probeer het met gewone slashes). Gebruik dit alleen tijdens de ontwikkeling om een handvol referentieplaatjes op te halen, onder meer met dammen. Houd het aantal verzoeken klein, want het is een clubserver. De app zelf tekent de diagrammen volledig zelfstandig.
- Teken de diagrammen als vectorafbeelding (SVG). Maak de stijl zo na dat hij naast een echt Oerterp-diagram niet opvalt.

## Functies

### A. Invoer
- Knop **"Maak foto"**: opent op de telefoon direct de camera (achtercamera).
- Knop **"Kies uit galerij"**: foto of screenshot kiezen, ook op de laptop (inclusief HEIC van iPhone).
- FEN plakken, bijvoorbeeld gekopieerd uit de Oerterp-tool of Lidraughts.
- Snelle tekstinvoer met veldnummers, bijvoorbeeld `wit 27 28 32 d45 zwart 12 13 19`. Maak de notatie vergevingsgezind: komma's of spaties, en "d" of "K" voor dam.
- Handmatig opzetten vanaf een leeg bord of de beginstand.

### B. Herkenning (foto → stand), volledig offline in de browser
- **Screenshots van online borden**, onder meer in Oerterp-stijl: het bord zoeken, het raster bepalen en per veld classificeren. Hier moet de herkenning vrijwel foutloos zijn.
- **Foto's van gedrukte diagrammen in boeken**: de hoeken van het bord automatisch vinden en het perspectief rechttrekken. Houd rekening met een scheve hoek, een gebogen pagina, schaduw, ongelijk licht en verschillende boekstijlen (gearceerde of grijze velden, verschillende damsymbolen).
- **Vangnet:** als de automatische hoekdetectie twijfelt of faalt, kan ik de vier hoeken van het bord met mijn vinger of muis verslepen, waarna de herkenning opnieuw draait.
- Classificeer alleen de 50 donkere velden: leeg / witte schijf / zwarte schijf / witte dam / zwarte dam. Gebruik liefst relatieve kenmerken (helderheid en contrast van een veld ten opzichte van lege velden op dezelfde foto) in plaats van vaste drempels, zodat het met verschillende stijlen werkt.
- Geef per veld een betrouwbaarheidsscore en markeer twijfelgevallen duidelijk in de editor.
- Je mag OpenCV.js of een vergelijkbare gratis bibliotheek gebruiken, als die lokaal wordt meegeleverd.

### C. Editor
- Groot, klikbaar bord dat ook op een telefoonscherm goed werkt. Een tik op een veld wisselt tussen leeg → wit → zwart → witte dam → zwarte dam. Daarnaast is er een palet om een stuk te kiezen.
- De rechtgetrokken foto staat naast of onder het bord, zodat ik veld voor veld kan vergelijken.
- Toon waarschuwingen bij onmogelijke standen.
- Direct onder het bord staan de database-velden (zie D), zodat ik alles in één keer invul. Alleen de stand is verplicht, de rest kan ik later aanvullen.
- Knoppen "Opslaan in database" en "Opslaan en toevoegen aan stencil".

### D. Database (mijn verzameling standen)
Elke opgeslagen stand heeft deze gegevens:

| Veld | Toelichting |
|---|---|
| Stand | FEN, verplicht |
| Aan zet | wit of zwart |
| Opdracht | korte tekstregel voor een afwijkende opdracht; leeg betekent de standaardopdracht van het stencil |
| Oplossing | vrije tekst in damnotatie, nodig voor het oplossingenblad |
| Auteur | bijvoorbeeld de componist, of de spelers bij een partijstand |
| Jaartal | |
| Publicatie | boek, tijdschrift of website, eventueel met pagina- of diagramnummer |
| Speelsysteem | tags, meerdere mogelijk. Standaardlijst: klassiek, flankspel, Roozenburg, Keller, compositie met eindspel |
| Type | meerdere mogelijk. Standaardlijst: directe combinatie, forcing, lokzet, eindspel |
| Moeilijkheid | optioneel, 1–5 sterren |
| Notities | vrij tekstveld |
| Foto | optioneel een verkleinde versie van de rechtgetrokken foto, om later de bron te kunnen controleren |
| Gebruikt in | automatisch: in welke stencils de stand zit, met datum |

Functies:
- De lijsten voor speelsysteem en type kan ik zelf aanpassen: waarden toevoegen, hernoemen en verwijderen.
- Overzicht met kleine diagrammen. Zoeken op auteur, publicatie en notities. Filteren op speelsysteem, type, moeilijkheid, jaartal, "met of zonder oplossing" en "nog nooit gebruikt". Sorteren op datum van invoer, jaartal of auteur.
- **Dubbele standen herkennen:** waarschuw bij opslaan als dezelfde stand al in de database staat. Herken ook de gespiegelde stand (links-rechts omgedraaid), die in boeken soms voorkomt.
- Een stand openen, bewerken, dupliceren en verwijderen (met bevestiging).
- Meerdere standen tegelijk selecteren en in een stencil zetten.
- Houd rekening met een verzameling van enkele duizenden standen: het overzicht moet snel blijven.

### E. Stencil
- Standen komen uit de database: via de editor, of door ze in het database-overzicht te selecteren.
- Koptekst met titel, clubnaam en datum. Daaronder een algemene opdrachtregel, standaard "Wit speelt en wint". Alles is aanpasbaar.
- Per diagram een **nummer** en de **optionele tekstregel** uit het veld "Opdracht". In het stencil kan ik de tekstregel aanpassen; vraag dan of die wijziging ook in de database moet.
- 1 tot 12 diagrammen per A4 staand. Bij 12 diagrammen 3 kolommen × 4 rijen, met gelijke afstanden en marges. Bij minder diagrammen kiest de app een nette indeling.
- Volgorde wijzigen door te slepen, en diagrammen verwijderen of openen in de editor.
- Voorbeeldweergave van het A4 zoals het geprint wordt.
- **Oplossingenblad:** apart A4 met dezelfde nummering. Per opgave de oplossing, en optioneel de bron (auteur, jaartal, publicatie). Als de oplossing ontbreekt, waarschuw je voordat ik exporteer.
- Stencils worden bewaard, zodat ik ze later kan openen, aanpassen en opnieuw exporteren.

### F. Uitvoer
- **Word (.docx), het belangrijkste formaat.** De layout moet in Word stabiel blijven, dus geen losse zwevende plaatjes. Gebruik bijvoorbeeld een tabel zonder randen met vaste kolombreedtes en rijhoogtes. Plaats de diagrammen als plaatjes met hoge resolutie (PNG van minstens 300 dpi op printformaat, zodat ze ook in oudere Word-versies scherp zijn). Nummers, tekstregels en oplossingen moeten in Word als gewone, bewerkbare tekst staan.
- Bij export kan ik kiezen: alleen opgaven, alleen oplossingen, of beide in één bestand (oplossingen op een nieuwe pagina).
- PDF via "Afdrukken / opslaan als PDF" vanuit de voorbeeldweergave.
- Losse diagrammen als PNG of SVG downloaden, en de FEN kopiëren.

### G. Opslag, back-up en meerdere apparaten
- **Back-up:** met één knop download ik de hele database (standen, stencils, eigen lijsten) als één bestand, en met één knop zet ik zo'n bestand terug. Bij terugzetten kan ik kiezen tussen samenvoegen (zonder dubbele standen) en vervangen. Herinner mij er af en toe aan om een back-up te maken.
- **Van telefoon naar laptop (nu):** een knop "Stuur naar ander apparaat" die een link maakt met de gekozen standen en al hun gegevens. Die link stuur ik mezelf via WhatsApp of mail, en op het andere apparaat voeg ik de standen met één tik toe aan de database. Voor grote aantallen gebruik je het back-upbestand.
- **Automatische synchronisatie (later, niet nu bouwen):** misschien wil ik later dat telefoon en laptop vanzelf dezelfde database hebben. Bouw de opslag daarom zo dat er later een synchronisatie-optie bij kan, bijvoorbeeld via een gratis online database of via een bestand in mijn eigen cloudmap. Het datamodel moet daar nu al geschikt voor zijn, bijvoorbeeld met unieke ID's en tijdstempels per wijziging. Leg mij in het plan kort de opties voor, met voor- en nadelen.
- Exporteer de database ook als leesbaar bestand (bijvoorbeeld PDN of CSV), zodat mijn verzameling nooit vastzit aan deze app.

## Technische richtlijnen
- Statische website (HTML, CSS, JavaScript), zonder eigen server. Neem alle bibliotheken op in het project, zodat de app niet afhankelijk is van andere websites.
- Houd de kernlogica gescheiden van herkenning, opslag en schermen: bordmodel, FEN, veldnummering ↔ coördinaten, spiegelen, validatie en layoutberekening. De opslag zit achter een eigen tussenlaag, zodat er later synchronisatie bij kan.
- Geef het datamodel een versienummer en schrijf migraties, zodat nieuwe velden later geen bestaande gegevens kapotmaken.
- Schrijf automatische tests voor de kernlogica, de database-functies (opslaan, zoeken, dubbele standen, back-up en terugzetten) en de Word-export.
- **Testset voor herkenning:** maak een map `testdata/` met:
  - de twee referentieplaatjes met hun juiste FEN (leeg bord: `W:W:B`, voorbeeld: `W:W13,15,33:B1,5,30`);
  - door jou gegenereerde plaatjes: willekeurige standen in de eigen diagramstijl, plus bewerkte versies die op telefoonfoto's lijken (scheef perspectief, onscherpte, schaduw, ongelijk licht);
  - mijn echte foto's uit de map `testfotos/`. De juiste standen heb ik in `testfotos/standen.txt` gezet in de vorm `bestandsnaam: wit ... zwart ...`.
  Maak een evaluatiescript dat de nauwkeurigheid per veld en per complete stand rapporteert, en draai het na elke wijziging aan de herkenning.
- README in het Nederlands: waar staat de app, hoe installeer ik hem op het beginscherm van mijn telefoon, hoe maak en herstel ik een back-up, en hoe vraag ik later wijzigingen aan.

## Werkwijze en fasering
Begin met een plan en stel eerst je vragen, voordat je code schrijft. Werk in fasen. Zet na elke fase de app online en vertel me wat ik op mijn telefoon kan testen.

- **Fase 1:** bordmodel, FEN- en veldnummerinvoer, diagram in Oerterp-stijl, klikbare editor, database met alle velden (opslaan, bewerken, eenvoudig overzicht), stencil met oplossingenblad, Word-export, back-up. Daarna online zetten. Vanaf dit moment bespaart de app me al tijd.
- **Fase 2:** camera- en galerij-upload, herkenning van screenshots, evaluatie op de testset.
- **Fase 3:** herkenning van boekfoto's, hoeken verslepen, evaluatie op mijn echte foto's.
- **Fase 4:** uitgebreid zoeken en filteren, dubbele en gespiegelde standen herkennen, "gebruikt in", eigen lijsten beheren, delen via link, PWA/offline, export als PDN/CSV.
- **Later, na overleg:** automatische synchronisatie tussen apparaten; eventueel controle van oplossingen op geldige zetten volgens de spelregels (inclusief meerslag en damzetten), om tikfouten te vinden.

## Acceptatiecriteria
- Van foto tot opgeslagen stand in de database binnen 1 minuut, inclusief correcties en de belangrijkste gegevens.
- Het Word-bestand met 12 diagrammen opent netjes op één A4, met gelijke afstanden en zonder handwerk. Het oplossingenblad gebruikt dezelfde nummering. Teksten zijn in Word bewerkbaar en de layout verschuift daarbij niet.
- De diagrammen zijn niet te onderscheiden van de Oerterp-stijl en printen scherp, ook op een zwart-witprinter.
- Screenshots in Oerterp-stijl worden vrijwel altijd foutloos herkend.
- Bij redelijke foto's van boekdiagrammen is minstens 90% van de standen correct zonder correctie. Twijfelgevallen zijn altijd zichtbaar gemarkeerd.
- In een database met 2.000 standen vind ik binnen enkele seconden alle Keller-standen van het type "lokzet" die ik nog nooit heb gebruikt.
- Een back-up maken en terugzetten op een ander apparaat werkt zonder gegevensverlies.
- Alles werkt op mijn telefoon en laptop, zonder installatie en zonder kosten.
