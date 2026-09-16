// Codering voor de "Stuur naar ander apparaat"-link (zie databaseView.js /
// importView.js). Zonder compressie werd de link bij meerdere standen al snel
// kilometers lang (elke stand draagt zijn volledige zetten/categorieën/etc.
// als JSON mee) — te lang om nog fatsoenlijk te plakken in WhatsApp of mail.
// gzip via de ingebouwde CompressionStream (geen library, werkt in elke
// recente browser) brengt dat flink terug, dankzij alle herhaalde veldnamen.

const FORMAT_GZIP = "1";
const FORMAT_PLAIN = "0";

function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeShareData(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === "function") {
    return FORMAT_GZIP + toBase64Url(await gzip(bytes));
  }
  return FORMAT_PLAIN + toBase64Url(bytes);
}

export async function decodeShareData(encoded) {
  const marker = encoded[0];
  if (marker === FORMAT_GZIP || marker === FORMAT_PLAIN) {
    try {
      const bytes = fromBase64Url(encoded.slice(1));
      const jsonBytes = marker === FORMAT_GZIP ? await gunzip(bytes) : bytes;
      return JSON.parse(new TextDecoder().decode(jsonBytes));
    } catch {
      // Val terug op de oude, ongemarkeerde codering hieronder — kan een link
      // zijn die al verstuurd was vóórdat compressie werd toegevoegd.
    }
  }
  const bytes = fromBase64Url(encoded);
  return JSON.parse(new TextDecoder().decode(bytes));
}
