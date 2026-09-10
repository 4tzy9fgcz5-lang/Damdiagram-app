# Damstencil-app

Een eigen, gratis app om damstanden te verzamelen en er opgavestencils (A4, met oplossingenblad) van te maken in Word. Alles werkt in de browser, op je telefoon en op je laptop, zonder kosten en zonder dat er iets naar internet wordt gestuurd.

**Waar staat de app?** _(volgt zodra hij online staat — zie hieronder)_

## Wat kan de app nu (Fase 1)?

- Een stand invoeren: FEN plakken, snelle tekstinvoer ("wit 27 28 32 zwart 12 13"), of handmatig op een leeg bord/beginstand klikken.
- Een klikbaar bord met een palet (schijf, dam, wissen) dat tekent in dezelfde stijl als de Oerterp Diagram Maker van de KNDB.
- Standen opslaan in je eigen database (in de browser zelf, IndexedDB): met oplossing, auteur, jaartal, publicatie, speelsysteem, type, moeilijkheid en notities.
- Zoeken, filteren en sorteren in je verzameling. De app waarschuwt bij dubbele of gespiegelde standen.
- Stencils samenstellen: 1 tot 12 diagrammen per A4, met een apart oplossingenblad.
- Downloaden als Word-bestand (.docx) — scherp op elke printer, en de tekst blijft in Word aanpasbaar.
- Een voorbeeldweergave die je direct via je browser kunt afdrukken of als PDF kunt opslaan.
- Losse diagrammen downloaden als PNG of SVG, of de FEN kopiëren.
- Back-up maken en terugzetten (één bestand met je hele verzameling), en losse export als CSV of leesbare tekst.
- Standen overzetten van telefoon naar laptop via een linkje (WhatsApp/mail).

**Nog niet gebouwd** (latere fases): foto van een diagram maken en automatisch laten herkennen, geavanceerd zoeken, en installeren als app-icoon op je beginscherm die ook offline werkt.

## Hoe gebruik ik de app op mijn telefoon?

1. Open de link hierboven in Safari (iPhone) of Chrome (Android/laptop).
2. Voeg de pagina toe aan je beginscherm voor snelle toegang:
   - **iPhone (Safari):** tik op het deel-icoon (vierkantje met pijl omhoog) onderin, kies "Zet op beginscherm".
   - **Android (Chrome):** tik op de drie puntjes rechtsboven, kies "Toevoegen aan startscherm".
3. Vanaf nu open je de app gewoon met een tik op dat icoon.

> Let op: dit is nog geen "echte" installeerbare app die ook zonder internet werkt — dat volgt in een latere bouwstap. Bewaar daarom af en toe een back-up (zie hieronder), zodat je verzameling nooit verloren gaat, ook niet als Safari opslagruimte opruimt.

## Back-up maken en terugzetten

Ga naar het tabblad **Back-up**:

- **Back-up maken:** klik op "Back-up downloaden". Bewaar dit bestand ergens veilig, bijvoorbeeld in je e-mail aan jezelf of in een cloudmap.
- **Terugzetten:** kies het back-upbestand en klik op "Terugzetten". Kies "Samenvoegen" om toe te voegen zonder dubbele standen, of "Vervangen" om alles te overschrijven.
- De app herinnert je er af en toe aan als het lang geleden is.

## Standen overzetten tussen je telefoon en laptop

Ga naar **Database**, vink de standen aan die je wilt overzetten, klik op "Stuur naar ander apparaat" en stuur de link naar jezelf (WhatsApp, mail). Open de link op het andere apparaat en klik op "Toevoegen aan mijn database".

## Hoe vraag ik wijzigingen aan?

Open opnieuw een gesprek met Claude Code (dezelfde plek als waar deze app gebouwd is) en beschrijf in gewone taal wat je anders wilt. Bijvoorbeeld: "Ik wil dat het lettertype in het stencil groter is" of "Kun je ook Eindspel toevoegen aan de standaardlijst?".

## Technisch (voor de volledigheid)

Een statische website: platte HTML, CSS en JavaScript, zonder server en zonder bouwstap. De enige meegeleverde bibliotheek is `docx` (voor het maken van Word-bestanden), in de map `lib/`. Alle broncode staat in `src/`, onderverdeeld in kernlogica (`core/`), het diagram (`diagram/`), de database (`db/`), de schermen (`ui/`), stencils (`stencil/`) en export (`export/`). Automatische tests staan in `tests/tests.html` — open dat bestand in een browser om ze te draaien.
