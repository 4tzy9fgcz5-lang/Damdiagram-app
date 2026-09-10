const suites = [];
let currentSuite = null;

export function describe(name, fn) {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

export function it(name, fn) {
  if (!currentSuite) throw new Error("it() moet binnen describe() staan");
  currentSuite.tests.push({ name, fn });
}

export function assertEqual(actual, expected, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}\nVerwacht: ${e}\nGekregen: ${a}`);
  }
}

export function assertThrows(fn, message = "") {
  try {
    fn();
  } catch (err) {
    return;
  }
  throw new Error(`${message}\nVerwachtte een fout, maar er werd niets gegooid.`);
}

export function assertTrue(value, message = "") {
  if (!value) throw new Error(`${message}\nVerwachtte een waarheidsgetrouwe waarde, kreeg: ${value}`);
}

export async function runAll(outputEl) {
  let passed = 0;
  let failed = 0;
  const lines = [];

  for (const suite of suites) {
    lines.push(`\n${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        passed++;
        lines.push(`  OK   ${test.name}`);
      } catch (err) {
        failed++;
        lines.push(`  FAIL ${test.name}`);
        lines.push(`       ${err.message.split("\n").join("\n       ")}`);
      }
    }
  }

  lines.push(`\n${passed} geslaagd, ${failed} mislukt.`);
  const report = lines.join("\n");
  console.log(report);
  if (outputEl) outputEl.textContent = report;
  window.__TEST_RESULTS__ = { passed, failed };
  return { passed, failed };
}
