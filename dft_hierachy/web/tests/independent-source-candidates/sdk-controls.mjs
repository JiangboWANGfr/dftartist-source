// Optional underlying SDK/Core facility evidence, NOT candidate model semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { boot, product } from "./harness.mjs";
import { sdkControls, releaseCore } from "./core.mjs";
const report = {
  kind: "B-fixture-real-SDK-Core-controls-NOT-model-or-Electron",
  planned: sdkControls.length,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  results: [],
};
try {
  await boot(false);
  assert.ok(process.env.HIER_BIN);
  fs.accessSync(process.env.HIER_BIN, fs.constants.X_OK);
  assert.ok(
    fs
      .realpathSync(process.env.HIER_BIN)
      .startsWith(fs.realpathSync(path.join(product, "core")) + path.sep),
  );
  for (const c of sdkControls) {
    let timer, error;
    try {
      await Promise.race([
        c.run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("B Core control watchdog " + c.id)),
            15000,
          );
        }),
      ]);
    } catch (e) {
      error = { name: e?.name, message: e?.message, stack: e?.stack };
    } finally {
      clearTimeout(timer);
      await releaseCore();
    }
    report.executed++;
    report.results.push({
      id: c.id,
      pass: !error,
      ...(error ? { error } : {}),
    });
  }
  report.passed = report.results.filter((x) => x.pass).length;
  report.failed = report.executed - report.passed;
  assert.equal(report.failed, 0);
  report.exitCode = 0;
} catch (e) {
  report.exitCode = 1;
  report.error = { name: e?.name, message: e?.message };
}
process.exitCode = report.exitCode;
console.log(JSON.stringify(report, null, 2));
