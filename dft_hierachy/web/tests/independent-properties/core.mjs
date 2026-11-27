import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { product, HierClient, vm, capability, deep } from "./harness.mjs";
const { createProcessTransport } = await import(
  pathToFileURL(path.join(product, "web/packages/client/dist/node/index.js"))
    .href
);
export const fixture = fileURLToPath(
  new URL("./b_instance_properties.sv", import.meta.url),
);
export const result = (reply) => {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
};
export async function real(withModel = false) {
  if (withModel) capability();
  assert.ok(process.env.HIER_BIN, "B own HIER_BIN required");
  const transport = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", fixture],
  });
  transport.exited.catch(() => {});
  const client = new HierClient(transport);
  client.ready.catch(() => {});
  const models = [];
  let closing;
  const c = {
    transport,
    client,
    models,
    close: () =>
      (closing ??= (async () => {
        const errors = [];
        for (const m of models)
          try {
            m.dispose();
          } catch (e) {
            errors.push(e);
          }
        try {
          client.dispose();
        } catch (e) {
          errors.push(e);
        }
        try {
          assert.deepEqual(await transport.exited, { code: 0, signal: null });
        } catch (e) {
          errors.push(e);
        }
        if (errors.length)
          throw new AggregateError(errors, "B real session cleanup");
      })()),
  };
  try {
    c.snapshot = await client.ready;
    const root = result(await client.roots()).find(
      (r) => r.name === "b_ip_top",
    );
    assert.ok(root);
    c.root = root;
    c.children = result(await client.children(root.ref, { limit: 64 })).items;
    assert.deepEqual(c.children.map((x) => x.name).sort(), [
      "empty",
      "narrow",
      "wide",
    ]);
    c.newModel = () => {
      const m = new vm.InstancePropertiesModel(client);
      models.push(m);
      return m;
    };
    if (withModel) c.m = c.newModel();
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
export async function withReal(fn, withModel = false) {
  const c = await real(withModel);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}
export async function verifyFacts(c, name, width) {
  const inst = c.children.find((x) => x.name === name);
  assert.ok(inst);
  const a = await c.client.instance(inst.ref),
    b = await c.client.ports(inst.ref),
    p = await c.client.params(inst.ref);
  assert.equal(result(a).ref, inst.ref);
  assert.equal(result(a).name, name);
  if (width === null) {
    assert.deepEqual(result(b), []);
    assert.deepEqual(result(p), []);
  } else {
    const byName = new Map(result(b).map((x) => [x.name, x]));
    assert.equal(byName.get("d").width, width);
    assert.equal(byName.get("q").width, width);
    assert.equal(byName.get("d").direction, "in");
    assert.equal(byName.get("q").direction, "out");
    const pv = new Map(result(p).map((x) => [x.name, x]));
    assert.equal(pv.get("W").isOverridden, true);
    assert.equal(pv.get("DOUBLE_W").isLocal, true);
    assert.equal(pv.get("T").isType, true);
    for (const x of result(p)) assert.equal(typeof x.value, "string");
  }
  deep(a);
  deep(b);
  deep(p);
  return { inst, expected: { instance: a, ports: b, params: p } };
}
