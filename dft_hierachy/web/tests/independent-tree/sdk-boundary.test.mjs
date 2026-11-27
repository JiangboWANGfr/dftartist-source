// Existing SDK conformance controls for B-16; not Tree runtime acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  guard,
  sdk,
  child,
  object,
  watch,
  complete,
  remote,
} from "./harness.mjs";
const methods = [
  ["roots", "inst.roots", (c) => c.roots(), (c) => c.roots],
  [
    "children",
    "inst.children",
    (c) => c.children("B-root", { limit: 1 }),
    () => ({ items: [child("A")], next: "B-next" }),
  ],
  ["ancestors", "inst.ancestors", (c) => c.ancestors("A"), (c) => c.roots],
  ["object", "obj.get", (c) => c.object("A"), () => object("A")],
];
for (const [name, method, query, result] of methods) {
  test(
    "B SDK control: " + name + " lawful complete reaches the public caller",
    guard,
    async (t) => {
      const c = await sdk(t),
        p = watch(query(c.client)),
        q = await c.wire.next(method);
      const payload = result(c);
      c.wire.ok(q, payload);
      assert.deepEqual(await p, { result: payload, completeness: complete });
      assert.equal(c.wire.closed, false);
    },
  );
  test(
    "B-16 input proof: " +
      name +
      " partial is a method-invalid frame, not a Tree partial result",
    guard,
    async (t) => {
      const c = await sdk(t),
        p = watch(query(c.client)),
        q = await c.wire.next(method);
      c.wire.ok(q, result(c), {
        status: "partial",
        reasons: [{ code: "unsupported" }],
      });
      await assert.rejects(p, remote("protocol_error", "client"));
      assert.equal(c.wire.closed, true);
    },
  );
}
test(
  "B SDK control: aborting one equal subscriber leaves the other request live",
  guard,
  async (t) => {
    const c = await sdk(t),
      a = new AbortController();
    const first = watch(c.client.children("B-root", { limit: 1 }, a.signal));
    const second = watch(c.client.children("B-root", { limit: 1 }));
    const q = await c.wire.next("inst.children");
    assert.equal(c.wire.queries.length, 1);
    a.abort();
    await assert.rejects(first, remote("cancelled", "client"));
    assert.equal(c.wire.cancels.length, 0);
    assert.equal(c.wire.closed, false);
    c.wire.ok(q, { items: [child("A")] });
    assert.equal((await second).result.items[0].ref, "A");
  },
);
test(
  "B SDK control: opaque DefRef-looking text reaches Core domain error without identity parsing",
  guard,
  async (t) => {
    const c = await sdk(t),
      p = watch(c.client.object("d:17")),
      q = await c.wire.next("obj.get");
    assert.equal(q.params.ref, "d:17");
    c.wire.fail(q, "bad_request");
    await assert.rejects(p, remote("bad_request"));
    assert.equal(c.wire.closed, false);
  },
);
test(
  "B SDK control: legitimate def.instances partial still resolves, unlike navigation methods",
  guard,
  async (t) => {
    const c = await sdk(t),
      p = watch(c.client.instancesOf("d:17")),
      q = await c.wire.next("def.instances");
    const partial = { status: "partial", reasons: [{ code: "indexing" }] };
    c.wire.ok(q, { items: [] }, partial);
    assert.deepEqual(await p, { result: { items: [] }, completeness: partial });
    assert.equal(c.wire.closed, false);
  },
);
