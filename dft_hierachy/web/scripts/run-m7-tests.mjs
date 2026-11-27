// Bind B's unchanged tests to this checkout; do not interpret or replace its oracle.
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mode = process.argv[2];
if (process.argv.length !== 3 || !["unit", "electron"].includes(mode))
  throw new Error("Usage: run-m7-tests.mjs unit|electron");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_BIN: process.env.HIER_BIN ?? path.join(root, "core/build/hier"),
};
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`M7 ${mode} tests terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === "unit") {
  run([
    "--test",
    "--test-concurrency=1",
    "web/tests/independent-m7/resources.test.mjs",
    "web/tests/independent-m7/demo-config.test.mjs",
  ]);
  run(["web/tests/independent-m7/verify-types.mjs"]);
} else {
  env.HIER_B_M7_EVIDENCE ??= mkdtempSync(path.join(tmpdir(), "hier-m7-electron-"));
  console.log(`M7 Electron evidence: ${env.HIER_B_M7_EVIDENCE}`);
  run(["--test", "--test-concurrency=1", "web/tests/independent-m7/electron.test.mjs"]);
}
