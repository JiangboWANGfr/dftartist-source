import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cases } from "./cases.mjs";
import "./ready.mjs";
import "./observers.mjs";
import "./diagnostics.mjs";
import { coreCases, releaseCore } from "./core.mjs";
import { boot, H } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
const core = process.argv.includes("--core"),
  selected = core ? coreCases : cases;
const inventory = {
  kind: core
    ? "real-Navigation-SDK-Node-Core"
    : "real-Navigation-SDK-controlled-Transport-NOT-Core/Electron",
  count: selected.length,
  cases: selected.map(({ run, ...c }) => c),
};
if (process.argv.includes("--list"))
  console.log(JSON.stringify(inventory, null, 2));
else {
  const report = {
      kind: inventory.kind,
      planned: selected.length,
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      stage: "public-Navigation-capability",
      results: [],
    },
    unhandled = [];
  const handler = (e) => unhandled.push(e);
  process.on("unhandledRejection", handler);
  try {
    await boot();
    if (core) {
      report.stage = "B-owned-Core-capability";
      assert.ok(process.env.HIER_BIN);
      fs.accessSync(process.env.HIER_BIN, fs.constants.X_OK);
      assert.ok(
        fs
          .realpathSync(process.env.HIER_BIN)
          .startsWith(fs.realpathSync(path.join(H.product, "core")) + path.sep),
      );
    }
    report.stage = "Navigation-product-semantics";
    for (const row of selected) {
      let timer, problem;
      const n = unhandled.length;
      try {
        await Promise.race([
          row.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B watchdog, not SLA: " + row.id)),
              15000,
            );
          }),
        ]);
      } catch (e) {
        problem = describeFailure(e);
      } finally {
        clearTimeout(timer);
        try {
          await H.releaseAll();
          await releaseCore();
          await H.tick();
          assert.equal(unhandled.length, n);
        } catch (e) {
          problem = { primary: problem, cleanup: describeFailure(e) };
        }
      }
      report.executed++;
      report.results.push({
        id: row.id,
        pass: !problem,
        ...(problem ? { error: problem } : {}),
      });
    }
    report.passed = report.results.filter((x) => x.pass).length;
    report.failed = report.executed - report.passed;
    assert.equal(report.failed, 0);
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = describeFailure(e);
  } finally {
    process.removeListener("unhandledRejection", handler);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
