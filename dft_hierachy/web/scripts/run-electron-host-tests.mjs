// Run B's frozen inputs unchanged against this product. No missing-capability skip.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const mode = process.argv[2] ?? "unit";
assert(["unit", "core", "e2e"].includes(mode), "expected unit, core or e2e");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_ELECTRON_TYPES: require.resolve("electron/electron.d.ts"),
  HIER_BIN: process.env.HIER_BIN ?? root + "core/build/hier",
};
const testRoot = "web/tests/independent-electron-host/";
function run(args, count) {
  const child = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(child.stdout ?? "");
  process.stderr.write(child.stderr ?? "");
  if (child.error) throw child.error;
  if (child.status !== 0 || child.signal) process.exit(child.status || 1);
  if (count !== undefined) {
    const report = JSON.parse(child.stdout);
    for (const key of ["planned", "executed", "passed"]) assert.equal(report[key], count, key);
    for (const key of ["failed", "blocked", "skipped", "exitCode"])
      assert.equal(report[key], 0, key);
    if (report.cleanupErrors !== undefined) assert.deepEqual(report.cleanupErrors, []);
  }
}
if (mode === "unit") {
  run([testRoot + "types.mjs"], 16);
  run([testRoot + "run-host.mjs"], 25);
  run([testRoot + "run-host.mjs", "--preload"], 10);
  run([testRoot + "run-text.mjs"], 15);
  run(["--test", "--test-reporter=tap", testRoot + "facility.test.mjs"]);
} else if (mode === "core") {
  run(["--test", "--test-reporter=tap", testRoot + "text-core.test.mjs"]);
} else {
  env.HIER_B_ELECTRON_BIN = require("electron");
  const version = spawnSync(env.HIER_B_ELECTRON_BIN, ["--version"], {
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(version.status, 0, "actual Electron must start");
  assert.equal(version.stdout.trim(), "v" + require("electron/package.json").version);
  console.log(JSON.stringify({ electron: version.stdout.trim(), binary: env.HIER_B_ELECTRON_BIN }));
  run([testRoot + "run-e2e.mjs"], 1);
}
