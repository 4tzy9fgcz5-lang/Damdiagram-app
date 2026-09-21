import { describe, it, assertEqual, assertTrue } from "./test-runner.js?v=20260921am";
import { buildGridOverlay, buildFieldCrops, buildRawFieldCrops } from "../src/recognition/debugRender.js?v=20260921am";
import { createEmptyBoard, PIECE_TYPES } from "../src/core/board.js?v=20260921am";

function makeWarpedCanvas(size = 300) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#C4C4C4";
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

describe("fotoherkenning: debug-weergave", () => {
  it("bouwt een raster-overlay met dezelfde afmetingen als het rechtgetrokken beeld", () => {
    const warped = makeWarpedCanvas(300);
    const grid = buildGridOverlay(warped);
    assertEqual(grid.width, 300);
    assertEqual(grid.height, 300);
  });

  it("bouwt precies 50 velduitsnedes, met het juiste label en onzeker-markering", () => {
    const warped = makeWarpedCanvas(300);
    const board = createEmptyBoard();
    board[13] = PIECE_TYPES.WHITE_PIECE;
    board[1] = PIECE_TYPES.BLACK_PIECE;
    const confidences = new Array(51).fill(0.9);
    confidences[1] = 0.3;

    const crops = buildFieldCrops(warped, board, confidences, [1]);
    assertEqual(crops.length, 50);
    const field13 = crops.find((c) => c.field === 13);
    const field1 = crops.find((c) => c.field === 1);
    const field2 = crops.find((c) => c.field === 2);
    assertEqual(field13.label, "witte schijf");
    assertTrue(!field13.uncertain);
    assertEqual(field1.label, "zwarte schijf");
    assertTrue(field1.uncertain);
    assertEqual(field2.label, "leeg");
  });

  it("zonder opgegeven onzekere velden is niets onzeker", () => {
    const warped = makeWarpedCanvas(300);
    const board = createEmptyBoard();
    const confidences = new Array(51).fill(0.1);
    const crops = buildFieldCrops(warped, board, confidences);
    assertTrue(crops.every((c) => !c.uncertain));
  });

  it("bouwt 50 losse, ongeïnterpreteerde velduitsnedes", () => {
    const warped = makeWarpedCanvas(300);
    const crops = buildRawFieldCrops(warped);
    assertEqual(crops.length, 50);
    assertEqual(crops[0].canvas.width, 60);
    assertEqual(crops[0].canvas.height, 60);
  });
});
