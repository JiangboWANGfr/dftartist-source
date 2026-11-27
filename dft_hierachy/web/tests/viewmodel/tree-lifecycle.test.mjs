import assert from "node:assert/strict";
import { test } from "node:test";
import {
  model,
  load,
  row,
  scope,
  root,
  child,
  info,
  object,
  local,
  remote,
  watch,
} from "../independent-tree/harness.mjs";

// A supplemental regression cases. Reuse B's public Transport/fixture builders;
// do not change B's frozen first-page oracle or present these as B acceptance.
async function startPage(c, owner, items, next) {
  const pending = watch(c.tree.setExpanded(row(c.tree, owner).id, true));
  const request = await c.wire.next(
    "inst.children",
    (q) => q.params.inst === owner,
  );
  assert.equal(request.params.cursor, ""); // SDK canonical RequestCursor default.
  c.wire.ok(request, { items, ...(next === undefined ? {} : { next }) });
  await pending;
}
async function navigate(c, target) {
  const pending = watch(c.tree.reveal(target));
  const lookup = await c.wire.next("obj.get");
  c.wire.ok(lookup, object(target));
  const ancestry = await c.wire.next("inst.ancestors");
  c.wire.ok(ancestry, c.roots);
  return { pending };
}

for (const manual of [false, true])
  for (const shared of [false, true])
    test(`A Tree: scope collapse preserves request ownership, manual=${manual}, shared=${shared}`, async (t) => {
      const c = await model(t, { childCount: 2, options: { pageSize: 1 } });
      await load(c);
      await startPage(
        c,
        "B-root",
        [child("first", ["g", "first"])],
        "remaining",
      );
      const owner = row(c.tree, "B-root").id,
        group = scope(c.tree, ["g"]).id;
      const pageCommand = manual ? watch(c.tree.loadMore(owner)) : undefined;
      const locating = await navigate(c, "last");
      const page = await c.wire.next("inst.children");
      const outside = shared
        ? watch(c.client.children("B-root", { cursor: "remaining", limit: 1 }))
        : undefined;
      await c.tree.setExpanded(group, false);
      await assert.rejects(locating.pending, local("cancelled"));
      assert.equal(
        row(c.tree, "B-root").children.status,
        manual ? "pending" : "cancelled",
      );
      assert.equal(row(c.tree, "B-root").children.next, "remaining");
      assert.equal(
        c.wire.cancels.some((q) => q.params.target === page.id),
        !manual && !shared,
      );
      c.wire.ok(page, { items: [child("last", ["g", "last"])] });
      if (outside) assert.equal((await outside).result.items[0].ref, "last");
      if (pageCommand) await pageCommand;
      assert.equal(row(c.tree, "B-root").children.loadedCount, manual ? 2 : 1);
      assert.equal(scope(c.tree, ["g"]).expanded, false);
      assert.equal(
        c.tree.rows.some(
          (r) => r.kind === "instance" && r.instance.ref === "last",
        ),
        false,
      );
    });

test("A Tree: reload at SDK settlement invalidates old root continuation", async (t) => {
  const c = await model(t);
  const old = watch(c.tree.loadRoots()),
    oldRequest = await c.wire.next("inst.roots");
  c.wire.ok(oldRequest, [info("old", "old", ["old"])]);
  const fresh = watch(c.tree.reload(null)),
    newRequest = await c.wire.next("inst.roots");
  await assert.rejects(old, local("cancelled"));
  assert.equal(c.tree.rootState.loadedCount, 0);
  c.wire.ok(newRequest, c.roots);
  await fresh;
  assert.deepEqual(
    c.tree.rows.map((r) => r.kind === "instance" && r.instance.ref),
    ["B-root"],
  );
});

test("A Tree: bulk cancellation is atomic and its observer error belongs to cancel", async (t) => {
  const c = await model(t, { childCount: 2 });
  await load(c);
  await startPage(c, "B-root", [child("a", ["a"], 1), child("b", ["b"], 1)]);
  const a = watch(c.tree.setExpanded(row(c.tree, "a").id, true));
  const b = watch(c.tree.setExpanded(row(c.tree, "b").id, true));
  const qa = await c.wire.next("inst.children", (q) => q.params.inst === "a");
  const qb = await c.wire.next("inst.children", (q) => q.params.inst === "b");
  const marker = new Error("cancel observer"),
    seen = [];
  c.tree.subscribe(() => {
    seen.push([
      row(c.tree, "a").children.status,
      row(c.tree, "b").children.status,
    ]);
    throw marker;
  });
  await assert.rejects(
    c.tree.cancel(null),
    (e) =>
      e instanceof AggregateError &&
      e.errors.length === 1 &&
      e.errors[0] === marker,
  );
  await assert.rejects(a, local("cancelled"));
  await assert.rejects(b, local("cancelled"));
  assert.deepEqual(seen, [["cancelled", "cancelled"]]);
  c.wire.ok(qa, { items: [info("a-leaf", "leaf", ["top", "a", "leaf"])] });
  c.wire.ok(qb, { items: [info("b-leaf", "leaf", ["top", "b", "leaf"])] });
  assert.equal(
    c.tree.rows.some(
      (r) => r.kind === "instance" && r.instance.ref.endsWith("-leaf"),
    ),
    false,
  );
});

test("A Tree: dispose in failed notification retains original query and prior observer error", async (t) => {
  const c = await model(t),
    observer = new Error("listener");
  c.tree.subscribe(() => {
    if (c.tree.rootState.status === "failed") throw observer;
  });
  c.tree.subscribe(() => {
    if (c.tree.rootState.status === "failed") c.tree.dispose();
  });
  const pending = watch(c.tree.loadRoots()),
    request = await c.wire.next("inst.roots");
  c.wire.fail(request, "internal", "original Core failure");
  await assert.rejects(pending, (e) => {
    local("disposed")(e);
    assert.ok(e.cause instanceof AggregateError);
    assert.deepEqual(e.cause.errors, [observer]);
    remote("internal")(e.cause.cause);
    return true;
  });
  assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
  assert.deepEqual(c.tree.revealState, { status: "idle" });
  assert.deepEqual(c.tree.rows, []);
});

test("A Tree: empty continuing page cannot cause an unbounded reveal loop", async (t) => {
  const c = await model(t, { childCount: 2 });
  await load(c);
  const locating = await navigate(c, "target");
  const request = await c.wire.next("inst.children");
  c.wire.ok(request, { items: [], next: "different-but-no-progress" });
  await assert.rejects(locating.pending, local("inconsistent_reply"));
  assert.equal(row(c.tree, "B-root").children.loadedCount, 0);
  assert.equal(c.tree.revealState.status, "failed");
  assert.equal(
    c.wire.queries.filter((q) => q.method === "inst.children").length,
    1,
  );
});

test("A Tree: duplicate roots fail atomically and an explicit retry starts clean", async (t) => {
  const c = await model(t),
    pending = watch(c.tree.loadRoots());
  const request = await c.wire.next("inst.roots");
  c.wire.ok(request, [root(1), root(1)]);
  await assert.rejects(pending, local("inconsistent_reply"));
  assert.equal(c.tree.rootState.loadedCount, 0);
  assert.equal(c.tree.rows.length, 1);
  await load(c);
  assert.equal(c.tree.rootState.status, "success");
});

test("A Tree: reveal joins manual page while notification error stays with the initiating command", async (t) => {
  const c = await model(t);
  await load(c);
  const marker = new Error("manual page success listener");
  c.tree.subscribe(() => {
    if (
      row(c.tree, "B-root").children.status === "success" &&
      c.tree.revealState.status === "pending"
    )
      throw marker;
  });
  const manual = watch(c.tree.setExpanded(row(c.tree, "B-root").id, true));
  const request = await c.wire.next("inst.children");
  const locating = await navigate(c, "target");
  c.wire.ok(request, { items: [child("target")] });
  await assert.rejects(
    manual,
    (e) => e instanceof AggregateError && e.errors[0] === marker,
  );
  await locating.pending;
  assert.equal(c.tree.revealState.status, "success");
  assert.equal(row(c.tree, "B-root").children.status, "success");
});
