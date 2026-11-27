import assert from "node:assert/strict";
import path from "node:path";
import { publicEntry } from "./public-entry.mjs";
import { cases } from "./cases.mjs";
import { context } from "./fixture.mjs";
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify(
      {
        kind: "renderer-unit-and-real-SDK-inputs-NOT-Electron-IPC",
        count: cases.length,
        cases: cases.map(({ run, ...metadata }) => metadata),
      },
      null,
      2,
    ),
  );
} else {
  const report = {
    kind: "B-electron-renderer-public-blackbox",
    planned: cases.length,
    executed: 0,
    skipped: 0,
    results: [],
    stage: "public-export-capability",
  };
  try {
    assert.equal(process.versions.node.split(".")[0], "24");
    assert.ok(
      process.env.HIER_B_PRODUCT_ROOT,
      "explicit B fixed product root required",
    );
    const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
    const resolve = (specifier) => publicEntry(product, specifier);
    // Resolve actual public ESM exports in the product's package scope; no path fallback.
    const module = await import(resolve("@hier/client/electron/renderer")),
      sdk = await import(resolve("@hier/client"));
    assert.equal(typeof module.connectElectronTransport, "function");
    assert.equal(typeof sdk.HierClient, "function");
    report.stage = "public-runtime-cases";
    for (const entry of cases) {
      const own = context(module.connectElectronTransport, sdk);
      let timer, problem;
      try {
        await Promise.race([
          entry.run(own),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("B test watchdog (not product SLA)")),
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
    assert.equal(
      report.results.filter((r) => !r.pass).length,
      0,
      "independent renderer failures",
    );
    report.exitCode = 0;
  } catch (error) {
    report.exitCode = 1;
    report.error = {
      code: error?.code,
      message: String(error?.message ?? error),
      stderr: Buffer.isBuffer(error?.stderr)
        ? error.stderr.toString("utf8")
        : undefined,
    };
  }
  process.exitCode = report.exitCode;
  console.log(JSON.stringify(report, null, 2));
}
