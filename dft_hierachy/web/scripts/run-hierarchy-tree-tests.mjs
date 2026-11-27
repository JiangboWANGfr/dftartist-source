// A standard entry; B's type, UI and L02 assertions are not altered here.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const base = "web/tests/independent-tree-view/";
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_EXPANSION_ADAPTER:
    process.env.HIER_B_EXPANSION_ADAPTER ??
    resolve(root, base, "ui/observed-expansion.mjs"),
};
const modes = {
  model: [
    [base + "verify-tree-view-types.mjs", "production"],
    [base + "ui/l02/run.mjs"],
    [base + "ui/run.mjs", "--c102"],
    [base + "ui/run.mjs"],
  ],
  controls: [
    [base + "ui/run.mjs", "--self-check"],
    [base + "ui/run.mjs", "--core-self-check"],
    [base + "ui/l02/run.mjs", "--self-check"],
  ],
};
const mode = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(modes, mode))
  throw new Error("Expected one HierarchyTree mode: model/controls");
function execute(bin, args) {
  const result = spawnSync(bin, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal)
    throw new Error(`HierarchyTree gate terminated: ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// The original tree freeze owns an isolated toolchain and lockfile. Install it
// only if absent, using that lock; never substitute experiment dependencies.
const toolDirectory = resolve(root, base, "c76/browser");
const require = createRequire(resolve(toolDirectory, "package.json"));
try {
  for (const name of ["esbuild", "playwright", "react", "react-dom"]) {
    if (
      !existsSync(resolve(toolDirectory, "node_modules", name, "package.json"))
    )
      throw new Error(`Missing locked tree fixture tool: ${name}`);
    require.resolve(name + "/package.json");
  }
} catch {
  const npm = process.env.HIER_B_NPM_BIN ?? "npm";
  execute(npm, [
    "--prefix",
    toolDirectory,
    "ci",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--workspaces=false",
  ]);
}
for (const args of modes[mode]) execute(process.execPath, args);
