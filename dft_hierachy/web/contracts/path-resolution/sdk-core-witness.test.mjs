import assert from "node:assert/strict";
import test from "node:test";
import { HierError } from "@hier/client";
import { METHODS } from "@hier/protocol-types";
import { SelectionModel, TreeModel } from "@hier/viewmodel";
import { createSession } from "../search/core-session.mjs";

// Existing SDK/Core and accepted models only. No proposed model or view runs.
test("A path capability: retain multi-top and same-name port/signal candidates", async (t) => {
  const client = await createSession(t);
  const reply = await client.resolvePath("left.a");
  assert.equal(reply.completeness.status, "complete");
  assert.equal(reply.result.length, 4);
  assert.equal(new Set(reply.result).size, 4);
  assert.ok(Object.isFrozen(reply) && Object.isFrozen(reply.result));
  const objects = await Promise.all(
    reply.result.map((ref) => client.object(ref)),
  );
  assert.equal(new Set(objects.map((r) => r.result.inst)).size, 2);
  assert.deepEqual(
    objects.map((r) => r.result.kind),
    ["port", "signal", "port", "signal"],
  );
  for (let index = 0; index < objects.length; index++)
    assert.equal(objects[index].result.ref, reply.result[index]);
  const first = await client.resolvePath("search_top.left.a");
  const second = await client.resolvePath("second_top.left.a");
  assert.deepEqual(reply.result, [...first.result, ...second.result]);
  assert.equal(METHODS["path.resolve"].allowsPartial, true);
  assert.equal(METHODS["path.resolve"].cacheComplete, false);
  console.log(
    JSON.stringify({
      proposedModelExecuted: false,
      proposedViewExecuted: false,
      candidates: reply.result.length,
      observedCompleteness: "complete",
      refs: reply.result,
    }),
  );
});

test("A path capability: original text preserves escaped terminator and Core generate grammar", async (t) => {
  const client = await createSession(t);
  const plain = await client.resolvePath("search_top.g[0].nested");
  assert.equal(plain.result.length, 1);
  const spaced = await client.resolvePath(" / search_top / g[+0] / nested ");
  assert.deepEqual(spaced.result, plain.result);
  const escaped = "search_top.left.\\literal*? ";
  const result = await client.resolvePath(escaped);
  assert.equal(result.result.length, 1);
  const object = await client.object(result.result[0]);
  assert.equal(object.result.name, "literal*?");
  await assert.rejects(
    client.resolvePath(escaped.trim()),
    (error) =>
      error instanceof HierError &&
      error.code === "bad_request" &&
      error.origin === "core",
  );
  assert.equal(
    (await client.resolvePath(escaped)).completeness.status,
    "complete",
  );
});

test("A path capability: explicit original ref selection then host reveal, never infer a candidate", async (t) => {
  const client = await createSession(t);
  const snapshotId = client.snapshot.snapshotId;
  const roots = (await client.roots()).result;
  const selection = new SelectionModel({ snapshotId });
  const tree = new TreeModel(client, { pageSize: 1 });
  try {
    selection.select({
      snapshotId,
      origin: "external",
      items: [{ def: roots[0].def }],
    });
    const initialSelection = selection.current;
    const initialRows = tree.rows;
    const reply = await client.resolvePath("left");
    assert.equal(reply.result.length, 2);
    const single = await client.resolvePath("search_top");
    assert.equal(single.result.length, 1);
    assert.equal(selection.current, initialSelection);
    assert.equal(tree.rows, initialRows);
    assert.equal(tree.revealState.status, "idle");
    const itemIndex = 1;
    const ref = reply.result[itemIndex];
    selection.select({ snapshotId, origin: "external", items: [{ ref }] });
    assert.deepEqual(selection.current.items, [{ ref }]);
    assert.equal(tree.rows, initialRows);
    // A distinct host action, not an automatic query/model/view side effect.
    await tree.reveal(ref);
    assert.equal(tree.revealState.status, "success");
    const row = tree.rows.find((item) => item.id === tree.revealState.rowId);
    assert.equal(row.kind, "instance");
    assert.equal(row.instance.ref, ref);
    selection.back();
    assert.equal(selection.current.items[0].def, roots[0].def);
    selection.forward();
    assert.deepEqual(selection.current.items, [{ ref }]);
    assert.equal(reply.result[itemIndex], ref);
  } finally {
    tree.dispose();
    selection.dispose();
  }
  assert.equal((await client.roots()).result.length, 2);
});

test("A path capability: complete empty, Core syntax failure and pre-cancel keep the session usable", async (t) => {
  const client = await createSession(t);
  const empty = await client.resolvePath("missing_path");
  assert.equal(empty.completeness.status, "complete");
  assert.deepEqual(empty.result, []);
  await assert.rejects(
    client.resolvePath(""),
    (error) =>
      error instanceof HierError &&
      error.code === "bad_request" &&
      error.origin === "core",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.resolvePath("left", controller.signal),
    (error) => error instanceof HierError && error.code === "cancelled",
  );
  assert.equal((await client.resolvePath("left")).result.length, 2);
  console.log(
    JSON.stringify({
      preCancelledOnly: true,
      actualPartial: false,
      proposedModelExecuted: false,
      proposedViewExecuted: false,
    }),
  );
});
