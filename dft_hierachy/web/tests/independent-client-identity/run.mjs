import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import {
  boot,
  sdk,
  releaseAll,
} from "../independent-source-document/harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        kind: "B-public-identity-draft-inputs-approval-separate",
        count: cases.length,
        cases: cases.map(({ run, ...c }) => c),
      },
      null,
      2,
    ),
  );
else {
  const report = {
    kind: "B-public-isHierError-blackbox-approval-separate",
    planned: cases.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    stage: "public-export-capability",
    results: [],
  };
  try {
    await boot(false);
    assert.equal(typeof sdk.isHierError, "function");
    report.stage = "public-contract-inputs";
    for (const c of cases) {
      let timer, problem;
      try {
        await Promise.race([
          c.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B identity watchdog, not SLA")),
              10000,
            );
          }),
        ]);
      } catch (e) {
        problem = describeFailure(e);
      } finally {
        clearTimeout(timer);
        try {
          await releaseAll();
        } catch (e) {
          problem = { primary: problem, cleanup: describeFailure(e) };
        }
      }
      report.executed++;
      report.results.push({
        id: c.id,
        pass: !problem,
        ...(problem ? { error: problem } : {}),
      });
    }
    report.passed = report.results.filter((r) => r.pass).length;
    report.failed = report.executed - report.passed;
    assert.equal(report.failed, 0);
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = describeFailure(e);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
