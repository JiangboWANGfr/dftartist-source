// Standard gates run unchanged B inputs against this checkout and its fixed tools.
import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = "web/tests/independent-source-view/";
const position = "web/tests/independent-source-position-interaction/";
const modes = {
  model: [
    [directory + "verify-types.mjs", "production"],
    [directory + "run.mjs"],
    [directory + "q1q2/run.mjs"],
    [directory + "scale/run.mjs"],
    [position + "verify-types.mjs", "production"],
    [position + "run.mjs"],
  ],
  package: [[directory + "package.mjs"], [position + "package.mjs"]],
  controls: [
    [
      "--test",
      directory + "inventory.test.mjs",
      directory + "q1q2/inventory.test.mjs",
    ],
    [directory + "q1q2/verify-fixtures.mjs"],
    [directory + "run.mjs", "--self-check"],
    [directory + "q1q2/run.mjs", "--self-check"],
    ["--test", position + "inventory.test.mjs"],
    [position + "run.mjs", "--controls"],
    [position + "verify-observation.mjs"],
  ],
};
const mode = process.argv[2];
if (!Object.hasOwn(modes, mode) || process.argv.length !== 3)
  throw new Error(
    "Expected exactly one SourceView mode: model/package/controls",
  );
const commands = modes[mode];

function npmExecutable() {
  const source =
    process.env.HIER_B_NPM_BIN !== undefined
      ? "HIER_B_NPM_BIN"
      : process.env.npm_execpath !== undefined
        ? "npm_execpath"
        : "PATH";
  const value = source === "PATH" ? "npm" : process.env[source];
  const candidates = !value
    ? []
    : isAbsolute(value) || value.includes(sep)
      ? [resolve(value)]
      : (process.env.PATH?.split(delimiter) ?? []).map((directory) =>
          resolve(directory, value),
        );
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // PATH may contain missing or inaccessible entries; try its next entry.
    }
  }
  throw new Error(
    `Cannot resolve executable npm for SourceView package from ${source}: ${JSON.stringify(value)}`,
  );
}

// Check every explicit input before launching any subset. Node --test can
// otherwise ignore one missing path when another input exists.
for (const args of commands)
  for (const file of args[0] === "--test" ? args.slice(1) : [args[0]]) {
    const required = resolve(root, file);
    accessSync(required, constants.R_OK);
    if (!statSync(required).isFile())
      throw new Error(`Required SourceView input is not a file: ${required}`);
  }

const packageEnv =
  mode === "package"
    ? {
        HIER_B_NPM_BIN: npmExecutable(),
        // Every package-gate dependency is supplied as a local tarball. Avoid
        // registry lookups so this consumer check also works without a mirror.
        npm_config_offline: "true",
      }
    : {};

for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      HIER_B_PRODUCT_ROOT: root,
      HIER_B_BROWSER_TOOLS: resolve(root, "web"),
      ...packageEnv,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`SourceView ${mode} tests terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
