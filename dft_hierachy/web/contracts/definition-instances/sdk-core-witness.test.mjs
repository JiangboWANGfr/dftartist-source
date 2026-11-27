import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HierError } from "@hier/client";
import { METHODS } from "@hier/protocol-types";
import { SearchModel, SelectionModel, TreeModel } from "@hier/viewmodel";
import { command, fixture, createSession } from "../search/core-session.mjs";

// Existing production only. No replacement DefinitionInstancesModel or oracle.
async function findDefinition(client, name) {
  const search = new SearchModel(client);
  try {
    await search.load({
      snapshotId: search.snapshotId,
      text: name,
      kinds: ["definition"],
    });
    assert.equal(search.state.status, "success");
    const page = search.state.pages[0];
    assert.equal(page.completeness.status, "complete");
    assert.equal(page.result.next, undefined);
    const hits = page.result.items.filter((hit) => hit.name === name);
    assert.equal(hits.length, 1);
    const hit = hits[0];
    assert.equal(hit.kind, "definition");
    assert.equal(hit.ref, hit.def);
    return hit;
  } finally {
    search.dispose();
  }
}

async function readPages(client, def, limit, onPage = () => {}) {
  const replies = [];
  let cursor;
  do {
    assert.ok(replies.length < 10, "finite A fixture must finish paging");
    const reply = await client.instancesOf(def, {
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    assert.equal(reply.completeness.status, "complete");
    assert.ok(reply.result.items.length <= limit);
    assert.ok(Object.isFrozen(reply));
    assert.ok(Object.isFrozen(reply.result.items));
    replies.push(reply);
    onPage(reply);
    cursor = reply.result.next;
  } while (cursor !== undefined);
  return replies;
}

test("A definition/Core: original pages preserve all four occurrences across two tops", async (t) => {
  const client = await createSession(t);
  const definition = await findDefinition(client, "search_leaf");
  const small = await readPages(client, definition.ref, 1);
  const large = await readPages(client, definition.ref, 200);
  assert.equal(small.length, 4);
  assert.equal(large.length, 1);
  const occurrences = small.flatMap((reply) => reply.result.items);
  assert.deepEqual(occurrences, large[0].result.items);
  assert.equal(new Set(occurrences.map((item) => item.ref)).size, 4);
  assert.equal(new Set(occurrences.map((item) => item.def)).size, 1);
  assert.equal(new Set(occurrences.map((item) => item.path[0])).size, 2);
  assert.ok(occurrences.some((item) => item.name === "nested"));
  for (const occurrence of occurrences) {
    assert.equal(occurrence.def, definition.ref);
    assert.equal(occurrence.defName, definition.name);
    assert.ok(Object.isFrozen(occurrence));
    assert.ok(Object.isFrozen(occurrence.path));
    assert.deepEqual(
      (await client.instance(occurrence.ref)).result,
      occurrence,
    );
  }
  assert.equal(METHODS["def.instances"].allowsPartial, true);
  const digest = async (file) =>
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  console.log(
    JSON.stringify({
      productionDefinitionInstancesModelExecuted: false,
      pages: small.length,
      occurrences: occurrences.length,
      observedCompleteness: "complete",
      allowsPartial: METHODS["def.instances"].allowsPartial,
      core: command,
      coreSha256: await digest(command),
      fixtureSha256: await digest(fixture),
    }),
  );
});

test("A definition/Core: explicit occurrence selection then real TreeModel reveal", async (t) => {
  const client = await createSession(t);
  const definition = await findDefinition(client, "search_leaf");
  const snapshotId = client.snapshot.snapshotId;
  const selection = new SelectionModel({ snapshotId });
  const tree = new TreeModel(client, { pageSize: 1, showGenerateScopes: true });
  try {
    selection.select({
      snapshotId,
      origin: "external",
      items: [{ def: definition.ref }],
    });
    const selectedDefinition = selection.current;
    const initialRows = tree.rows;
    const replies = await readPages(client, definition.ref, 1, () => {
      assert.equal(selection.current, selectedDefinition);
      assert.equal(tree.rows, initialRows);
      assert.equal(tree.revealState.status, "idle");
    });
    const chosen = replies
      .flatMap((reply) => reply.result.items)
      .find((item) => item.name === "nested");
    assert.ok(chosen);
    // A distinct explicit action after enumeration: never infer it from def/body.
    selection.select({
      snapshotId,
      origin: "external",
      items: [{ ref: chosen.ref }],
    });
    const selectedOccurrence = selection.current;
    await tree.reveal(chosen.ref);
    assert.equal(tree.revealState.status, "success");
    assert.equal(tree.revealState.ref, chosen.ref);
    const row = tree.rows.find((item) => item.id === tree.revealState.rowId);
    assert.equal(row?.kind, "instance");
    assert.equal(row.instance.ref, chosen.ref);
    assert.equal(selection.current, selectedOccurrence);
    selection.back();
    assert.deepEqual(selection.current.items, [{ def: definition.ref }]);
  } finally {
    tree.dispose();
    selection.dispose();
  }
  assert.equal((await client.roots()).result.length, 2);
});

test("A definition/Core: a single top occurrence does not replace definition selection", async (t) => {
  const client = await createSession(t);
  const definition = await findDefinition(client, "search_top");
  const selection = new SelectionModel({
    snapshotId: client.snapshot.snapshotId,
  });
  try {
    selection.select({
      snapshotId: selection.snapshotId,
      origin: "external",
      items: [{ def: definition.ref }],
    });
    const selected = selection.current;
    const replies = await readPages(client, definition.ref, 1);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].result.items.length, 1);
    const occurrence = replies[0].result.items[0];
    assert.ok(
      (await client.roots()).result.some((top) => top.ref === occurrence.ref),
    );
    assert.equal(selection.current, selected);
    assert.deepEqual(selection.current.items, [{ def: definition.ref }]);
  } finally {
    selection.dispose();
  }
});

test("A definition/Core: wrong-definition cursor and pre-cancel preserve the live session", async (t) => {
  const client = await createSession(t);
  const leaf = await findDefinition(client, "search_leaf");
  const top = await findDefinition(client, "search_top");
  const first = await client.instancesOf(leaf.ref, { limit: 1 });
  assert.ok(first.result.next);
  await assert.rejects(
    client.instancesOf(top.ref, { limit: 1, cursor: first.result.next }),
    (error) =>
      error instanceof HierError &&
      error.origin === "core" &&
      error.code === "bad_request",
  );
  const root = (await client.roots()).result[0];
  await assert.rejects(
    client.instancesOf(root.ref),
    (error) =>
      error instanceof HierError &&
      error.origin === "core" &&
      error.code === "bad_request",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.instancesOf(leaf.ref, { limit: 1 }, controller.signal),
    (error) => error instanceof HierError && error.code === "cancelled",
  );
  const next = await client.instancesOf(leaf.ref, {
    limit: 1,
    cursor: first.result.next,
  });
  assert.equal(next.completeness.status, "complete");
  assert.equal(next.result.items.length, 1);
  assert.notEqual(next.result.items[0].ref, first.result.items[0].ref);
});
