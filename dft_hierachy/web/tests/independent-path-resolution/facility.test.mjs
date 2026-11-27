import assert from "node:assert/strict";
import test from "node:test";
import {
  boot,
  context,
  refs,
  partial,
  complete,
  Q,
  vm,
  protocol,
} from "./harness.mjs";
await boot(false);
test("B68 PathResolveResult/completeness lawful; complete reasons rejected", () => {
  assert.equal(protocol.validateDefinition("PathResolveResult", refs()), true);
  for (const c of [partial, complete])
    assert.equal(protocol.validateDefinition("Completeness", c), true);
  assert.equal(
    protocol.validateDefinition("Completeness", {
      status: "complete",
      reasons: partial.reasons,
    }),
    false,
  );
});
test("B68 actual SDK sends raw text and retains single duplicate/partial Reply", async () => {
  const c = await context({ withModel: false });
  try {
    const p = c.client.resolvePath(Q.text);
    p.catch(() => {});
    const request = await c.wire.next("path.resolve");
    assert.deepEqual(request.params, { text: Q.text });
    c.wire.ok(request, refs(), partial);
    const reply = await p;
    assert.deepEqual(reply.result, refs());
    assert.deepEqual(reply.completeness, partial);
    assert.equal(Object.hasOwn(reply.result, "items"), false);
  } finally {
    await c.close();
  }
});
test("B68 original Selection namespaces/explicit history and idempotent scope close", async () => {
  const c = await context({ withModel: false });
  const s = new vm.SelectionModel({ snapshotId: Q.snapshotId });
  c.models.push(s);
  try {
    s.select({
      snapshotId: Q.snapshotId,
      origin: "external",
      items: [{ def: refs()[0] }],
    });
    s.select({
      snapshotId: Q.snapshotId,
      origin: "external",
      items: [{ ref: refs()[0] }],
    });
    s.back();
    assert.deepEqual(s.current.items, [{ def: refs()[0] }]);
    s.forward();
    assert.deepEqual(s.current.items, [{ ref: refs()[0] }]);
  } finally {
    const a = c.close();
    assert.equal(c.close(), a);
    await a;
  }
});
