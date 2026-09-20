# Bulk-import nameten in de echte browser

Draait de bulk-route (`detectBulkBoards` + herkenning door het neurale netwerkje) op een
paginafoto en tekent per diagram de herkende schijven (rood = wit, blauw = zwart, geel =
onzeker) op het rechtgetrokken bord, zodat je met het oog kunt zien of het kader klopt.

1. Foto's omzetten naar JPEG in `testdata/` (gitignored):
   `sips -s format jpeg -s formatOptions 90 IMG.HEIC --out testdata/pages5/IMG.jpg`
2. Server die ook beelden uit de browser opslaat (vanuit de project-root):
   `python3 tools/bulkCheck/server.py <map-voor-uitvoer>`  (poort 8000)
3. In de browser (tabblad moet vooraan staan, anders lopen afbeeldingen vast) `index.html` openen en
   `await (await import("/tools/bulkCheck/driver.js")).setup("?v=<huidige cache-versie>");`
   `await pageRun("/testdata/pages5/IMG.jpg", "naam");` — schrijft `naam_1.jpg`, ... naar de uitvoermap
   en geeft per diagram het aantal witte/zwarte schijven en gele velden terug.
