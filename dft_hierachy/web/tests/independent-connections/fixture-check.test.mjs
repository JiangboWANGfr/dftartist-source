import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  using,
  product,
  target,
  object,
  endpoints,
  partial,
  complete,
  deep,
  snapshotProbe,
} from "./harness.mjs";
const { validateDefinition } = await import(
  pathToFileURL(path.join(product, "web/packages/protocol-types/dist/index.js"))
    .href
);
test("B connection fixtures obey authoritative generated validators", () => {
  assert.equal(validateDefinition("ObjGetResult", object()), true);
  for (const x of endpoints())
    assert.equal(validateDefinition("Endpoint", x), true, JSON.stringify(x));
  for (const x of [complete, partial(), partial("interface_port")])
    assert.equal(validateDefinition("Completeness", x), true);
  for (const method of ["ConnDriversParams", "ConnLoadsParams"])
    assert.equal(validateDefinition(method, target()), true);
  assert.equal(
    validateDefinition("RequestedBitRange", { lsb: 0, width: 0 }),
    false,
  );
  assert.equal(validateDefinition("BitRange", { lsb: 0, width: 0 }), true);
});
for (const method of ["object", "drivers", "loads"])
  test("B real SDK lawful original " + method, () =>
    using(
      async (c) => {
        const p =
            method === "object"
              ? c.client.object("B-conn-signal")
              : c.client[method](target()),
          q = await c.wire.next(
            method === "object" ? "obj.get" : "conn." + method,
          );
        const result = method === "object" ? object() : endpoints(),
          comp = method === "object" ? complete : partial();
        c.wire.ok(q, result, comp);
        const r = await p;
        assert.deepEqual(r.result, result);
        assert.deepEqual(r.completeness, comp);
        deep(r);
        assert.equal(c.calls.at(-1).reply, r);
      },
      { withModel: false },
    ),
  );
test("B SDK object partial illegal while empty connection partial legal", () =>
  using(
    async (c) => {
      for (const method of ["drivers", "loads"]) {
        const pending = c.client[method](target());
        const request = await c.wire.next("conn." + method);
        c.wire.ok(request, [], partial());
        const reply = await pending;
        assert.deepEqual(reply.result, []);
        assert.deepEqual(reply.completeness, partial());
      }
      const p = c.client.object("B-conn-signal");
      p.catch(() => {});
      const q = await c.wire.next("obj.get");
      c.wire.ok(q, object(), partial());
      await assert.rejects(p, { code: "protocol_error", origin: "client" });
    },
    { withModel: false },
  ));
test("B own snapshot probe returns exact error for its own getter invocation", () =>
  using(
    async (c) => {
      const p = snapshotProbe(c.client);
      try {
        let e;
        assert.throws(() => {
          try {
            void c.client.snapshot;
          } catch (x) {
            e = x;
            throw x;
          }
        });
        assert.equal(p.errors[0], e);
      } finally {
        p.restore();
      }
    },
    { withModel: false, ready: false },
  ));
