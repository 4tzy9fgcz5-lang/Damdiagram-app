export function svgToPngDataUrl(svgString, pixelSize) {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelSize;
      canvas.height = pixelSize;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pixelSize, pixelSize);
      ctx.drawImage(img, 0, 0, pixelSize, pixelSize);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob, width: pixelSize, height: pixelSize });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, "image/png");
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("Kon het diagram niet omzetten naar een afbeelding."));
    };
    img.src = url;
  });
}

export async function svgToPngBytes(svgString, pixelSize) {
  const { blob } = await svgToPngDataUrl(svgString, pixelSize);
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}
