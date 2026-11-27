import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// B93's unmodified 24 runtime / 20 type cases and legal original-input control.
if (process.argv.length !== 2) throw new Error("Fold projection tests accept no mode arguments");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "web/tests/independent-fold-projection");
for (const args of [
  [path.join(directory, "types.mjs")],
  ["--test", path.join(directory, "runtime.test.mjs")],
  ["--test", path.join(directory, "control.test.mjs")],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, HIER_B_PRODUCT_ROOT: root },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Fold projection tests terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
