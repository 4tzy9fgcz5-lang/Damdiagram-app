function csvEscape(value) {
  const str = String(value ?? "");
  if (/["\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const CSV_COLUMNS = [
  "fen",
  "opdracht",
  "oplossing",
  "auteur",
  "jaartal",
  "publicatie",
  "speelsystemen",
  "types",
  "moeilijkheid",
  "notities",
  "aangemaakt",
];

export function buildCsv(standen) {
  const lines = [CSV_COLUMNS.join(";")];
  for (const s of standen) {
    lines.push(
      [
        s.fen,
        s.opdracht,
        s.oplossing,
        s.auteur,
        s.jaartal ?? "",
        s.publicatie,
        s.speelsystemen.join(", "),
        s.types.join(", "),
        s.moeilijkheid ?? "",
        s.notities,
        s.createdAt,
      ]
        .map(csvEscape)
        .join(";")
    );
  }
  return lines.join("\r\n");
}

export function buildPdnText(standen) {
  const blocks = standen.map((s) => {
    const bron = [s.auteur, s.jaartal, s.publicatie].filter(Boolean).join(", ");
    const lines = [`[FEN "${s.fen}"]`];
    if (bron) lines.push(`; Bron: ${bron}`);
    if (s.opdracht) lines.push(`; Opdracht: ${s.opdracht}`);
    if (s.speelsystemen.length) lines.push(`; Speelsysteem: ${s.speelsystemen.join(", ")}`);
    if (s.types.length) lines.push(`; Type: ${s.types.join(", ")}`);
    if (s.oplossing) lines.push(`; Oplossing: ${s.oplossing}`);
    return lines.join("\n");
  });
  return blocks.join("\n\n");
}
