// B31 independent runner. No A test entry or substitute model.
import assert from "node:assert/strict";
import { q1Cases } from "./q1.mjs";
import { coreCases } from "./core.mjs";
import { ResourceFailure } from "./resource-scope.mjs";
import { boot, N } from "../harness.mjs";
import { describeFailure } from "../../independent-tree-view/ui/resource-cleanup.mjs";
const core = process.argv.includes("--core"),
  cases = core ? coreCases : q1Cases;
const inventory = {
  kind: core
    ? "B31-real-Core-confirmation"
    : "B31-Q1-public-SDK-controlled-Transport",
  count: cases.length,
  cases: cases.map(({ run, ...c }) => c),
};
if (process.argv.includes("--list"))
  console.log(JSON.stringify(inventory, null, 2));
else {
  const r = {
      kind: inventory.kind,
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
    for (const c of cases) {
      const n = unhandled.length;
      let error, details, timer;
      try {
        details = core
          ? await c.run()
          : await Promise.race([
              c.run(),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(Error("B case watchdog, not SLA: " + c.id)),
                  30000,
                );
              }),
            ]);
      } catch (e) {
        error = describeFailure(e);
        if (e instanceof ResourceFailure) error.scope = e.diagnostic;
      } finally {
        clearTimeout(timer);
        try {
          await N.H.releaseAll();
          await N.turn();
          assert.equal(unhandled.length, n);
        } catch (e) {
          error = { primary: error, cleanup: describeFailure(e) };
        }
      }
      r.executed++;
      r.results.push({
        id: c.id,
        pass: !error,
        ...(error ? { error } : { details }),
      });
    }
    r.passed = r.results.filter((c) => c.pass).length;
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
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
