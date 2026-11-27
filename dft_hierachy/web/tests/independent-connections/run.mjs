import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { product, capability, releaseAll } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      { count: cases.length, cases: cases.map(({ run, ...x }) => x) },
      null,
      2,
    ),
  );
else {
  const report = {
    product,
    node: process.version,
    plannedCases: cases.length,
    executedCases: 0,
    blockedCases: cases.length,
    skippedCases: 0,
    results: [],
  };
  try {
    report.stage = "production-export-capability";
    capability();
    report.stage = "production-model-semantics";
    for (const c of cases) {
      let timer,
        timedOut = false;
      const work = Promise.resolve().then(() => c.run());
      try {
        await Promise.race([
          work,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(Error("B watchdog " + c.id));
            }, 20000);
          }),
        ]);
        report.results.push({ id: c.id, pass: true });
      } catch (e) {
        report.results.push({
          id: c.id,
          pass: false,
          error: describeFailure(e),
        });
      } finally {
        clearTimeout(timer);
        try {
          await releaseAll();
        } catch (e) {
          report.results.push({
            id: c.id + "-cleanup",
            pass: false,
            error: describeFailure(e),
          });
        }
      }
      report.executedCases++;
      report.blockedCases--;
      if (timedOut) {
        let drainTimer;
        try {
          report.watchdogCaseSettled = await Promise.race([
            work.then(
              () => true,
              () => true,
            ),
            new Promise((resolve) => {
              drainTimer = setTimeout(() => resolve(false), 1000);
            }),
          ]);
        } finally {
          clearTimeout(drainTimer);
        }
        throw Error("B runner stops after watchdog; remaining cases blocked");
      }
    }
    assert.equal(report.results.filter((x) => !x.pass).length, 0);
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = describeFailure(e);
  }
  process.exitCode = report.exitCode;
  const output = JSON.stringify(report, null, 2);
  if (report.watchdogCaseSettled === false)
    process.stdout.write(output + "\n", () => process.exit(1));
  else console.log(output);
}
