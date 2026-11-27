import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cases } from "./cases.mjs";
import "./inputs.mjs";
import "./lifecycle.mjs";
import "./diagnostics.mjs";
import "./promise.mjs";
import { coreCases, releaseCore } from "./core.mjs";
import { boot, releaseAll, tick, product } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
const core = process.argv.includes("--core"),
  selected = core ? coreCases : cases;
const inventory = {
  kind: core
    ? "real-model-SDK-Node-Core"
    : "controlled-public-Transport-real-SDK-model-NOT-Core/Electron",
  count: selected.length,
  cases: selected.map(({ run, ...c }) => c),
};
if (process.argv.includes("--list"))
  console.log(JSON.stringify(inventory, null, 2));
else {
  const r = {
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
    if (core) {
      r.stage = "B-owned-fixed-Core-capability";
      assert.ok(process.env.HIER_BIN);
      fs.accessSync(process.env.HIER_BIN, fs.constants.X_OK);
      assert.ok(
        fs
          .realpathSync(process.env.HIER_BIN)
          .startsWith(fs.realpathSync(path.join(product, "core")) + path.sep),
      );
    }
    r.stage = "product-model-semantics";
    for (const row of selected) {
      let timer, problem;
      const before = unhandled.length;
      try {
        await Promise.race([
          row.run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("B watchdog, not product SLA: " + row.id)),
              15000,
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
          assert.equal(unhandled.length, before, "unhandled rejection");
        } catch (e) {
          problem = { primary: problem, cleanup: describeFailure(e) };
        }
      }
      r.executed++;
      r.results.push({
        id: row.id,
        pass: !problem,
        ...(problem ? { error: problem } : {}),
      });
    }
    r.passed = r.results.filter((x) => x.pass).length;
    r.failed = r.executed - r.passed;
    assert.equal(r.failed, 0);
    r.exitCode = 0;
  } catch (e) {
    r.exitCode = 1;
    r.error = describeFailure(e);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
  process.exitCode = r.exitCode;
  console.log(JSON.stringify(r, null, 2));
}
