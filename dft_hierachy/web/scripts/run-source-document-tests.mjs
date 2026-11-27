// Standard entry for unchanged B inputs against this checkout's public packages.
import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mode = process.argv[2];
const suite = process.argv[3] ?? "document";
if (
  mode !== "model" &&
  mode !== "core" &&
  !(
    mode === "controls" &&
    ["position", "navigation", "confirmation"].includes(suite)
  )
)
  throw new Error(
    "Expected model/core mode, or controls for position/navigation/confirmation",
  );
if (
  suite !== "document" &&
  suite !== "candidates" &&
  suite !== "position" &&
  suite !== "navigation" &&
  suite !== "confirmation"
)
  throw new Error(
    "Expected document, candidates, position, navigation or confirmation test suite",
  );
const directory = "web/tests/independent-source-" + suite + "/";
const commands =
  mode === "controls"
    ? [
        [
          "--test",
          directory + "facility.test.mjs",
          suite === "confirmation"
            ? "web/tests/source-confirmation-reentrancy.test.mjs"
            : directory +
              (suite === "navigation"
                ? "ready-baseline/facility.test.mjs"
                : "legacy-regression.test.mjs"),
          ...(suite === "confirmation"
            ? [directory + "recheck/facility.test.mjs"]
            : []),
        ],
      ]
    : mode === "model"
      ? [
          [directory + "verify-types.mjs"],
          suite === "navigation"
            ? [directory + "ready-baseline/run.mjs", "--all"]
            : [directory + "run.mjs"],
          ...(suite === "document" ? [[directory + "recheck/timing.mjs"]] : []),
          ...(suite === "confirmation"
            ? [[directory + "recheck/run.mjs"]]
            : []),
        ]
      : suite === "confirmation"
        ? [
            [directory + "recheck/run.mjs", "--core"],
            ["--test", "web/tests/source-confirmation-core.test.mjs"],
          ]
        : [[directory + "run.mjs", "--core"]];
for (const args of commands) {
  if (args[0] === "--test") {
    // Node --test can silently ignore a missing path when another file matches.
    for (const file of args.slice(1)) {
      const required = resolve(root, file);
      accessSync(required, constants.R_OK);
      if (!statSync(required).isFile())
        throw new Error(`Required source control is not a file: ${required}`);
    }
  }
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, HIER_B_PRODUCT_ROOT: root },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`Source ${suite} tests terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
