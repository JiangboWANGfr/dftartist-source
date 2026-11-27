// One real SDK/Core prerequisite; no substitute or invocation of SearchModel.
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";
import { sdkCoreControl, releaseCore } from "./core.mjs";

test(
  "B60 SDK/Core original B LF fixture, not SearchModel acceptance",
  { timeout: 60000 },
  async () => {
    await boot(false);
    try {
      assert.deepEqual(await sdkCoreControl(), {
        fixture: "original B LF",
        sdkOnly: true,
        occurrences: 2,
      });
    } finally {
      await releaseCore();
    }
  },
);
