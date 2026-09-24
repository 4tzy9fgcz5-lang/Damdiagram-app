// Koppeling met de lokale OCR-helper (map ocr-helper/, Apple Vision) op localhost:8765.
// De foto verlaat de Mac niet. Zonder draaiende helper blijft plakken vanuit Claude gewoon werken.
const HELPER_URL = "http://localhost:8765";

// true als de helper draait en antwoordt.
export async function helperBeschikbaar() {
  try {
    const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

// Leest één foto; geeft { lines: [{text, confidence, box}], text } of gooit een Error met een leesbare melding.
export async function leesFotoMetHelper(file) {
  let res;
  try {
    res = await fetch(`${HELPER_URL}/ocr`, {
      method: "POST",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
  } catch {
    throw new Error("De OCR-helper is niet bereikbaar.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `De OCR-helper gaf een fout (${res.status}).`);
  return data;
}

// Maakt van de gelezen regels tekst die `splitOplossingenTekst` goed kan lezen. Weggelaten worden:
//  - korte regels helemaal tegen de fotorand (smal, binnen 8% van de rand): brokjes van de buurpagina die
//    in beeld komt; ze zouden anders als schijn-oplossingen ("9. 2-16") de echte oplossing afknippen;
//  - regels zonder enig cijfer (bijvoorbeeld het woord "Диаграмма" boven een diagram).
// De rest blijft zoals gelezen; de controle op de damregels vangt op wat er dan nog niet klopt.
export function schoonOcrTekst(lines) {
  return (lines || [])
    .filter((l) => /\d/.test(l.text))
    .filter((l) => {
      const b = l.box;
      if (!b || b.w >= 0.12) return true;
      return b.x > 0.08 && b.x + b.w < 0.92;
    })
    .map((l) => l.text)
    .join("\n");
}
