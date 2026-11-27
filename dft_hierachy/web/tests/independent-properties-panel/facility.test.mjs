import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  context,
  observeMethod,
  ports,
  params,
  target,
} from "./public-model.mjs";
import { cases, invalid, packageCases } from "./cases.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P && path.isAbsolute(P), "explicit fixed product");
const client = await import(
  pathToFileURL(P + "/web/packages/client/dist/index.js")
);
const models = await import(
  pathToFileURL(P + "/web/packages/viewmodel/dist/index.js")
);
const protocol = await import(
  pathToFileURL(P + "/web/packages/protocol-types/dist/index.js")
);
const deps = { ...client, ...models };
test("B54 finite manifest and input metadata", () => {
  for (const value of ports())
    assert(
      protocol.validateDefinition("PortInfo", value),
      "legal PortInfo fixture",
    );
  for (const value of params())
    assert(
      protocol.validateDefinition("ParamInfo", value),
      "legal ParamInfo fixture",
    );
  assert.equal(cases.length, 69);
  assert.equal(invalid.length, 17);
  assert.equal(new Set(cases.map((x) => x.id)).size, 69);
  for (const c of [...cases, ...packageCases])
    for (const key of ["id", "input", "expected", "basis"]) assert(c[key]);
});
test("B54 wire preserves original model/Reply with params-first order", async () => {
  const c = await context(deps);
  try {
    assert.equal(c.sent.length, 0);
    const t = await c.begin();
    const before = c.m.state;
    assert.equal(before.status, "pending");
    await c.finish(t, { reverse: true });
    assert.deepEqual(c.m.state.data.ports.result, ports());
    assert.deepEqual(c.m.state.data.params.result, params());
    assert.equal(c.calls[0].returned, t.p);
  } finally {
    assert.deepEqual(await c.close(), []);
    assert.equal(c.messages.size, 0);
    assert.equal(c.closes.size, 0);
  }
});
test("B54 real failure and cancellation inputs use SDK/model boundaries", async () => {
  const c = await context(deps);
  try {
    let t = await c.begin();
    c.fail(t.q);
    const e = await t.p.then(
      () => assert.fail("reject required"),
      (e) => e,
    );
    assert(e instanceof client.HierError);
    assert.equal(c.m.state.status, "failed");
    assert.equal(c.m.state.error.code, "not_found");
    await c.m.clear();
    t = await c.begin();
    await c.m.cancel();
    await assert.rejects(t.p, { code: "cancelled" });
    assert.equal(c.m.state.status, "cancelled");
  } finally {
    assert.deepEqual(await c.close(), []);
  }
});
test("B54 method observer preserves receiver, raw return and exact throw", () => {
  const returned = Promise.resolve(1),
    raw = Object.freeze({ raw: true }),
    o = {
      f(x) {
        assert.equal(this, o);
        if (x) throw raw;
        return returned;
      },
    },
    log = [];
  const off = observeMethod(o, "f", log);
  assert.equal(o.f(false), returned);
  assert.throws(
    () => o.f(true),
    (e) => e === raw,
  );
  assert.equal(log[0].returned, returned);
  assert.equal(log[1].error, raw);
  off();
  assert.equal(Object.hasOwn(o, "f"), true);
});
test("B54 own subscription accounting and idempotent release", async () => {
  const c = await context(deps);
  const off = c.m.subscribe(() => {});
  assert.equal(c.stats.properties.active, 1);
  off();
  off();
  assert.equal(c.stats.properties.active, 0);
  const p = c.close();
  assert.equal(c.close(), p);
  assert.deepEqual(await p, []);
  assert.equal(c.m.disposed, true);
  assert.equal(c.s.disposed, true);
});
test("B54 partial construction rollback releases ready SDK", async () => {
  let wire,
    disposed = 0;
  class Client extends client.HierClient {
    constructor(w, ...rest) {
      super(w, ...rest);
      wire = w;
    }
    dispose() {
      disposed++;
      return super.dispose();
    }
  }
  class BadSelection {
    constructor() {
      throw Error("B fixture construction marker");
    }
  }
  await assert.rejects(
    context({ ...deps, HierClient: Client, SelectionModel: BadSelection }),
    /construction marker/,
  );
  assert.equal(disposed, 1);
  assert.throws(
    () => wire.send({ method: "B fixture closed probe" }),
    /wire live/,
  );
});
