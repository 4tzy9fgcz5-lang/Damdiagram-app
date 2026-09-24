#!/usr/bin/env python3
"""Lokale OCR-helper voor de Dam-database-app (Apple Vision, alleen op macOS).

Luistert alleen op localhost. Endpoints:
  GET  /health  -> {"ok": true, ...}
  POST /ocr     -> body = de afbeelding zelf (image/jpeg, image/png, image/heic, ...)
                   of JSON {"image": "<base64>"}
                   antwoord: {"lines": [{"text", "confidence", "box": {x,y,w,h}}], "text": "..."}
"""
import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import Vision
from Foundation import NSData

PORT = int(os.environ.get("OCR_PORT", "8765"))
MAX_BYTES = 40 * 1024 * 1024

# Websites die de helper mogen aanroepen. Extra origins: OCR_ORIGINS="https://a,https://b"
ALLOWED_ORIGINS = {
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://4tzy9fgcz5-lang.github.io",
}
ALLOWED_ORIGINS.update(o.strip() for o in os.environ.get("OCR_ORIGINS", "").split(",") if o.strip())


def lees_afbeelding(data: bytes):
    """Draait Apple Vision op de afbeelding; geeft regels in leesvolgorde terug."""
    nsdata = NSData.dataWithBytes_length_(data, len(data))
    handler = Vision.VNImageRequestHandler.alloc().initWithData_options_(nsdata, None)
    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    # Uit: anders "verbetert" Vision cijfers tot woorden.
    request.setUsesLanguageCorrection_(False)
    ok, fout = handler.performRequests_error_([request], None)
    if not ok:
        raise ValueError(f"Vision kon de afbeelding niet lezen: {fout}")
    regels = []
    for obs in request.results() or []:
        kand = obs.topCandidates_(1)
        if not kand:
            continue
        b = obs.boundingBox()  # genormaliseerd, oorsprong linksonder
        regels.append({
            "text": str(kand[0].string()),
            "confidence": round(float(kand[0].confidence()), 4),
            "box": {"x": round(b.origin.x, 4), "y": round(b.origin.y, 4),
                    "w": round(b.size.width, 4), "h": round(b.size.height, 4)},
        })
    # Van boven naar beneden, bij (bijna) gelijke hoogte van links naar rechts.
    regels.sort(key=lambda r: (-round((r["box"]["y"] + r["box"]["h"] / 2) / 0.012), r["box"]["x"]))
    return regels


class Handler(BaseHTTPRequestHandler):
    server_version = "DamOCR/1.0"

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "engine": "Apple Vision", "version": 1})
        else:
            self._json(404, {"error": "Onbekend adres"})

    def do_POST(self):
        if self.path != "/ocr":
            return self._json(404, {"error": "Onbekend adres"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 0:
            return self._json(400, {"error": "Geen afbeelding ontvangen"})
        if n > MAX_BYTES:
            return self._json(413, {"error": "Afbeelding te groot (max 40 MB)"})
        data = self.rfile.read(n)
        try:
            if "json" in (self.headers.get("Content-Type") or ""):
                data = base64.b64decode(json.loads(data)["image"])
            regels = lees_afbeelding(data)
        except Exception as e:  # noqa: BLE001 - alles als nette fout terug
            return self._json(400, {"error": str(e)})
        self._json(200, {"lines": regels, "text": "\n".join(r["text"] for r in regels)})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"OCR-helper luistert op http://localhost:{PORT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
