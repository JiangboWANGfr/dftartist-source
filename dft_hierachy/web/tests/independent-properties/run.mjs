import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import "./diagnostic-cases.mjs";
import "./subscribe-cases.mjs";
import { capability, product, releaseAll } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      { count: cases.length, cases: cases.map(({ run, ...row }) => row) },
      null,
      2,
    ),
  );
} else {
  const result = {
    product,
    node: process.version,
    plannedCases: cases.length,
    executedCases: 0,
    skippedCases: 0,
    results: [],
  };
  try {
    result.stage = "production-export-capability";
    capability();
    result.stage = "production-model-semantics";
    for (const c of cases) {
      let timer;
      try {
        await Promise.race([
          c.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("B test deadlock watchdog: " + c.id)),
              20000,
            );
          }),
        ]);
        result.results.push({ id: c.id, pass: true });
      } catch (error) {
        result.results.push({
          id: c.id,
          pass: false,
          error: describeFailure(error),
        });
      } finally {
        clearTimeout(timer);
        try {
          await releaseAll();
        } catch (error) {
          result.results.push({
            id: c.id + "-cleanup",
            pass: false,
            error: describeFailure(error),
          });
        }
      }
    }
    result.executedCases = result.results.filter(
      (r) => !r.id.endsWith("-cleanup"),
    ).length;
    assert.equal(
      result.results.filter((r) => !r.pass).length,
      0,
      "property semantic failures",
    );
    result.exitCode = 0;
  } catch (error) {
    result.exitCode = 1;
    result.error = describeFailure(error);
  }
  process.exitCode = result.exitCode;
  console.log(JSON.stringify(result, null, 2));
}
