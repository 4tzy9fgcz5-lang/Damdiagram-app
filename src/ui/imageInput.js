// Kleine, gedeelde hulpfuncties voor het inladen van een foto — gebruikt door
// zowel de losse foto-import als de bulk-import (per-diagram stap), zonder dat
// die twee bestanden van elkaar hoeven te importeren.

export const WORKING_MAX_SIDE = 1400;

export async function loadDrawable(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kon de foto niet openen."));
      img.src = URL.createObjectURL(file);
    });
  }
}

export function drawableSize(drawable) {
  return { width: drawable.width ?? drawable.naturalWidth, height: drawable.height ?? drawable.naturalHeight };
}
