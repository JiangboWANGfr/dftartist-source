// Resolve the product once at the standard-entry boundary. B inputs stay unchanged.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mode = process.argv[2];
if (mode !== "model" && mode !== "core")
  throw new Error("Expected model or core test mode");
const commands =
  mode === "model"
    ? [["verify-types.mjs", "production"], ["run.mjs"]]
    : [["core-runtime.mjs"]];
for (const [file, ...args] of commands) {
  const result = spawnSync(
    process.execPath,
    ["web/tests/independent-properties/" + file, ...args],
    {
      cwd: root,
      env: { ...process.env, HIER_B_PRODUCT_ROOT: root },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`Property tests terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
