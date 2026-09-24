#!/bin/bash
# Start de OCR-helper in dit venster (stoppen: Ctrl+C).
cd "$(dirname "$0")"
exec .venv/bin/python server.py
