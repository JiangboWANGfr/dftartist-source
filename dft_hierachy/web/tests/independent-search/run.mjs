// Existing B public model runner pattern; a capability red does not execute cases.
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { coreCases, releaseCore } from "./core.mjs";
import { boot, releaseAll, tick } from "./harness.mjs";
import { describeFailure } from "../independent-tree-view/ui/resource-cleanup.mjs";
const core = process.argv.includes("--core"),
  selected = core ? coreCases : cases,
  inventory = {
    kind: core
      ? "B60-real-SDK-Core-search-model"
      : "B60-controlled-real-SDK-SearchModel-not-Core/Electron",
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
      blocked: selected.length,
      skipped: 0,
      stage: "public-export-capability",
      results: [],
      cleanupErrors: [],
      exitCode: 1,
    },
    unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  try {
    await boot();
    if (core)
      assert(process.env.HIER_BIN, "explicit B-owned fixed Core required");
    r.stage = "model-semantics";
    for (const row of selected) {
      let timer, error;
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
        error = describeFailure(e);
      } finally {
        clearTimeout(timer);
        try {
          await releaseAll();
          await releaseCore();
          await tick();
          assert.equal(unhandled.length, before, "unhandled rejection");
        } catch (e) {
          error = { primary: error, cleanup: describeFailure(e) };
        }
      }
      r.executed++;
      r.blocked--;
      if (error) r.failed++;
      else r.passed++;
      r.results.push({ id: row.id, pass: !error, ...(error ? { error } : {}) });
    }
    r.exitCode = r.failed ? 1 : 0;
  } catch (e) {
    r.error = describeFailure(e);
  } finally {
    try {
      await releaseAll();
      await releaseCore();
      await tick();
    } catch (e) {
      r.cleanupErrors.push(describeFailure(e));
      r.exitCode = 1;
    }
    process.removeListener("unhandledRejection", onUnhandled);
    r.unhandled = unhandled.length;
    if (r.unhandled) r.exitCode = 1;
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
