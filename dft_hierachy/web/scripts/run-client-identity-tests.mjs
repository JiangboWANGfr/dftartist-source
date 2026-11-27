// Bind this checkout for B's runtime inputs; S02 runs the public type consumers.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const result = spawnSync(
  process.execPath,
  ["web/tests/independent-client-identity/run.mjs"],
  {
    cwd: root,
    env: { ...process.env, HIER_B_PRODUCT_ROOT: root },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.signal) {
  console.error(`Client identity tests terminated by ${result.signal}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
