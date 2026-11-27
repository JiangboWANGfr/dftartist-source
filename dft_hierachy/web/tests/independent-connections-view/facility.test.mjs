import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { context } from "./public-model.mjs";
import { target, info, endpoints, partial, complete, ref } from "./input.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(P && path.isAbsolute(P), "fixed product required");
const mod = (p) => import(pathToFileURL(path.join(P, p)).href);
const { validateDefinition } = await mod(
  "web/packages/protocol-types/dist/index.js",
);
const { HierClient } = await mod("web/packages/client/dist/index.js"),
  { ObjectConnectionsModel, SelectionModel } = await mod(
    "web/packages/viewmodel/dist/index.js",
  );
const deps = { HierClient, ObjectConnectionsModel, SelectionModel };
test("B58 JSON fixtures validate against authoritative Schema", () => {
  assert.equal(validateDefinition("ObjGetResult", info()), true);
  for (const e of endpoints())
    assert.equal(validateDefinition("Endpoint", e), true, JSON.stringify(e));
  for (const c of [complete, partial])
    assert.equal(validateDefinition("Completeness", c), true);
  assert.equal(validateDefinition("ConnDriversParams", target()), true);
});
test("B58 complete-with-reasons and empty four-state value are not lawful wire", () => {
  assert.equal(
    validateDefinition("Completeness", {
      status: "complete",
      reasons: partial.reasons,
    }),
    false,
  );
  assert.equal(validateDefinition("FourStateValue", ""), false);
});
test("B58 borrowed old scope constructs real model and preserves partial/duplicate records", async () => {
  const c = await context(deps);
  try {
    await c.load(target(), { dc: partial });
    assert.equal(c.m.state.status, "success");
    assert.deepEqual(c.m.state.data.drivers.result, endpoints());
    assert.deepEqual(c.m.state.data.drivers.completeness, partial);
    assert.notEqual(
      c.m.state.data.drivers.result[0],
      c.m.state.data.drivers.result[1],
    );
  } finally {
    assert.deepEqual(await c.close(), []);
  }
});
test("B58 target/whole-endpoint legal Selection inputs remain different", async () => {
  const c = await context(deps);
  try {
    const item = { ref, bits: { lsb: 0, width: 2 }, side: "inside" };
    c.s.select({ snapshotId: c.m.snapshotId, origin: "props", items: [item] });
    assert.deepEqual(c.s.current.items, [item]);
    c.s.select({
      snapshotId: c.m.snapshotId,
      origin: "props",
      items: [{ ref: "B58:process" }],
    });
    assert.deepEqual(c.s.current.items, [{ ref: "B58:process" }]);
  } finally {
    assert.deepEqual(await c.close(), []);
  }
});
