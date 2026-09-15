'use strict';

/**
 * Leest labels.txt. Eén regel per diagram, in damnotatie, met een stijltag:
 *
 *   diag01 @kraakman  W: 31-35,37,38,40  Z: 12,14,16-20
 *   diag02 @hoogland  W: 28,33,39        Z: -
 *
 * De stijltag (@naam) geeft aan uit welk boek of tijdschrift het diagram komt.
 * Die wordt gebruikt om eerlijk te meten: het model wordt beoordeeld op een stijl
 * die het tijdens het trainen nooit heeft gezien. Zonder tag valt alles onder
 * stijl 'onbekend' en is het cijfer te optimistisch.
 *
 * Alles wat niet genoemd wordt is leeg. Regels met # zijn commentaar.
 * Bereiken (31-35) tellen alleen de velden die er echt zijn, dus 31 t/m 35.
 */

function parseSquares(spec) {
  const out = new Set();
  const s = spec.trim();
  if (!s || s === '-') return out;
  for (const part of s.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    } else if (/^\d+$/.test(p)) {
      out.add(+p);
    } else {
      throw new Error(`Onbegrepen veldnotatie: "${p}"`);
    }
  }
  return out;
}

/** @returns {Array<{photo:string, style:string, labels:string[]}>} labels[0] hoort bij veld 1 */
function parseLabelFile(text) {
  const photos = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    const raw = line.split('#')[0].trim();
    if (!raw) return;
    const m = raw.match(/^(\S+)\s+(?:@(\S+)\s+)?W:\s*([^Z]*?)\s+Z:\s*(.*)$/i);
    if (!m) throw new Error(`Regel ${idx + 1} ongeldig: "${line}"`);
    const photo = m[1];
    const style = m[2] || 'onbekend';
    const white = parseSquares(m[3]);
    const black = parseSquares(m[4]);
    for (const sq of white) {
      if (black.has(sq)) throw new Error(`${photo}: veld ${sq} staat bij zowel W als Z`);
    }
    for (const sq of [...white, ...black]) {
      if (sq < 1 || sq > 50) throw new Error(`${photo}: veld ${sq} bestaat niet`);
    }
    const labels = new Array(50).fill('empty');
    for (const sq of white) labels[sq - 1] = 'white';
    for (const sq of black) labels[sq - 1] = 'black';
    photos.push({ photo, style, labels });
  });
  return photos;
}

/** Omgekeerd: van 50 labels terug naar een regel, voor het corrigeer-werkproces. */
function formatLabelLine(photo, labels, style) {
  const group = (want) => {
    const sq = [];
    labels.forEach((l, i) => { if (l === want) sq.push(i + 1); });
    if (!sq.length) return '-';
    const parts = [];
    let start = sq[0];
    let prev = sq[0];
    for (let i = 1; i <= sq.length; i++) {
      if (sq[i] === prev + 1) { prev = sq[i]; continue; }
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = sq[i];
      prev = sq[i];
    }
    return parts.join(',');
  };
  return `${photo}${style ? ` @${style}` : ''}  W: ${group('white')}  Z: ${group('black')}`;
}

module.exports = { parseLabelFile, formatLabelLine, parseSquares };
