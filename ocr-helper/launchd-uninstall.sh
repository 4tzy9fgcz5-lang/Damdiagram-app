#!/bin/bash
PLIST="$HOME/Library/LaunchAgents/nl.damdatabase.ocr-helper.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "De OCR-helper start niet meer automatisch."
