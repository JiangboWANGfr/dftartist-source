import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { add } from "./cases.mjs";
for (const mode of [
  "invalid",
  "disposed",
  "cancel",
  "clear",
  "error",
  "notify",
])
  add(
    "original-promise-" + mode,
    "promise-resource",
    { mode },
    "own original Promise internally consumed against unhandled rejection yet caller still observes actual rejection",
    async () => {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(new URL("./unhandled.probe.mjs", import.meta.url)),
          mode,
        ],
        { env: process.env, timeout: 10000, maxBuffer: 1024 * 1024 },
      );
      const r = JSON.parse(stdout);
      assert.deepEqual(r, {
        kind: "original-Promise-child",
        mode,
        unhandled: 0,
        observablyRejected: true,
      });
    },
    "§6.11.3 → §6.9.4 original Promise ownership",
  );
