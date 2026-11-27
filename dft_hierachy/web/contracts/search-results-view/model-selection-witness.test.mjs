import assert from "node:assert/strict";
import test from "node:test";
import { SearchModel, SelectionModel } from "@hier/viewmodel";
import { createSession } from "../search/core-session.mjs";

// Actual accepted models/SDK/Core, without a view, synthetic state or transport.
// These A capability witnesses do not define B's future UI oracle.
test("A search selection/Core: six raw kinds and distinct same-name objects", async (t) => {
  const client = await createSession(t);
  const search = new SearchModel(client);
  const selection = new SelectionModel({ snapshotId: search.snapshotId });
  try {
    const initial = selection.current;
    await search.load({ snapshotId: search.snapshotId, text: "" });
    assert.equal(search.state.status, "success");
    assert.equal(selection.current, initial);
    assert.equal(search.state.pages.length, 1);
    const page = search.state.pages[0];
    assert.equal(page.result.next, undefined);
    const kinds = new Set();
    for (const hit of page.result.items) {
      if (kinds.has(hit.kind)) continue;
      kinds.add(hit.kind);
      const item =
        hit.kind === "definition" ? { def: hit.ref } : { ref: hit.ref };
      selection.select({
        snapshotId: search.snapshotId,
        origin: "external",
        items: [item],
      });
      assert.deepEqual(selection.current, {
        snapshotId: search.snapshotId,
        origin: "external",
        items: [item],
      });
      assert.equal(search.state.pages[0], page);
    }
    assert.deepEqual(
      [...kinds],
      ["definition", "instance", "port", "signal", "process", "register"],
    );
    const port = page.result.items.find(
      (hit) => hit.kind === "port" && hit.name === "a",
    );
    assert.ok(port);
    const signal = page.result.items.find(
      (hit) =>
        hit.kind === "signal" &&
        hit.name === port.name &&
        hit.inst === port.inst,
    );
    assert.ok(signal);
    assert.notEqual(signal.ref, port.ref);
    for (const hit of [port, signal]) {
      selection.select({
        snapshotId: search.snapshotId,
        origin: "external",
        items: [{ ref: hit.ref }],
      });
      assert.deepEqual(selection.current.items, [{ ref: hit.ref }]);
    }
    selection.back();
    assert.deepEqual(selection.current.items, [{ ref: port.ref }]);
  } finally {
    search.dispose();
    selection.dispose();
  }
  assert.equal((await client.roots()).result.length, 2);
});

test("A search selection/Core: explicit next page preserves the original prefix and selection", async (t) => {
  const client = await createSession(t);
  const search = new SearchModel(client, { pageSize: 1 });
  const selection = new SelectionModel({ snapshotId: search.snapshotId });
  try {
    await search.load({
      snapshotId: search.snapshotId,
      text: "",
      kinds: ["port"],
    });
    assert.equal(search.state.status, "success");
    assert.equal(search.state.pages.length, 1);
    const query = search.state.query;
    const first = search.state.pages[0];
    assert.ok(first.result.next);
    selection.select({
      snapshotId: search.snapshotId,
      origin: "external",
      items: [{ ref: first.result.items[0].ref }],
    });
    const selected = selection.current;
    await search.loadMore();
    assert.equal(search.state.status, "success");
    assert.equal(search.state.query, query);
    assert.equal(search.state.pages.length, 2);
    assert.equal(search.state.pages[0], first);
    assert.equal(selection.current, selected);
    const second = search.state.pages[1];
    assert.notEqual(second.result.items[0].ref, first.result.items[0].ref);
    selection.select({
      snapshotId: search.snapshotId,
      origin: "external",
      items: [{ ref: second.result.items[0].ref }],
    });
    assert.deepEqual(selection.current.items, [
      { ref: second.result.items[0].ref },
    ]);
  } finally {
    search.dispose();
    selection.dispose();
  }
});

test("A search selection/Core: selecting a definition retains the definition address", async (t) => {
  const client = await createSession(t);
  const search = new SearchModel(client);
  const selection = new SelectionModel({ snapshotId: search.snapshotId });
  try {
    await search.load({
      snapshotId: search.snapshotId,
      text: "search_leaf",
      kinds: ["definition"],
    });
    assert.equal(search.state.status, "success");
    const page = search.state.pages[0];
    assert.equal(page.result.items.length, 1);
    const hit = page.result.items[0];
    assert.equal(hit.kind, "definition");
    assert.equal(Object.hasOwn(hit, "inst"), false);
    selection.select({
      snapshotId: search.snapshotId,
      origin: "external",
      items: [{ def: hit.ref }],
    });
    const selected = selection.current;
    assert.deepEqual(selected.items, [{ def: hit.ref }]);
    // An explicit later host query proves that this definition has four choices.
    const occurrences = await client.instancesOf(hit.ref, { limit: 200 });
    assert.equal(occurrences.completeness.status, "complete");
    assert.equal(occurrences.result.next, undefined);
    assert.equal(occurrences.result.items.length, 4);
    assert.equal(selection.current, selected);
    assert.equal(search.state.pages[0], page);
  } finally {
    search.dispose();
    selection.dispose();
  }
});
