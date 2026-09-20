import http.server, os, sys
OUT = sys.argv[1]
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        name = os.path.basename(self.path.split("?name=")[-1])
        n = int(self.headers.get("Content-Length", 0))
        open(os.path.join(OUT, name), "wb").write(self.rfile.read(n))
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("", 8000), H).serve_forever()
