// Minimale, dependency-vrije ZIP-schrijver (alleen "store", geen compressie — de
// inhoud (PNG's) is toch al gecomprimeerd, dus extra deflate zou weinig schelen en
// een hele deflate-implementatie erbij halen is voor dit doel overkill).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 1 januari 1980, middernacht — vaste datum, want het echte tijdstip van een crop
// doet er hier niet toe.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}
function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}

// entries: [{ name: string, data: Uint8Array }]
// Geeft een Blob (type application/zip) terug.
export function buildZip(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);

    const local = new ArrayBuffer(30);
    const lv = new DataView(local);
    writeUint32(lv, 0, 0x04034b50);
    writeUint16(lv, 4, 20);
    writeUint16(lv, 6, 0);
    writeUint16(lv, 8, 0);
    writeUint16(lv, 10, DOS_TIME);
    writeUint16(lv, 12, DOS_DATE);
    writeUint32(lv, 14, crc);
    writeUint32(lv, 18, data.length);
    writeUint32(lv, 22, data.length);
    writeUint16(lv, 26, nameBytes.length);
    writeUint16(lv, 28, 0);

    parts.push(new Uint8Array(local), nameBytes, data);

    const central = new ArrayBuffer(46);
    const cv = new DataView(central);
    writeUint32(cv, 0, 0x02014b50);
    writeUint16(cv, 4, 20);
    writeUint16(cv, 6, 20);
    writeUint16(cv, 8, 0);
    writeUint16(cv, 10, 0);
    writeUint16(cv, 12, DOS_TIME);
    writeUint16(cv, 14, DOS_DATE);
    writeUint32(cv, 16, crc);
    writeUint32(cv, 20, data.length);
    writeUint32(cv, 24, data.length);
    writeUint16(cv, 28, nameBytes.length);
    writeUint16(cv, 30, 0);
    writeUint16(cv, 32, 0);
    writeUint16(cv, 34, 0);
    writeUint16(cv, 36, 0);
    writeUint32(cv, 38, 0);
    writeUint32(cv, 42, offset);

    centralParts.push(new Uint8Array(central), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const p of centralParts) centralSize += p.length;

  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  writeUint32(ev, 0, 0x06054b50);
  writeUint16(ev, 4, 0);
  writeUint16(ev, 6, 0);
  writeUint16(ev, 8, entries.length);
  writeUint16(ev, 10, entries.length);
  writeUint32(ev, 12, centralSize);
  writeUint32(ev, 16, centralStart);
  writeUint16(ev, 20, 0);

  return new Blob([...parts, ...centralParts, new Uint8Array(eocd)], { type: "application/zip" });
}
