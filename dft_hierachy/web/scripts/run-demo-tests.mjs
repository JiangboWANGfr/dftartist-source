import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const web = path.join(root, "web");
const env = {
  ...process.env,
  HIER_B_PRODUCT_ROOT: root,
  HIER_B_BROWSER_TOOLS: web,
  HIER_BIN: process.env.HIER_BIN ?? path.join(root, "core/build/hier"),
  HIER_B_DEMO_ENTRY: path.join(web, "apps/demo/dist/main.mjs"),
  HIER_B_DEMO_TYPES: path.join(web, "apps/demo/dist/types/bridge.d.ts"),
};
for (const args of [
  ["--test", "tests/demo-pack.test.mjs"],
  ["tests/independent-demo-shell/types.mjs"],
  [
    "--test",
    "tests/independent-demo-shell/facility.test.mjs",
    "tests/independent-demo-shell/core-control.test.mjs",
  ],
  ["tests/independent-demo-shell/result-focus-regression.mjs"],
  ["tests/independent-demo-shell/run.mjs"],
]) {
  const child = spawnSync(process.execPath, args, { cwd: web, env, stdio: "inherit" });
  if (child.error) console.error(child.error);
  if (child.status !== 0) process.exit(child.status ?? 1);
}
