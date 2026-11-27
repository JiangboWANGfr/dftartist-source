import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";
import { sdkCoreControl, releaseCore } from "./core.mjs";
test(
  "B64 original B LF SDK/Core explicit occurrence/Selection/Tree prerequisite, not new model",
  { timeout: 60000 },
  async () => {
    await boot(false);
    try {
      const result = await sdkCoreControl();
      assert.deepEqual(result, {
        fixture: "original B LF",
        sdkOnly: true,
        occurrences: 2,
        exit: { code: 0, signal: null },
      });
      console.log(JSON.stringify({ kind: "B64-Core-control", ...result }));
    } finally {
      await releaseCore();
    }
  },
);
