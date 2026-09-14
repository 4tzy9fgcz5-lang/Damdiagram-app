# Cache-busting

GitHub Pages (via Fastly) caches every file for 10 minutes (`max-age=600`), even
for a brand-new visitor or a private/incognito window — a hard refresh does
**not** bypass this, only a genuinely new URL does. That caused a lot of "ik heb
gepusht en getest maar zie geen verschil" confusion in the past.

Every relative import across `src/`, `tests/`, and `index.html` therefore carries
a shared `?v=YYYYMMDDx` query string (e.g. `?v=20260914a`). When you edit any file
that's meant to go live, bump this version string on **every** relative import in
**every** `src/*.js`/`tests/*.js` file and in `index.html` (script + stylesheet
tag), in the same commit — not just in the file you changed. A one-off script to
do this in one pass:

```bash
python3 - <<'EOF'
import re, glob

VERSION = "YYYYMMDDx"  # bump this

def bump_file(path):
    with open(path, encoding="utf-8") as f:
        content = original = f.read()
    def repl(m):
        prefix, path_part, suffix = m.group(1), m.group(2), m.group(3)
        return f'{prefix}{path_part.split("?")[0]}?v={VERSION}{suffix}'
    content = re.sub(r'(from\s+")((?:\.\./|\./)[^"]+)(")', repl, content)
    content = re.sub(r'(^import\s+")((?:\.\./|\./)[^"]+)(")', repl, content, flags=re.MULTILINE)
    if content != original:
        open(path, "w", encoding="utf-8").write(content)
        return True
    return False

for path in glob.glob("src/**/*.js", recursive=True) + glob.glob("tests/*.js"):
    bump_file(path)
EOF
```

Then manually bump the two `?v=` occurrences in `index.html` (the `<link>` and
`<script>` tags) and, if relevant, `tests/tests.html`'s imports, to the same value.

Because the *whole graph* shares one version token, bumping it guarantees every
file refreshes together — no partial mix of old and new files, which is what
made earlier caching symptoms so confusing to diagnose.
