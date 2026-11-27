import assert from "node:assert/strict";
import test from "node:test";
import {
  boot,
  context,
  Q,
  item,
  instKinds,
  page,
  complete,
  partial,
  protocol,
} from "./harness.mjs";
await boot(false);
test("B64 InstInfo kinds, extensions, completeness and def.instances fixtures obey authoritative Schema", () => {
  for (const k of instKinds)
    assert.equal(protocol.validateDefinition("InstInfo", item(0, k)), true);
  for (const c of [complete, partial])
    assert.equal(protocol.validateDefinition("Completeness", c), true);
  assert.equal(protocol.validateDefinition("DefInstancesResult", page()), true);
  assert.equal(
    protocol.validateDefinition("DefInstancesParams", { def: Q.def, limit: 1 }),
    true,
  );
});
test("B64 real SDK complete duplicate occurrence rows preserve identities and opaque def input", async () => {
  const c = await context({ withModel: false });
  try {
    const p = c.client.instancesOf(Q.def, { limit: 3 });
    p.catch(() => {});
    const q = await c.wire.next("def.instances");
    assert.equal(q.params.def, Q.def);
    assert.equal(Object.hasOwn(q.params, "snapshotId"), false);
    const value = page([item(), item(), item(1)]);
    c.wire.ok(q, value);
    const r = await p;
    assert.deepEqual(r.result, value);
    assert.equal(c.calls[0].reply, r);
    assert.equal(r.completeness.status, "complete");
  } finally {
    await c.close();
  }
});
test("B64 registered partial empty page is lawful and retained by real SDK, not a no-instance guarantee", async () => {
  const c = await context({ withModel: false });
  try {
    const p = c.client.instancesOf(Q.def, { limit: 1 });
    p.catch(() => {});
    const q = await c.wire.next("def.instances");
    c.wire.ok(q, page([], "B64-next"), partial);
    const r = await p;
    assert.deepEqual(r.result.items, []);
    assert.equal(r.result.next, "B64-next");
    assert.deepEqual(r.completeness, partial);
  } finally {
    await c.close();
  }
});
test("B64 original ready/no-model scope and idempotent close release SDK/Transport listeners", async () => {
  const c = await context({ withModel: false });
  assert.equal(c.models.length, 0);
  assert.equal(c.registrations, 0);
  assert.equal(c.wire.queries.length, 0);
  const a = c.close(),
    b = c.close();
  assert.equal(a, b);
  await a;
  assert.equal(c.wire.closed, true);
  assert.equal(c.wire.messages.size, 0);
  assert.equal(c.wire.closes.size, 0);
});
