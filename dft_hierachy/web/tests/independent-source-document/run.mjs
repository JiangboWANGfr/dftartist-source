import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cases } from "./cases.mjs";
import "./lifecycle.mjs";
import "./diagnostics.mjs";
import "./boundaries.mjs";
import { coreCases, releaseCore } from "./core-cases.mjs";
import { boot, releaseAll, tick, product } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
const selected = process.argv.includes("--core") ? coreCases : cases;
const inventory = {
  kind: process.argv.includes("--core")
    ? "real-model-SDK-Node-Core"
    : "controlled-public-Transport-real-SDK-model-NOT-Core/Electron",
  count: selected.length,
  cases: selected.map(({ run, ...row }) => row),
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
      stage: "public-export-capability",
      results: [],
    },
    unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  try {
    await boot();
    if (process.argv.includes("--core")) {
      report.stage = "B-owned-fixed-Core-capability";
      assert.ok(process.env.HIER_BIN, "explicit B-owned HIER_BIN required");
      fs.accessSync(process.env.HIER_BIN, fs.constants.X_OK);
      assert.ok(
        fs
          .realpathSync(process.env.HIER_BIN)
          .startsWith(fs.realpathSync(path.join(product, "core")) + path.sep),
        "Core binary must belong to the fixed product tree",
      );
    }
    report.stage = "product-model-semantics";
    for (const entry of selected) {
      let timer, problem;
      const before = unhandled.length;
      try {
        await Promise.race([
          entry.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B watchdog, not product SLA: " + entry.id)),
              20000,
            );
          }),
        ]);
      } catch (e) {
        problem = describeFailure(e);
      } finally {
        clearTimeout(timer);
        try {
          await releaseAll();
          await releaseCore();
          await tick();
          if (unhandled.length !== before)
            throw Error(
              "unexpected unhandled rejection(s): " +
                (unhandled.length - before),
            );
        } catch (e) {
          problem = { primary: problem, cleanup: describeFailure(e) };
        }
      }
      report.executed++;
      report.results.push({
        id: entry.id,
        pass: !problem,
        ...(problem ? { error: problem } : {}),
      });
    }
    report.passed = report.results.filter((r) => r.pass).length;
    report.failed = report.executed - report.passed;
    assert.equal(report.failed, 0, "independent Source semantic failures");
    report.exitCode = 0;
  } catch (e) {
    report.exitCode = 1;
    report.error = describeFailure(e);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
