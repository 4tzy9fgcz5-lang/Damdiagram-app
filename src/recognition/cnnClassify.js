// Koppeling van het neurale netwerkje (cnnModel.js) aan de rest van de app: zelfde
// vorm van antwoord als `newClassify.js` (per veld: label, zekerheid, kansen), zodat
// de herkenstap in diagramCaptureView.js elke herkenner op dezelfde manier gebruikt.
//
//   const clf = createCnnClassifier(weightsJson); // damscan/cnn_weights.json
//   const { squares } = clf.classifyBoard(crops);  // 50 crops, veld 1..50
import { classifyBoardCnn, weightsFromJson } from "./cnnModel.js?v=20260923j";

// Onder deze zekerheid krijgt een veld de gele "onzeker"-rand. Op de meting met een
// onbekende boekstijl vangt 0,95 ruim de helft van de fouten bij ~5% gemarkeerde
// velden (zie tools/cnn/report.mjs); 0,98 vangt 68% bij ~7%.
export const CNN_FLAG_BELOW = 0.95;

// Wordt meegelogd bij elke correctie (zie herkenningLog.js). Ophogen bij een nieuw
// damscan/cnn_weights.json of een wijziging aan cnnModel.js.
export const CNN_RECOGNITION_VERSION = "cnn-2026-09-21";

export function createCnnClassifier(weightsJson) {
  const models = weightsJson.models.map(weightsFromJson);
  return {
    classifyBoard(crops) {
      return { squares: classifyBoardCnn(models, crops).map((sq) => ({ ...sq, flagged: sq.confidence < CNN_FLAG_BELOW })) };
    },
  };
}
