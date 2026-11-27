import assert from "node:assert/strict";
import test from "node:test";
import {
  DefinitionInstancesModel,
  SearchModel,
  SelectionModel,
  TreeModel,
} from "@hier/viewmodel";
import { createSession } from "../search/core-session.mjs";

// Actual accepted models/SDK/Core. No proposed view or replacement transport.
// A capability witnesses do not supply B's future component oracle.
async function definition(search, name) {
  await search.load({
    snapshotId: search.snapshotId,
    text: name,
    kinds: ["definition"],
  });
  assert.equal(search.state.status, "success");
  const hits = search.state.pages.flatMap((page) => page.result.items);
  const hit = hits.find((item) => item.name === name);
  assert.ok(hit);
  assert.equal(hit.kind, "definition");
  return hit;
}

test("A definition view capability: original model pages then explicit occurrence selection and reveal", async (t) => {
  const client = await createSession(t);
  const search = new SearchModel(client);
  const instances = new DefinitionInstancesModel(client, { pageSize: 1 });
  const selection = new SelectionModel({ snapshotId: instances.snapshotId });
  const tree = new TreeModel(client, { pageSize: 1, showGenerateScopes: true });
  try {
    const hit = await definition(search, "search_leaf");
    selection.select({
      snapshotId: instances.snapshotId,
      origin: "external",
      items: [{ def: hit.ref }],
    });
    const selectedDefinition = selection.current;
    const initialRows = tree.rows;
    await instances.load({ snapshotId: instances.snapshotId, def: hit.ref });
    assert.equal(instances.state.status, "success");
    assert.equal(instances.state.pages.length, 1);
    const first = instances.state.pages[0];
    assert.ok(first.result.next);
    while (instances.state.pages.at(-1).result.next !== undefined) {
      assert.ok(
        instances.state.pages.length < 10,
        "finite fixture must finish",
      );
      const prefix = instances.state.pages;
      assert.equal(selection.current, selectedDefinition);
      assert.equal(tree.rows, initialRows);
      await instances.loadMore();
      assert.equal(instances.state.status, "success");
      assert.equal(instances.state.pages.length, prefix.length + 1);
      prefix.forEach((page, index) => {
        assert.equal(instances.state.pages[index], page);
      });
    }
    assert.equal(instances.state.pages.length, 4);
    assert.equal(instances.state.pages[0], first);
    assert.equal(selection.current, selectedDefinition);
    assert.equal(tree.rows, initialRows);
    assert.equal(tree.revealState.status, "idle");
    const pages = instances.state.pages;
    const items = pages.flatMap((page) => page.result.items);
    assert.ok(pages.every((page) => page.completeness.status === "complete"));
    assert.equal(new Set(items.map((item) => item.ref)).size, 4);
    assert.equal(new Set(items.map((item) => item.def)).size, 1);
    assert.equal(new Set(items.map((item) => item.path[0])).size, 2);
    const page = pages.find((item) => item.result.items[0].name === "nested");
    assert.ok(page);
    const itemIndex = 0;
    const chosen = page.result.items[itemIndex];
    // This is a separate explicit action after reading the original candidate.
    selection.select({
      snapshotId: instances.snapshotId,
      origin: "external",
      items: [{ ref: chosen.ref }],
    });
    assert.deepEqual(selection.current.items, [{ ref: chosen.ref }]);
    assert.equal(instances.state.pages, pages);
    assert.equal(tree.rows, initialRows);
    // Explicit host coordination, never an automatic action of the view/model.
    await tree.reveal(chosen.ref);
    assert.equal(tree.revealState.status, "success");
    const row = tree.rows.find((item) => item.id === tree.revealState.rowId);
    assert.equal(row.kind, "instance");
    assert.equal(row.instance.ref, chosen.ref);
    selection.back();
    assert.deepEqual(selection.current.items, [{ def: hit.ref }]);
    selection.forward();
    assert.deepEqual(selection.current.items, [{ ref: chosen.ref }]);
    assert.equal(instances.state.pages, pages);
    console.log(
      JSON.stringify({
        productionModel: true,
        viewExecuted: false,
        pages: 4,
        occurrences: 4,
        observedCompleteness: "complete",
      }),
    );
  } finally {
    tree.dispose();
    instances.dispose();
    search.dispose();
    selection.dispose();
  }
  assert.equal((await client.roots()).result.length, 2);
});

test("A definition view capability: one occurrence still retains definition until explicit selection", async (t) => {
  const client = await createSession(t);
  const search = new SearchModel(client);
  const instances = new DefinitionInstancesModel(client, { pageSize: 1 });
  const selection = new SelectionModel({ snapshotId: instances.snapshotId });
  try {
    const hit = await definition(search, "search_top");
    selection.select({
      snapshotId: instances.snapshotId,
      origin: "external",
      items: [{ def: hit.ref }],
    });
    const selectedDefinition = selection.current;
    await instances.load({ snapshotId: instances.snapshotId, def: hit.ref });
    assert.equal(instances.state.status, "success");
    assert.equal(instances.state.pages.length, 1);
    const page = instances.state.pages[0];
    assert.equal(page.completeness.status, "complete");
    assert.equal(page.result.items.length, 1);
    assert.equal(page.result.next, undefined);
    assert.equal(selection.current, selectedDefinition);
    await instances.loadMore();
    assert.equal(instances.state.pages[0], page);
    assert.equal(selection.current, selectedDefinition);
    await instances.reload();
    assert.equal(selection.current, selectedDefinition);
    const chosen = instances.state.pages[0].result.items[0];
    selection.select({
      snapshotId: instances.snapshotId,
      origin: "external",
      items: [{ ref: chosen.ref }],
    });
    const selectedInstance = selection.current;
    await instances.clear();
    assert.equal(instances.state.status, "idle");
    assert.equal(selection.current, selectedInstance);
    assert.deepEqual((await client.instance(chosen.ref)).result, chosen);
    console.log(
      JSON.stringify({
        productionModel: true,
        viewExecuted: false,
        pages: 1,
        occurrences: 1,
        observedCompleteness: "complete",
      }),
    );
  } finally {
    instances.dispose();
    search.dispose();
    selection.dispose();
  }
  assert.equal((await client.roots()).result.length, 2);
});
