import assert from "node:assert/strict";
import test from "node:test";
import {
  boot,
  context,
  Q,
  hits,
  kinds,
  page,
  partial,
  complete,
} from "./harness.mjs";
await boot(false);
test("B60 schema fixtures keep all six authoritative kinds and legal extensions", async () => {
  const { protocol } = await import("./harness.mjs");
  for (const h of hits())
    assert.equal(protocol.validateDefinition("ObjectHit", h), true);
  for (const c of [partial, complete])
    assert.equal(protocol.validateDefinition("Completeness", c), true);
  assert.equal(protocol.validateDefinition("SearchResult", page()), true);
  assert.equal(
    protocol.validateDefinition("SearchParams", {
      text: Q.text,
      kinds: [...kinds],
      scope: "B60:opaque",
    }),
    true,
  );
});
test("B60 real SDK controlled search preserves literal text and complete original hits", async () => {
  const c = await context({ withModel: false });
  try {
    const p = c.client.search(
      { text: Q.text, kinds: [...kinds], scope: "B60:opaque" },
      { limit: 6 },
    );
    p.catch(() => {});
    const q = await c.wire.next("search");
    assert.equal(q.params.text, Q.text);
    assert.equal(q.params.scope, "B60:opaque");
    c.wire.ok(q, page(), complete);
    assert.deepEqual((await p).result.items, hits());
    assert.equal((await p).completeness.status, "complete");
  } finally {
    await c.close();
  }
});
test("B60 real SDK partial empty page keeps next/reasons and is not a negative guarantee", async () => {
  const c = await context({ withModel: false });
  try {
    const p = c.client.search({ text: "" }, { limit: 1 });
    p.catch(() => {});
    const q = await c.wire.next("search");
    c.wire.ok(q, page([], "B60-next"), partial);
    const r = await p;
    assert.deepEqual(r.result.items, []);
    assert.equal(r.result.next, "B60-next");
    assert.deepEqual(r.completeness, partial);
  } finally {
    await c.close();
  }
});
test("B60 borrowed original scope ready/no-model and duplicate close release resources", async () => {
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
