#!/bin/bash
# Zorgt dat de OCR-helper vanzelf start bij inloggen en blijft draaien.
# macOS laat achtergrondprogramma's niet in de map Documenten lezen, dus de helper krijgt een eigen
# kopie in ~/Library/Application Support (met een eigen Python-omgeving).
set -e
cd "$(dirname "$0")"
BRON="$(pwd)"
DOEL="$HOME/Library/Application Support/nl.damdatabase.ocr-helper"
PLIST="$HOME/Library/LaunchAgents/nl.damdatabase.ocr-helper.plist"
mkdir -p "$DOEL" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
cp "$BRON/server.py" "$BRON/requirements.txt" "$DOEL/"
if [ ! -x "$DOEL/.venv/bin/python" ]; then
  python3 -m venv "$DOEL/.venv"
  "$DOEL/.venv/bin/pip" install -q --upgrade pip
  "$DOEL/.venv/bin/pip" install -q -r "$DOEL/requirements.txt"
fi
sed "s|__MAP__|$DOEL|g; s|__LOGS__|$HOME/Library/Logs|g" nl.damdatabase.ocr-helper.plist > "$PLIST"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Gedaan. De helper draait nu en start voortaan bij inloggen."
echo "Uitzetten: ./launchd-uninstall.sh"
