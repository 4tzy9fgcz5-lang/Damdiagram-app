import { getAllHerkenningCorrecties } from "../db/herkenningLog.js?v=20260920p";
import { boardToLabelLine } from "../recognition/labelFormat.js?v=20260920p";
import { buildRawFieldCrops } from "../recognition/debugRender.js?v=20260920p";
import { buildZip } from "./zip.js?v=20260920p";

// Zet het herkenningslog (zie herkenningLog.js — logt bij elke foto-opslag
// automatisch het rechtgetrokken beeld, de uiteindelijke stand en de boekstijl) om
// naar precies de bestandsindeling die `damscan/train.js` verwacht: een labels.txt
// plus een crops/<diagram>/<veld>.png per diagram. Uitpakken in de project-root
// (crops/ en labels.txt overschrijven de vorige set) en daarna
// `node damscan/train.js` opnieuw draaien.
function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kon een opgeslagen foto niet laden."));
    img.src = dataUrl;
  });
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Kon een veld niet omzetten naar PNG."));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/png");
  });
}

// @returns {null} als het logboek leeg is, anders { blob, count }
export async function buildTrainingZip() {
  const records = (await getAllHerkenningCorrecties()).filter((r) => r.foto && r.finalBoard);
  if (!records.length) return null;

  const entries = [];
  const labelLines = [];
  let i = 0;
  for (const record of records) {
    i++;
    const photoName = `diag${String(i).padStart(2, "0")}`;
    const img = await loadImageFromDataUrl(record.foto);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);

    for (const { field, canvas: cropCanvas } of buildRawFieldCrops(canvas)) {
      const bytes = await canvasToPngBytes(cropCanvas);
      entries.push({ name: `crops/${photoName}/${String(field).padStart(2, "0")}.png`, data: bytes });
    }
    labelLines.push(boardToLabelLine(photoName, record.finalBoard, record.boekstijl || undefined));
  }

  entries.push({ name: "labels.txt", data: new TextEncoder().encode(labelLines.join("\n") + "\n") });
  return { blob: buildZip(entries), count: records.length };
}

export async function countTrainingRecords() {
  const records = await getAllHerkenningCorrecties();
  return records.filter((r) => r.foto && r.finalBoard).length;
}
