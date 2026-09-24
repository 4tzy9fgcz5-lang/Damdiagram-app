#!/bin/bash
# Installeert de OCR-helper: maakt een eigen Python-omgeving en zet Apple Vision voor Python erin.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -c "import Vision" && echo "Klaar. Start met: ./start.sh"
