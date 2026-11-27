// B protocol/SDK controls, not a replacement candidate model.
import test from "node:test";
import assert from "node:assert/strict";
import { boot, using, Q, protocol } from "./harness.mjs";
await boot(false);
const matching = (frame, id) =>
  frame.method === "cancel" && frame.params.target === id;
for (const [name, params, legal, match] of [
  ["target-correct", { target: 7 }, true, true],
  ["only-id-missing-target", { id: 7 }, false, false],
  ["different-target-same-id", { target: 8, id: 7 }, true, false],
]) {
  test("Cancel normative fixture: " + name, () => {
    const frame = { method: "cancel", params };
    assert.equal(protocol.validateDefinition("Cancel", frame), legal);
    assert.equal(matching(frame, 7), match);
  });
}
test("real SDK independent subscriber abort sends last-owner Cancel.target exactly once", () =>
  using(
    async (c) => {
      const a = new AbortController(),
        b = new AbortController(),
        query = { file: Q.file, line: Q.line };
      const first = c.client.resolveSource(query, { limit: 1 }, a.signal),
        second = c.client.resolveSource(query, { limit: 1 }, b.signal);
      first.catch(() => {});
      second.catch(() => {});
      const request = await c.wire.next("source.resolve");
      assert.equal(c.wire.queries.length, 1);
      a.abort();
      await assert.rejects(first, (e) => e.code === "cancelled");
      assert.equal(c.wire.cancels.length, 0);
      b.abort();
      await assert.rejects(second, (e) => e.code === "cancelled");
      assert.equal(c.wire.cancels.length, 1);
      const frame = c.wire.cancels[0];
      assert.equal(protocol.validateDefinition("Cancel", frame), true);
      assert.equal(matching(frame, request.id), true);
      b.abort();
      assert.equal(c.wire.cancels.length, 1);
    },
    { withModel: false },
  ));
