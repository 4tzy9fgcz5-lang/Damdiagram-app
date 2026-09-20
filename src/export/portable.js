import { resolveOplossingTekst } from "../db/standen.js?v=20260920c";

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
        resolveOplossingTekst(s),
        s.auteur,
        s.jaartal ?? "",
        s.publicatie,
        (s.categorieen?.speelsysteem ?? []).join(", "),
        (s.categorieen?.type ?? []).join(", "),
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
    const speelsystemen = s.categorieen?.speelsysteem ?? [];
    const types = s.categorieen?.type ?? [];
    if (speelsystemen.length) lines.push(`; Speelsysteem: ${speelsystemen.join(", ")}`);
    if (types.length) lines.push(`; Type: ${types.join(", ")}`);
    const oplossingTekst = resolveOplossingTekst(s);
    if (oplossingTekst) lines.push(`; Oplossing: ${oplossingTekst}`);
    return lines.join("\n");
  });
  return blocks.join("\n\n");
}
