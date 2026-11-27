import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// B's unmodified 12 model / 20 type / 16 browser cases and native Worker input control.
if (process.argv.length !== 2) throw new Error("Schematic view tests accept no mode arguments");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "web/tests/independent-schematic-view");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: path.join(root, "web"),
  HIER_BIN: path.resolve(process.env.HIER_BIN ?? path.join(root, "core/build/hier")),
};
for (const args of [
  [path.join(directory, "types.mjs")],
  ["--test", path.join(directory, "runtime.test.mjs")],
  [path.join(directory, "run.mjs"), "--controls"],
  [path.join(directory, "run.mjs")],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Schematic view tests terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
