import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// B97's original 12 model / 24 type / 12 DOM / 1 native roundtrip / 1 input control.
if (process.argv.length !== 2) throw new Error("Folded layout/view tests accept no mode arguments");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "web/tests/independent-fold-layout-view");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: path.join(root, "web"),
};
let failed = false;
for (const args of [
  [path.join(directory, "types.mjs")],
  ["--test", path.join(directory, "runtime.test.mjs")],
  [path.join(directory, "run.mjs"), "--controls"],
  [path.join(directory, "run.mjs")],
  [path.join(directory, "run.mjs"), "--native"],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Folded layout/view tests terminated by ${result.signal}`);
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
