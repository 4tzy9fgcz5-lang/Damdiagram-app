# OCR-helper (Apple Vision)

Een klein programmaatje op je eigen Mac dat een foto van een oplossing leest met de
tekstherkenning van Apple. De Dam-database-app praat er via `http://localhost:8765` mee.
Er gaat niets over internet: de foto blijft op je Mac. Werkt alleen op een Mac.

## Installeren (eenmalig)

Open Terminal, ga naar deze map en voer uit:

    cd "/Users/janvanderstar/Documents/Damdiagram app/ocr-helper"
    ./install.sh

## Starten

Handmatig (stoppen met Ctrl+C):

    ./start.sh

Of automatisch bij elke keer inloggen (aanbevolen):

    ./launchd-install.sh

Dit maakt een eigen kopie van de helper in `~/Library/Application Support/nl.damdatabase.ocr-helper`
(macOS laat achtergrondprogramma's niet in de map Documenten lezen). Is `server.py` later aangepast,
voer dan `./launchd-install.sh` nog eens uit.

Uitzetten: `./launchd-uninstall.sh`. Meldingen staan in `~/Library/Logs/ocr-helper.log`.

## Controleren of het draait

Ga in de browser naar http://localhost:8765/health — je ziet `"ok": true`.

## Technisch

- `GET /health` — beschikbaarheidscheck.
- `POST /ocr` — body is de afbeelding zelf (of JSON `{"image": "<base64>"}`).
  Antwoord: `{"lines": [{"text", "confidence", "box"}], "text": "..."}`, regels van boven naar beneden.
- Vision staat op `accurate` met taalcorrectie **uit**, anders "verbetert" Apple cijfers.
- Alleen deze websites mogen de helper aanroepen: `http://localhost:8000`,
  `http://127.0.0.1:8000` en `https://4tzy9fgcz5-lang.github.io`. Anders zetten:
  `OCR_ORIGINS="https://voorbeeld.nl" ./start.sh`. Poort wijzigen: `OCR_PORT=9000`.
- Preflight-verzoeken krijgen `Access-Control-Allow-Private-Network: true` (Chrome eist dat
  voor aanroepen van een website naar localhost).
- Safari kan aanroepen van een https-website naar `http://localhost` blokkeren; gebruik Chrome.
