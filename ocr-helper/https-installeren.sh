#!/bin/bash
# Eenmalig, voor Safari: maakt een certificaat voor "localhost" en vertrouwt dat op deze Mac, zodat de
# app op github.io de helper beveiligd (https) kan bereiken. Macs vraagt hier om je wachtwoord of Touch ID.
set -e
cd "$(dirname "$0")"
DOEL="$HOME/Library/Application Support/nl.damdatabase.ocr-helper"
CERT="$DOEL/cert"
mkdir -p "$CERT"
chmod 700 "$CERT"
openssl req -x509 -newkey rsa:2048 -nodes -days 800 -sha256 \
  -keyout "$CERT/localhost-key.pem" -out "$CERT/localhost.pem" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -addext "extendedKeyUsage=serverAuth" -addext "basicConstraints=critical,CA:FALSE" 2>/dev/null
chmod 600 "$CERT/localhost-key.pem"
echo "Certificaat gemaakt. Straks vraagt je Mac om je wachtwoord om het te vertrouwen."
security add-trusted-cert -r trustRoot -p ssl -k "$HOME/Library/Keychains/login.keychain-db" "$CERT/localhost.pem"
echo "Vertrouwd. De helper wordt nu opnieuw gestart."
./launchd-install.sh
