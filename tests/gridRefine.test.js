import { describe, it, assertTrue } from "./test-runner.js?v=20260920m";
import { refineGrid } from "../src/recognition/gridRefine.js?v=20260920m";

// Bouwt een schaakbordpatroon van `size + 200` op een apart canvas en snijdt daar
// een venster van `size` uit, verschoven met (shiftX, shiftY) t.o.v. het midden.
// Zo simuleren we precies wat er gebeurt als de 4 aangewezen hoeken net niet exact
// op de speelveldrand zaten: het rechtgetrokken beeld toont het echte bordpatroon
// een paar pixels verschoven t.o.v. het aangenomen 10x10-raster.
function shiftedCheckerboard(size, cell, shiftX, shiftY) {
  const margin = 100;
  const big = document.createElement("canvas");
  big.width = size + margin * 2;
  big.height = size + margin * 2;
  const bigCtx = big.getContext("2d");
  const cols = Math.ceil(big.width / cell);
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      bigCtx.fillStyle = (row + col) % 2 === 0 ? "#101010" : "#f0f0f0";
      bigCtx.fillRect(col * cell, row * cell, cell, cell);
    }
  }

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  out.getContext("2d").drawImage(big, margin + shiftX, margin + shiftY, size, size, 0, 0, size, size);
  return out;
}

describe("raster-verfijning na rechttrekken", () => {
  it("vindt een kleine verschuiving van het schaakbordpatroon terug", () => {
    const size = 500;
    const shiftX = 6;
    const shiftY = -6;
    const canvas = shiftedCheckerboard(size, 50, shiftX, shiftY);

    const result = refineGrid(canvas);

    assertTrue(result.improved, "verwachtte een gevonden verbetering");
    assertTrue(Math.abs(result.dx - -shiftX) < 3, `dx: ${result.dx} (verwacht rond ${-shiftX})`);
    assertTrue(Math.abs(result.dy - -shiftY) < 3, `dy: ${result.dy} (verwacht rond ${-shiftY})`);
    assertTrue(Math.abs(result.scale - 1) < 0.02, `scale week te veel af: ${result.scale}`);
    assertTrue(Math.abs(result.rotationDeg) < 1, `rotatie week te veel af: ${result.rotationDeg}`);
    assertTrue(result.canvas.width === size && result.canvas.height === size, "gecorrigeerd beeld heeft de verkeerde afmeting");
  });

  it("laat een al goed uitgelijnd raster met rust", () => {
    const size = 500;
    const canvas = shiftedCheckerboard(size, 50, 0, 0);

    const result = refineGrid(canvas);

    assertTrue(Math.abs(result.dx) < 3, `dx dreef te veel af bij een al goed raster: ${result.dx}`);
    assertTrue(Math.abs(result.dy) < 3, `dy dreef te veel af bij een al goed raster: ${result.dy}`);
  });

  it("vindt ook een kleine schaalfout terug", () => {
    const size = 500;
    // Iets groter geplaatst schaakbord (kleinere cel) simuleert dat het rechtgetrokken
    // beeld net iets kleiner uitkomt dan het aangenomen raster.
    const canvas = shiftedCheckerboard(size, 49, 0, 0);

    const result = refineGrid(canvas);

    assertTrue(result.improved, "verwachtte een gevonden verbetering bij een schaalfout");
  });
});
