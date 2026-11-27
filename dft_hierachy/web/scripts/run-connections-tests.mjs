// Standard entry: use the current product with B's unmodified frozen inputs.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "web/tests/independent-connections");
const mode = process.argv[2];
if (!["model", "core", "controls"].includes(mode) || process.argv.length !== 3)
  throw new Error("Expected model, core or controls test mode");
for (const file of [
  "run.mjs",
  "cases.mjs",
  "harness.mjs",
  "verify-types.mjs",
  "types.ts",
  "core.mjs",
  "b_object_connections.sv",
  "fixture-check.test.mjs",
]) {
  if (!statSync(path.join(directory, file)).isFile())
    throw new Error(`Missing connection test input: ${file}`);
}
const commands =
  mode === "model"
    ? [
        [path.join(directory, "verify-types.mjs"), "production"],
        [path.join(directory, "run.mjs")],
      ]
    : mode === "core"
      ? [[path.join(directory, "core.mjs"), "model"]]
      : [["--test", path.join(directory, "fixture-check.test.mjs")]];
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_BIN: path.resolve(
    process.env.HIER_BIN ?? path.join(root, "core/build/hier"),
  ),
};
for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`Connection tests terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
