import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Run B's original finite source contract against this checkout, never a
// proposal fallback or caller-selected product tree.
if (process.argv.length !== 2) throw new Error("Graph source tests accept no mode arguments");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "web/tests/independent-graph-session");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_BIN: path.resolve(process.env.HIER_BIN ?? path.join(root, "core/build/hier")),
};
for (const args of [
  [path.join(directory, "types.mjs")],
  ["--test", path.join(directory, "runtime.test.mjs"), path.join(directory, "input.test.mjs")],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Graph source tests terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
