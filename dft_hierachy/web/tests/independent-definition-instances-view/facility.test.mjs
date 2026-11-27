import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { context } from "./public-model.mjs";
import { query, hits, page, complete, partial } from "./input.mjs";
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P && path.isAbsolute(P));
const load = (p) => import(pathToFileURL(path.join(P, p)).href),
  { validateDefinition } = await load(
    "web/packages/protocol-types/dist/index.js",
  ),
  { HierClient } = await load("web/packages/client/dist/index.js"),
  { DefinitionInstancesModel, SelectionModel } = await load(
    "web/packages/viewmodel/dist/index.js",
  ),
  deps = { HierClient, DefinitionInstancesModel, SelectionModel };
test("B66 original five InstInfo and reason fixtures obey Schema", () => {
  for (const h of hits()) assert.equal(validateDefinition("InstInfo", h), true);
  for (const c of [complete, partial])
    assert.equal(validateDefinition("Completeness", c), true);
  assert.equal(validateDefinition("DefInstancesResult", page()), true);
});
test("B66 complete with reasons remains unreachable without forged state", () => {
  assert.equal(
    validateDefinition("Completeness", {
      status: "complete",
      reasons: partial.reasons,
    }),
    false,
  );
});
test("B66 borrowed real DefinitionInstancesModel preserves prefix/duplicate/partial original SDK pages", async () => {
  const c = await context(deps);
  try {
    await c.load(query(), page([hits()[2]], "B66-next"));
    const first = c.m.state.pages[0],
      p = c.hold(c.m.loadMore()),
      q = await c.next("def.instances");
    c.ok(q, page([hits()[2], hits()[2]], "B66-partial"), partial);
    await p;
    assert.equal(c.m.state.status, "success");
    assert.equal(c.m.state.pages[0], first);
    assert.equal(c.m.state.pages.length, 2);
    assert.equal(c.m.state.pages[1].result.items.length, 2);
    assert.deepEqual(c.m.state.pages[1].completeness, partial);
    assert.notEqual(
      c.m.state.pages[1].result.items[0],
      c.m.state.pages[1].result.items[1],
    );
  } finally {
    assert.deepEqual(await c.close(), []);
  }
});
test("B66 explicit definition and object namespaces and repeated close are real public behavior", async () => {
  const c = await context(deps);
  try {
    const ref = hits()[0].ref;
    c.s.select({
      snapshotId: c.m.snapshotId,
      origin: "external",
      items: [{ def: query().def }],
    });
    assert.deepEqual(c.s.current.items, [{ def: query().def }]);
    c.s.select({
      snapshotId: c.m.snapshotId,
      origin: "external",
      items: [{ ref, bits: { lsb: 0, width: 1 }, side: "inside" }],
    });
    assert.deepEqual(c.s.current.items, [
      { ref, bits: { lsb: 0, width: 1 }, side: "inside" },
    ]);
  } finally {
    const a = c.close();
    assert.equal(c.close(), a);
    assert.deepEqual(await a, []);
    assert.equal(c.messages.size, 0);
    assert.equal(c.closes.size, 0);
  }
});
