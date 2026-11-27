import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InstancePropertiesModel,
  InstancePropertiesError,
} from "@hier/viewmodel";
import { sdk, watch, root } from "../independent-tree/harness.mjs";

// A lifecycle regressions; these do not replace B's independent frozen inputs.
for (const action of ["cancel", "clear"])
  test(`A Properties: disposal during ${action} notification settles both commands`, async (t) => {
    const c = await sdk(t);
    const m = new InstancePropertiesModel(c.client);
    c.models.push(m);
    const marker = { phase: "pending" };
    let later = 0;
    m.subscribe(() => {
      if (m.state.status === "pending") throw marker;
      m.dispose();
    });
    m.subscribe(() => later++);
    const loading = watch(m.load("B-root"));
    await c.wire.next("inst.get");
    const acting = watch(m[action]());
    await assert.rejects(
      acting,
      (error) =>
        error instanceof InstancePropertiesError && error.code === "disposed",
    );
    await assert.rejects(loading, (error) => {
      assert.equal(error.code, "disposed");
      assert.ok(error.cause instanceof AggregateError);
      assert.deepEqual(error.cause.errors, [marker]);
      assert.equal(error.cause.cause.code, "cancelled");
      return true;
    });
    assert.equal(later, 1);
    assert.deepEqual(m.state, { status: "idle", target: null });
    assert.equal(c.wire.closed, false);
  });

// Precision proposal submitted separately to C/B; not a frozen B acceptance case.
test("A Properties: disposed subscribe rejects before inspecting invalid listeners", async (t) => {
  const c = await sdk(t);
  const m = new InstancePropertiesModel(c.client);
  c.models.push(m);
  const off = m.subscribe(() => {});
  m.dispose();
  let probes = 0;
  const poison = new Proxy(
    {},
    {
      get() {
        probes++;
        throw undefined;
      },
    },
  );
  for (const listener of [() => {}, undefined, null, poison])
    assert.throws(
      () => m.subscribe(listener),
      (error) =>
        error instanceof InstancePropertiesError && error.code === "disposed",
    );
  off();
  off();
  assert.equal(probes, 0);
  assert.equal(c.wire.closed, false);
});

test(
  "A Properties: an opaque SDK rejection settles without probing its cause",
  { timeout: 2000 },
  async (t) => {
    const c = await sdk(t);
    const m = new InstancePropertiesModel(c.client);
    c.models.push(m);
    let probes = 0;
    const probe = () => {
      probes++;
      throw undefined;
    };
    const cause = new Proxy(
      {},
      { get: probe, getPrototypeOf: probe, ownKeys: probe },
    );
    const original = c.client.instance;
    c.client.instance = function (...args) {
      return Reflect.apply(original, this, args).then(() => {
        throw cause;
      });
    };
    const loading = watch(m.load("B-root"));
    const request = await c.wire.next("inst.get");
    c.wire.ok(request, root(1));
    await assert.rejects(loading, (error) => {
      assert.equal(error instanceof InstancePropertiesError, true);
      assert.equal(error.code, "inconsistent_reply");
      assert.equal(error.cause, cause);
      return true;
    });
    assert.equal(m.state.status, "failed");
    assert.equal(m.state.error.origin, "properties");
    assert.equal(probes, 0);
  },
);
