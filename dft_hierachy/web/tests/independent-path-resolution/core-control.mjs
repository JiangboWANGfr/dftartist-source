// Only original B SDK/Core ability; never the missing new model/View.
import assert from "node:assert/strict";
import { boot, vm } from "./harness.mjs";
import { real, releaseCore } from "../independent-source-candidates/core.mjs";
await boot(false);
let wire;
try {
  await real("LF", false, async (c) => {
    wire = c.wire;
    const reply = await c.client.resolvePath("b_sd_top/left");
    assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
    assert.deepEqual(reply.result, [c.children[0].ref]);
    assert.deepEqual(
      (await c.client.resolvePath("b_sd_top/missing_B68")).result,
      [],
    );
    const s = new vm.SelectionModel({ snapshotId: c.snapshot.snapshotId });
    c.models.push(s);
    s.select({
      snapshotId: c.snapshot.snapshotId,
      origin: "external",
      items: [{ ref: reply.result[0] }],
    });
    assert.deepEqual(s.current.items, [{ ref: c.children[0].ref }]);
  });
  assert.deepEqual(await wire.exited, { code: 0, signal: null });
  console.log(
    JSON.stringify(
      {
        kind: "B68-existing-SDK-Core-control",
        planned: 1,
        executed: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        sdkOnly: true,
        exit: await wire.exited,
      },
      null,
      2,
    ),
  );
} finally {
  await releaseCore();
}
