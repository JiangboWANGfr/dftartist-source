import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// B's unmodified 22 runtime / 20 type / one native Worker consumer collection.
if (process.argv.length !== 2) throw new Error("Layout tests accept no mode arguments");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "web/tests/independent-layout");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: path.join(root, "web"),
  HIER_BIN: path.resolve(process.env.HIER_BIN ?? path.join(root, "core/build/hier")),
};
for (const args of [
  [path.join(directory, "types.mjs")],
  ["--test", path.join(directory, "runtime.test.mjs")],
  [path.join(directory, "package.mjs")],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Layout tests terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
