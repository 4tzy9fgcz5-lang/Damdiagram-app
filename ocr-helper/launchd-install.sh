#!/bin/bash
# Zorgt dat de OCR-helper vanzelf start bij inloggen en blijft draaien.
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/nl.damdatabase.ocr-helper.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed "s|__MAP__|$DIR|g; s|__LOGS__|$HOME/Library/Logs|g" nl.damdatabase.ocr-helper.plist > "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Gedaan. De helper draait nu en start voortaan bij inloggen."
echo "Uitzetten: ./launchd-uninstall.sh"
