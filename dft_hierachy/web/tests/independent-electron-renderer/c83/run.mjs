import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "../public-entry.mjs";
import { context } from "../fixture.mjs";
import { cases } from "./cases.mjs";
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      {
        kind: "B C83 public input metadata; NOT Electron IPC",
        count: cases.length,
        cases: cases.map(({ run, ...row }) => row),
      },
      null,
      2,
    ),
  );
else {
  const report = {
    kind: "B C83 public renderer closed-send; NOT Electron IPC",
    planned: cases.length,
    executed: 0,
    skipped: 0,
    stage: "public-export-capability",
    results: [],
  };
  try {
    assert.equal(process.versions.node.split(".")[0], "24");
    assert.ok(process.env.HIER_B_PRODUCT_ROOT);
    const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
      renderer = await import(
        publicEntry(product, "@hier/client/electron/renderer")
      ),
      sdk = await import(publicEntry(product, "@hier/client"));
    assert.equal(typeof renderer.connectElectronTransport, "function");
    report.stage = "public-runtime-cases";
    for (const entry of cases) {
      const own = context(renderer.connectElectronTransport, sdk);
      let timer, problem;
      try {
        await Promise.race([
          entry.run(own),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("B watchdog only, not product SLA")),
              15000,
            );
          }),
        ]);
      } catch (error) {
        problem = String(error?.stack ?? error);
      } finally {
        clearTimeout(timer);
        try {
          await own.cleanup();
        } catch (error) {
          problem =
            (problem ?? "") + "\ncleanup: " + String(error?.stack ?? error);
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
    report.exitCode = report.failed ? 1 : 0;
  } catch (error) {
    report.exitCode = 1;
    report.error = String(error?.stack ?? error);
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
