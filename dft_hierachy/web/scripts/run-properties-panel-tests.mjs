// Run B54's frozen inputs against the built public packages without adaptation.
import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const base = "web/tests/independent-properties-panel/";
const modes = {
  model: [[base + "types.mjs", "production"], [base + "run.mjs"]],
  controls: [
    ["--test", base + "facility.test.mjs"],
    [base + "run.mjs", "--controls"],
  ],
  package: [[base + "package.mjs"]],
};
const mode = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(modes, mode))
  throw new Error("Expected one PropertiesPanel mode: model/controls/package");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: resolve(root, "web"),
  HIER_BIN: process.env.HIER_BIN ?? resolve(root, "core/build/hier"),
};
if (mode === "package") {
  const requested = process.env.HIER_B_NPM_BIN ?? "npm";
  const candidates =
    isAbsolute(requested) || requested.includes("/")
      ? [resolve(requested)]
      : (process.env.PATH ?? "")
          .split(delimiter)
          .map((dir) => resolve(dir, requested));
  env.HIER_B_NPM_BIN = candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!env.HIER_B_NPM_BIN)
    throw new Error("Cannot resolve npm for PropertiesPanel package checks");
}
for (const args of modes[mode]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal)
    throw new Error(`PropertiesPanel gate terminated: ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
