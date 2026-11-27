import assert from "node:assert/strict";
import { cases as added } from "./cases.mjs";
import { boot, H } from "../harness.mjs";
import { describeFailure } from "../../independent-tree-view/ui/resource-cleanup.mjs";
let selected = added;
if (process.argv.includes("--all")) {
  const { cases: old } = await import("../cases.mjs");
  await import("../ready.mjs");
  await import("../observers.mjs");
  await import("../diagnostics.mjs");
  selected = [...old, ...added];
}
const inventory = {
  kind: "independent-ready-baseline-real-Navigation-SDK-controlled-Transport-NOT-Core/Electron",
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
      stage: "public-Navigation-capability",
      results: [],
    },
    unhandled = [];
  const handler = (e) => unhandled.push(e);
  process.on("unhandledRejection", handler);
  try {
    await boot();
    r.stage = "Navigation-ready-baseline-semantics";
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
          await H.tick();
          assert.equal(unhandled.length, n);
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
    process.removeListener("unhandledRejection", handler);
  }
  process.exitCode = r.exitCode;
  console.log(JSON.stringify(r, null, 2));
}
