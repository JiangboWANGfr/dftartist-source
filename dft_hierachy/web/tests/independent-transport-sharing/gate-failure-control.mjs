// B runner-only negative control. Never imported by normal production/test entry points.
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.HIER_B_GATE_LOAD_FAILURE, "shared-ten-only");
assert.ok(process.env.HIER_B_PRODUCT_ROOT);
const target = pathToFileURL(
  path.join(
    realpathSync(process.env.HIER_B_PRODUCT_ROOT),
    "web/tests/independent-transport-sharing/compatibility.test.mjs",
  ),
).href;
registerHooks({
  load(url, context, nextLoad) {
    if (url === target)
      throw new Error("B_GATE_FAILURE_CONTROL_SHARED_TEN_ONLY");
    return nextLoad(url, context);
  },
});
