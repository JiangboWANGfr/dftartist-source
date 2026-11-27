import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
/** Execute the original frozen paging gates against this checkout. */
export function runPagedModelTests(label, directoryName) {
  const directory = path.join(root, "web/tests", directoryName);
  const mode = process.argv[2];
  if (
    !["model", "core", "controls"].includes(mode) ||
    process.argv.length !== 3
  )
    throw new Error("Expected model, core or controls test mode");
  for (const file of [
    "run.mjs",
    "cases.mjs",
    "harness.mjs",
    "verify-types.mjs",
    "types.ts",
    "core.mjs",
    "input.mjs",
    "proposal.d.ts",
    "fixture-controls.test.mjs",
    "core-controls.test.mjs",
  ]) {
    if (!statSync(path.join(directory, file)).isFile())
      throw new Error(`Missing ${label.toLowerCase()} test input: ${file}`);
  }
  const commands =
    mode === "model"
      ? [
          [path.join(directory, "verify-types.mjs"), "production"],
          [path.join(directory, "run.mjs")],
        ]
      : mode === "core"
        ? [[path.join(directory, "run.mjs"), "--core"]]
        : [
            [
              "--test",
              "--test-timeout=30000",
              path.join(directory, "fixture-controls.test.mjs"),
            ],
            [
              "--test",
              "--test-timeout=60000",
              path.join(directory, "core-controls.test.mjs"),
            ],
          ];
  const env = {
    ...process.env,
    HIER_B_PRODUCT_ROOT: root,
    HIER_B_BROWSER_TOOLS: path.join(root, "web"),
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
      console.error(`${label} tests terminated by ${result.signal}`);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
