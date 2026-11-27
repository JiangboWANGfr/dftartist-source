import assert from "node:assert/strict";
import test from "node:test";
import { withReal, verifyFacts, real, result } from "./core.mjs";
test(
  "B IP Core KAT two parameterizations and empty attributes",
  { timeout: 20000 },
  () =>
    withReal(async (c) => {
      const a = await verifyFacts(c, "narrow", 2),
        b = await verifyFacts(c, "wide", 6);
      assert.equal(a.inst.def, b.inst.def);
      await verifyFacts(c, "empty", null);
    }),
);
test(
  "B IP Core rejects a genuine port ref as inst.get target; SDK stays live",
  { timeout: 20000 },
  () =>
    withReal(async (c) => {
      const { expected } = await verifyFacts(c, "narrow", 2);
      let error;
      try {
        await c.client.instance(expected.ports.result[0].ref);
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.equal(error.origin, "core");
      assert.ok(result(await c.client.roots()).length > 0);
    }),
);
test(
  "B IP Core reopened design has distinct snapshot identity",
  { timeout: 20000 },
  async () => {
    const a = await real();
    let id;
    try {
      id = a.snapshot.snapshotId;
    } finally {
      await a.close();
    }
    await withReal(async (b) => assert.notEqual(b.snapshot.snapshotId, id));
  },
);
