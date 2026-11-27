// Standard entry: bind the real product root without changing B's frozen inputs.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
for (const file of [
  "verify-types.mjs",
  "browser-gate.mjs",
  "run.mjs",
  "c82/run.mjs",
  "c83/run.mjs",
  "ber/run.mjs",
  "ber/claim-run.mjs",
]) {
  const result = spawnSync(
    process.execPath,
    ["web/tests/independent-electron-renderer/" + file],
    {
      cwd: root,
      env: { ...process.env, HIER_B_PRODUCT_ROOT: root },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`Renderer tests terminated by ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
