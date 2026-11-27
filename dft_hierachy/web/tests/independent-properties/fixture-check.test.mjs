// Controls validate only B inputs against the real SDK, never the missing model.
import assert from "node:assert/strict";
import test from "node:test";
import { snapshotProbe } from "./harness.mjs";
import {
  using,
  info,
  ports,
  params,
  HierError,
  closeWith,
  deep,
  opaque,
} from "./harness.mjs";
for (const method of ["instance", "ports", "params"])
  test("B IP public SDK lawful input " + method, async () =>
    using(
      async (c) => {
        const p = c.client[method]("B-ip-A"),
          q = await c.wire.next(
            method === "instance" ? "inst.get" : "inst." + method,
          );
        const value =
          method === "instance"
            ? info()
            : method === "ports"
              ? ports(0)
              : params();
        c.wire.ok(q, value);
        const r = await p;
        assert.deepEqual(r.result, value);
        assert.deepEqual(r.completeness, { status: "complete", reasons: [] });
        deep(r);
        assert.equal(c.calls[0].reply, r);
      },
      { withModel: false },
    ),
  );
for (const method of ["instance", "ports", "params"])
  test("B IP SDK rejects partial " + method, async () =>
    using(
      async (c) => {
        const p = c.client[method]("B-ip-A"),
          out = p.then(
            () => ({ ok: true }),
            (error) => ({ ok: false, error }),
          );
        const q = await c.wire.next(
          method === "instance" ? "inst.get" : "inst." + method,
        );
        c.wire.ok(
          q,
          method === "instance"
            ? info()
            : method === "ports"
              ? ports()
              : params(),
          { status: "partial", reasons: [{ code: "indexing" }] },
        );
        const r = await out;
        assert.equal(r.ok, false);
        assert.equal(r.error.code, "protocol_error");
        assert.equal(r.error.origin, "client");
      },
      { withModel: false },
    ),
  );
for (const method of ["ports", "params"])
  test(
    "B IP SDK complete cache is not a forced wire reload " + method,
    async () =>
      using(
        async (c) => {
          const p = c.client[method]("B-ip-A"),
            q = await c.wire.next("inst." + method),
            value = method === "ports" ? ports() : params();
          c.wire.ok(q, value);
          const a = await p,
            b = await c.client[method]("B-ip-A");
          assert.deepEqual(a, b);
          assert.equal(c.wire.queries.length, 1);
        },
        { withModel: false, cacheEntries: 8 },
      ),
  );
for (const method of ["instance", "ports", "params"])
  test(
    "B IP real HierError data accessor stays untouched in SDK " + method,
    async () =>
      using(
        async (c) => {
          let reads = 0;
          const original = new HierError(
            "transport_closed",
            "transport",
            "B accessor source",
            {},
          );
          Object.defineProperty(original, "data", {
            get() {
              reads++;
              return { value: 1 };
            },
          });
          const p = c.client[method]("B-ip-A"),
            out = p.then(
              () => ({ ok: true }),
              (error) => ({ ok: false, error }),
            );
          await c.wire.next(
            method === "instance" ? "inst.get" : "inst." + method,
          );
          closeWith(c, original);
          const got = await out;
          assert.equal(got.ok, false);
          assert.equal(got.error, original);
          assert.equal(reads, 0);
        },
        { withModel: false },
      ),
  );
test("B IP opaque thrown proxy is distinguishable without inspecting it", () => {
  const counts = { probes: 0 },
    p = opaque("proxy", counts);
  let actual,
    caught = false;
  try {
    throw p;
  } catch (e) {
    actual = e;
    caught = true;
  }
  assert.equal(caught, true);
  assert.equal(Object.is(actual, p), true);
  assert.equal(counts.probes, 0);
});

test("B IP public snapshot getter observer preserves its own invocation error", () =>
  using(
    async (c) => {
      const probe = snapshotProbe(c.client);
      try {
        let caught = false,
          value;
        try {
          void c.client.snapshot;
        } catch (error) {
          caught = true;
          value = error;
        }
        assert.equal(caught, true);
        assert.equal(probe.errors.length, 1);
        assert.equal(Object.is(value, probe.errors[0]), true);
        assert.equal(c.calls.length, 0);
      } finally {
        probe.restore();
      }
    },
    { withModel: false, ready: false },
  ));
