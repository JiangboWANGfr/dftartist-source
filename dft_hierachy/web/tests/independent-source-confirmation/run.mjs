import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import "./boundaries.mjs";
import { questions } from "./questions.mjs";
import { boot, N } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
const inventory = cases.map(({ run, ...x }) => x);
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      { count: cases.length, cases: inventory, questions },
      null,
      2,
    ),
  );
else {
  const r = {
      kind: "B-independent-confirmation-real-models-SDK-controlled-Transport-NOT-Core-or-UI",
      planned: cases.length,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: cases.length,
      skipped: 0,
      stage: "public-capability",
      results: [],
    },
    unhandled = [];
  const listener = (e) => unhandled.push(e);
  process.on("unhandledRejection", listener);
  try {
    await boot();
    r.stage = "product-semantics";
    for (const row of cases) {
      let timer, error;
      const before = unhandled.length;
      try {
        await Promise.race([
          row.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B watchdog not SLA: " + row.id)),
              10000,
            );
          }),
        ]);
      } catch (e) {
        error = describeFailure(e);
      } finally {
        clearTimeout(timer);
        try {
          await N.H.releaseAll();
          await N.turn();
          assert.equal(unhandled.length, before);
        } catch (e) {
          error = { primary: error, cleanup: describeFailure(e) };
        }
      }
      r.executed++;
      r.results.push({ id: row.id, pass: !error, ...(error ? { error } : {}) });
    }
    r.passed = r.results.filter((x) => x.pass).length;
    r.failed = r.executed - r.passed;
    r.blocked = r.planned - r.executed;
    assert.equal(r.failed, 0);
    r.exitCode = 0;
  } catch (e) {
    r.exitCode = 1;
    r.error = describeFailure(e);
  } finally {
    process.removeListener("unhandledRejection", listener);
  }
  process.exitCode = r.exitCode;
  console.log(JSON.stringify(r, null, 2));
}
