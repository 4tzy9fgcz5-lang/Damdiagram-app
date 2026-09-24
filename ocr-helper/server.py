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
import re
import ssl
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import Vision
from Foundation import NSData

PORT = int(os.environ.get("OCR_PORT", "8765"))
HTTPS_PORT = int(os.environ.get("OCR_HTTPS_PORT", "8766"))
CERT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cert")
MAX_BYTES = 40 * 1024 * 1024

# Websites die de helper mogen aanroepen. Extra origins: OCR_ORIGINS="https://a,https://b"
ALLOWED_ORIGINS = {
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://4tzy9fgcz5-lang.github.io",
}
ALLOWED_ORIGINS.update(o.strip() for o in os.environ.get("OCR_ORIGINS", "").split(",") if o.strip())


def _woorden(kandidaat, tekst):
    """Elk woord van een gelezen regel met zijn eigen positie (genormaliseerd, oorsprong linksonder)."""
    out = []
    for m in re.finditer(r"\S+", tekst):
        try:
            res = kandidaat.boundingBoxForRange_error_((m.start(), m.end() - m.start()), None)
            obs = res[0] if isinstance(res, tuple) else res
            b = obs.boundingBox()
            out.append({"t": m.group(), "s": m.start(), "e": m.end(), "x0": b.origin.x, "x1": b.origin.x + b.size.width,
                        "y": b.origin.y, "h": b.size.height})
        except Exception:  # noqa: BLE001 - zonder woordpositie kunnen we deze regel niet splitsen
            return []
    return out


def _zoek_kolommen(regels):
    """Herkent een pagina met twee tekstkolommen aan waar de (lange) regels beginnen: twee groepen ver uit
    elkaar. Geeft (grens, begin_rechterkolom) terug, of None bij één kolom."""
    lange = sorted(r["box"]["x"] for r in regels if len(r["woorden"]) >= 3 and r["box"]["w"] >= 0.12)
    if len(lange) < 8:
        return None
    gaten = [(lange[i + 1] - lange[i], i) for i in range(len(lange) - 1)]
    gat, i = max(gaten)
    if gat < 0.2:
        return None
    links, rechts = lange[:i + 1], lange[i + 1:]
    if min(len(links), len(rechts)) < 0.25 * len(lange):
        return None
    mediaan = lambda xs: xs[len(xs) // 2]
    l, r = mediaan(links), mediaan(rechts)
    return (l + r) / 2, r


def _kolomregel(r, delen):
    ws = delen
    x0, x1 = min(w["x0"] for w in ws), max(w["x1"] for w in ws)
    y0, y1 = min(w["y"] for w in ws), max(w["y"] + w["h"] for w in ws)
    return {"text": r["tekst"][ws[0]["s"]:ws[-1]["e"]], "confidence": r["confidence"],
            "box": {"x": round(x0, 4), "y": round(y0, 4), "w": round(x1 - x0, 4), "h": round(y1 - y0, 4)}}


def lees_afbeelding(data: bytes):
    """Draait Apple Vision op de afbeelding; geeft (regels in leesvolgorde, aantal kolommen) terug.
    Bij een pagina met twee kolommen: eerst de hele linkerkolom, dan de rechter, en regels die Vision over
    de kolomgrens heen als één regel las worden weer in tweeën gedeeld."""
    nsdata = NSData.dataWithBytes_length_(data, len(data))
    handler = Vision.VNImageRequestHandler.alloc().initWithData_options_(nsdata, None)
    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    # Uit: anders "verbetert" Vision cijfers tot woorden.
    request.setUsesLanguageCorrection_(False)
    ok, fout = handler.performRequests_error_([request], None)
    if not ok:
        raise ValueError(f"Vision kon de afbeelding niet lezen: {fout}")
    ruw = []
    for obs in request.results() or []:
        kand = obs.topCandidates_(1)
        if not kand:
            continue
        tekst = str(kand[0].string())
        b = obs.boundingBox()  # genormaliseerd, oorsprong linksonder
        ruw.append({"tekst": tekst, "confidence": round(float(kand[0].confidence()), 4),
                    "box": {"x": b.origin.x, "y": b.origin.y, "w": b.size.width, "h": b.size.height},
                    "woorden": _woorden(kand[0], tekst)})

    def hoog(box):
        return -round((box["y"] + box["h"] / 2) / 0.012)

    kolommen = _zoek_kolommen(ruw)
    regels = []
    if kolommen is None:
        for r in ruw:
            regels.append({"text": r["tekst"], "confidence": r["confidence"],
                           "box": {k: round(v, 4) for k, v in r["box"].items()}})
        regels.sort(key=lambda r: (hoog(r["box"]), r["box"]["x"]))
        return regels, 1
    grens, rechter_begin = kolommen
    links, rechts = [], []
    for r in ruw:
        ws, bx = r["woorden"], r["box"]
        # Een regel die in de linkerkolom begint maar tot ver in de rechterkolom loopt: Vision las twee
        # kolommen als één regel. Delen bij het eerste woord dat waar de rechterkolom begint.
        if ws and bx["x"] < grens and bx["x"] + bx["w"] > rechter_begin + 0.05:
            i = next((k for k, w in enumerate(ws) if w["x0"] >= rechter_begin - 0.02), None)
            if i and ws[i - 1]["x1"] < rechter_begin + 0.02:
                links.append(_kolomregel(r, ws[:i]))
                rechts.append(_kolomregel(r, ws[i:]))
                continue
        regel = {"text": r["tekst"], "confidence": r["confidence"],
                 "box": {k: round(v, 4) for k, v in bx.items()}}
        (links if bx["x"] < grens else rechts).append(regel)
    for kolom in (links, rechts):
        kolom.sort(key=lambda r: (hoog(r["box"]), r["box"]["x"]))
    return links + rechts, 2


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
            regels, kolommen = lees_afbeelding(data)
        except Exception as e:  # noqa: BLE001 - alles als nette fout terug
            return self._json(400, {"error": str(e)})
        self._json(200, {"lines": regels, "columns": kolommen, "text": "\n".join(r["text"] for r in regels)})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def start_https():
    """Tweede, beveiligde ingang (https) voor Safari, dat een https-website niet met http://localhost laat praten.
    Alleen actief als https-installeren.sh een certificaat heeft gemaakt."""
    cert, key = os.path.join(CERT_DIR, "localhost.pem"), os.path.join(CERT_DIR, "localhost-key.pem")
    if not (os.path.exists(cert) and os.path.exists(key)):
        return
    srv = ThreadingHTTPServer(("127.0.0.1", HTTPS_PORT), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"Beveiligd (https) ook op https://localhost:{HTTPS_PORT}", flush=True)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"OCR-helper luistert op http://localhost:{PORT}", flush=True)
    start_https()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
