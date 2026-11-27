// Agent B frozen Tree behavioral oracle. Only DESIGN 6.6 and B inputs.
// No production implementation, private state controls or fake HierClient.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  guard,
  vm,
  capability,
  model,
  sdk,
  root,
  child,
  info,
  object,
  local,
  remote,
  complete,
  invoke,
  watch,
  row,
  scope,
  status,
  instances,
  scopes,
  load,
  first,
  more,
  frozen,
} from "./harness.mjs";

test(
  "T01: empty bound initial state, constructor performs no queries and values are frozen",
  guard,
  async (t) => {
    const c = await model(t),
      s = status(c.tree);
    assert.equal(c.tree.snapshotId, c.snap.snapshotId);
    assert.equal(c.tree.showGenerateScopes, true);
    assert.equal(c.tree.disposed, false);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
    assert.deepEqual(c.tree.revealState, { status: "idle" });
    assert.equal(c.tree.rows.length, 1);
    assert.equal(s.depth, 0);
    assert.deepEqual(s.state, c.tree.rootState);
    assert.equal(typeof s.id, "string");
    assert.equal(c.wire.queries.length, 0);
    frozen(c.tree.rows);
    frozen(c.tree.rootState);
  },
);
for (const [name, opts] of [
  ["false/1", { showGenerateScopes: false, pageSize: 1 }],
  ["true/MAX", { showGenerateScopes: true, pageSize: 2147483647 }],
  ["empty", {}],
  ["explicit undefined options", undefined],
])
  test("T01: lawful options " + name, guard, async (t) => {
    const c = await model(t, { options: opts });
    assert.equal(c.tree.showGenerateScopes, opts?.showGenerateScopes ?? true);
    assert.equal(c.wire.queries.length, 0);
  });
const invalidOptions = [
  ["null container", null],
  ["array container", []],
  ["function container", () => {}],
  ["string container", "B"],
  ["number container", 3],
  ...[undefined, null, 0, "true", {}, []].map((x) => [
    "show " + String(x),
    { showGenerateScopes: x },
  ]),
  ...[undefined, null, 0, -1, 1.5, NaN, Infinity, 2147483648, "2", 2n, {}].map(
    (x) => ["page " + String(x), { pageSize: x }],
  ),
];
for (const [n, opts] of invalidOptions)
  test("T01: rejects " + n + " without a query", guard, async (t) => {
    capability();
    const c = await sdk(t);
    assert.throws(
      () => new vm.TreeModel(c.client, opts),
      local("invalid_options"),
    );
    assert.equal(c.wire.queries.length, 0);
    assert.equal(c.wire.closed, false);
  });
for (const thrown of [new Error("B getter"), null, undefined, 17, Symbol("B")])
  test(
    "T01: getter throw preserves exact cause " + String(thrown),
    guard,
    async (t) => {
      capability();
      const c = await sdk(t),
        reads = [];
      const opts = {
        get showGenerateScopes() {
          reads.push("show");
          throw thrown;
        },
        get pageSize() {
          reads.push("page");
          return 1;
        },
      };
      assert.throws(
        () => new vm.TreeModel(c.client, opts),
        (e) => {
          local("invalid_options")(e);
          assert.ok(Object.hasOwn(e, "cause"));
          assert.equal(e.cause, thrown);
          return true;
        },
      );
      assert.deepEqual(reads, ["show"]);
      assert.equal(c.wire.queries.length, 0);
    },
  );
test(
  "T01: captures both declared values before primitive validation; ignores inherited extension getter",
  guard,
  async (t) => {
    capability();
    const c = await sdk(t),
      reads = [],
      thrown = {};
    const opts = Object.create({
      get showGenerateScopes() {
        reads.push("show");
        return 1;
      },
      get pageSize() {
        reads.push("page");
        throw thrown;
      },
      get extension() {
        assert.fail("must not enumerate unknown option");
      },
    });
    assert.throws(
      () => new vm.TreeModel(c.client, opts),
      (e) => {
        local("invalid_options")(e);
        assert.equal(e.cause, thrown);
        return true;
      },
    );
    assert.deepEqual(reads, ["show", "page"]);
  },
);
test(
  "T01: inherited options are read once, not retained or frozen; explicit page limit reaches SDK",
  guard,
  async (t) => {
    capability();
    let show = false,
      limit = 2;
    const reads = [];
    const opts = Object.create({
      get showGenerateScopes() {
        reads.push("show");
        return show;
      },
      get pageSize() {
        reads.push("page");
        return limit;
      },
      get ignored() {
        assert.fail("extension");
      },
    });
    const c = await model(t, { options: opts, childCount: 1 });
    show = true;
    limit = 9;
    await load(c);
    const q = await first(c, "B-root", [child("A")]);
    assert.equal(q.params.limit, 2);
    assert.equal(c.tree.showGenerateScopes, false);
    assert.deepEqual(reads, ["show", "page"]);
    assert.equal(Object.isFrozen(opts), false);
  },
);
test(
  "T01: omitted page size uses original SDK/Schema default 200",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const q = await first(c, "B-root", [child("A")]);
    assert.equal(q.params.limit, 200);
  },
);
test(
  "T01: valid options followed by unready client preserves public HierError; invalid options win before snapshot",
  guard,
  async (t) => {
    capability();
    const c = await sdk(t, [root(1)], "B-unready", false);
    assert.throws(
      () => new vm.TreeModel(c.client),
      remote("not_ready", "client"),
    );
    assert.throws(
      () => new vm.TreeModel(c.client, { pageSize: 0 }),
      local("invalid_options"),
    );
    assert.equal(c.wire.queries.length, 0);
  },
);
test(
  "T01: subscribing does not replay; TreeError is a public Error with closed code and message",
  guard,
  async (t) => {
    capability();
    const c = await model(t);
    let calls = 0;
    c.tree.subscribe(() => {
      calls++;
    });
    assert.equal(calls, 0);
    const e = new vm.TreeError("invalid_row", "B explicit");
    assert.ok(e instanceof Error);
    assert.equal(e.code, "invalid_row");
    assert.equal(e.message, "B explicit");
  },
);
test(
  "T02: zero roots settles complete with no status row and no phantom instance",
  guard,
  async (t) => {
    const c = await model(t, { roots: [] });
    await load(c);
    assert.deepEqual(c.tree.rows, []);
    assert.deepEqual(c.tree.rootState, {
      status: "success",
      loadedCount: 0,
      completeness: complete,
    });
  },
);
test(
  "T02: root order preserved, leaf cannot expand, roots completion has no extra notification",
  guard,
  async (t) => {
    const roots = [info("second", "z", ["z"]), info("first", "a", ["a"])],
      c = await model(t, { roots });
    await load(c);
    assert.deepEqual(
      instances(c.tree).map((r) => r.instance.ref),
      ["second", "first"],
    );
    for (const r of c.tree.rows) {
      assert.equal(r.depth, 0);
      assert.equal(r.parentId, null);
      assert.equal(r.expandable, false);
      assert.equal(r.expanded, false);
      assert.deepEqual(r.children, {
        status: "success",
        loadedCount: 0,
        completeness: complete,
      });
    }
    let calls = 0;
    c.tree.subscribe(() => {
      calls++;
    });
    const before = c.wire.queries.length;
    await invoke(c.tree, "setExpanded", row(c.tree, "second").id, true);
    await invoke(c.tree, "setExpanded", row(c.tree, "second").id, false);
    await invoke(c.tree, "loadRoots");
    assert.equal(calls, 0);
    assert.equal(c.wire.queries.length, before);
  },
);
test(
  "T02: exact multi-level path projection, dotted single segment is not split, scope has no semantic ref",
  guard,
  async (t) => {
    const kids = [
      child("A", ["g.with.dot", "a"]),
      child("B", ["g.with.dot", "b"]),
      child("C", ["g", "with", "dot", "a"]),
      child("D", ["plain"]),
    ];
    const c = await model(t, { childCount: 4 });
    await load(c);
    await first(c, "B-root", kids);
    assert.deepEqual(
      c.tree.rows.map((r) => r.kind),
      [
        "instance",
        "scope",
        "instance",
        "instance",
        "scope",
        "scope",
        "scope",
        "instance",
        "instance",
      ],
    );
    assert.deepEqual(
      scopes(c.tree).map((r) => r.scopePath),
      [["g.with.dot"], ["g"], ["g", "with"], ["g", "with", "dot"]],
    );
    for (const r of scopes(c.tree)) {
      assert.equal(r.owner, "B-root");
      assert.equal(r.expanded, true);
      assert.equal(typeof r.label, "string");
      assert.equal(Object.hasOwn(r, "ref"), false);
      assert.equal(Object.hasOwn(r, "def"), false);
      assert.equal(Object.hasOwn(r, "instance"), false);
    }
    assert.equal(row(c.tree, "A").parentId, scope(c.tree, ["g.with.dot"]).id);
    assert.equal(
      row(c.tree, "C").parentId,
      scope(c.tree, ["g", "with", "dot"]).id,
    );
    assert.equal(row(c.tree, "C").depth, 4);
    assert.notEqual(row(c.tree, "A").id, row(c.tree, "C").id);
    assert.equal(row(c.tree, "D").parentId, row(c.tree, "B-root").id);
    frozen(c.tree.rows);
  },
);
for (const segment of [
  "g/with/slash",
  "g\\with\\slash",
  "g[-2]",
  "é",
  "e\u0301",
])
  test("T02: opaque scope segment preserved " + segment, guard, async (t) => {
    const c = await model(t);
    await load(c);
    await first(c, "B-root", [child("A", [segment, "u[-1]"])]);
    assert.deepEqual(scope(c.tree, [segment]).scopePath, [segment]);
    assert.deepEqual(row(c.tree, "A").instance.path, ["top", segment, "u[-1]"]);
    assert.equal(row(c.tree, "A").instance.name, "u[-1]");
  });
test(
  "T02: Unicode-normalization-distinct scopes and paths stay distinct",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 2 });
    await load(c);
    await first(c, "B-root", [
      child("A", ["é", "u"]),
      child("B", ["e\u0301", "u"]),
    ]);
    assert.equal(scopes(c.tree).length, 2);
    assert.notEqual(scope(c.tree, ["é"]).id, scope(c.tree, ["e\u0301"]).id);
  },
);
test(
  "T02: grouping toggle changes only projection, instance order and IDs survive, hidden scope ID rejected",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 3 });
    await load(c);
    await first(c, "B-root", [
      child("A", ["g", "a"]),
      child("B", ["plain"]),
      child("C", ["g", "c"]),
    ]);
    const ids = new Map(instances(c.tree).map((r) => [r.instance.ref, r.id])),
      group = scope(c.tree, ["g"]);
    const before = c.wire.queries.length;
    await invoke(c.tree, "setShowGenerateScopes", false);
    assert.equal(scopes(c.tree).length, 0);
    assert.deepEqual(
      instances(c.tree).map((r) => r.instance.ref),
      ["B-root", "A", "B", "C"],
    );
    for (const r of instances(c.tree))
      assert.equal(r.id, ids.get(r.instance.ref));
    await assert.rejects(
      invoke(c.tree, "setExpanded", group.id, false),
      local("invalid_row"),
    );
    await invoke(c.tree, "setShowGenerateScopes", true);
    assert.equal(scope(c.tree, ["g"]).id, group.id);
    assert.deepEqual(
      instances(c.tree).map((r) => r.instance.ref),
      ["B-root", "A", "C", "B"],
    );
    assert.equal(c.wire.queries.length, before);
  },
);
test(
  "T03: roots has one pending task and pending/settled notify exactly once each",
  guard,
  async (t) => {
    const c = await model(t),
      seen = [];
    c.tree.subscribe(() => {
      seen.push(c.tree.rootState.status);
      frozen(c.tree.rows);
    });
    const a = invoke(c.tree, "loadRoots"),
      b = invoke(c.tree, "loadRoots");
    const q = await c.wire.next("inst.roots");
    assert.equal(c.wire.queries.length, 1);
    assert.equal(c.tree.rootState.status, "pending");
    assert.equal(c.tree.rootState.loadedCount, 0);
    assert.equal(Object.hasOwn(c.tree.rootState, "completeness"), false);
    c.wire.ok(q, c.roots);
    await Promise.all([a, b]);
    assert.deepEqual(seen, ["pending", "success"]);
  },
);
test(
  "T03: same branch repeated true and loadMore join first in-flight page without toggling",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const id = row(c.tree, "B-root").id;
    const a = invoke(c.tree, "setExpanded", id, true),
      b = invoke(c.tree, "setExpanded", id, true),
      d = invoke(c.tree, "loadMore", id);
    const q = await c.wire.next("inst.children");
    assert.equal(c.wire.queries.length, 2);
    assert.equal(row(c.tree, "B-root").expanded, true);
    assert.equal(row(c.tree, "B-root").children.status, "pending");
    c.wire.ok(q, { items: [child("A")] });
    await Promise.all([a, b, d]);
    assert.equal(row(c.tree, "B-root").children.loadedCount, 1);
    assert.equal(
      instances(c.tree).filter((r) => r.instance.ref === "A").length,
      1,
    );
  },
);
test(
  "T03: cross-page scope merged once, Core cursor opaque, page status stays outside collapsed scope",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 3, options: { pageSize: 1 } });
    await load(c);
    await first(c, "B-root", [child("A", ["g", "a"])], "cursor.with/slash");
    const gid = scope(c.tree, ["g"]).id,
      owner = row(c.tree, "B-root").id,
      sid = status(c.tree, owner).id;
    await invoke(c.tree, "setExpanded", gid, false);
    const q = await more(
      c,
      "B-root",
      [child("B", ["g", "b"])],
      "next2",
      "cursor.with/slash",
    );
    assert.equal(q.params.limit, 1);
    assert.equal(scopes(c.tree).length, 1);
    assert.equal(scope(c.tree, ["g"]).id, gid);
    assert.equal(scope(c.tree, ["g"]).expanded, false);
    assert.equal(instances(c.tree).length, 1);
    assert.equal(status(c.tree, owner).id, sid);
    assert.equal(status(c.tree, owner).depth, 1);
    await invoke(c.tree, "setExpanded", gid, true);
    assert.deepEqual(
      instances(c.tree).map((r) => r.instance.ref),
      ["B-root", "A", "B"],
    );
    await more(c, "B-root", [child("C", ["plain"])], undefined, "next2");
    assert.equal(row(c.tree, "B-root").children.loadedCount, 3);
    assert.equal(c.tree.rows.filter((r) => r.kind === "status").length, 0);
  },
);
test(
  "T03: independent expanded branches can complete in reverse order",
  guard,
  async (t) => {
    const a = child("A", ["a"], 1),
      b = child("B", ["b"], 1);
    const c = await model(t, { childCount: 2 });
    await load(c);
    await first(c, "B-root", [a, b]);
    const pa = invoke(c.tree, "setExpanded", row(c.tree, "A").id, true);
    const pb = invoke(c.tree, "setExpanded", row(c.tree, "B").id, true);
    const qa = await c.wire.next("inst.children", (r) => r.params.inst === "A"),
      qb = await c.wire.next("inst.children", (r) => r.params.inst === "B");
    c.wire.ok(qb, { items: [info("B-leaf", "leaf", ["top", "b", "leaf"])] });
    await pb;
    assert.equal(row(c.tree, "A").children.status, "pending");
    c.wire.ok(qa, { items: [info("A-leaf", "leaf", ["top", "a", "leaf"])] });
    await pa;
    assert.equal(row(c.tree, "A-leaf").parentId, row(c.tree, "A").id);
    assert.equal(row(c.tree, "B-leaf").parentId, row(c.tree, "B").id);
  },
);
test(
  "T03: complete no-next loadMore and completed cancel are no-ops",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    await first(c, "B-root", [child("A")]);
    const before = c.wire.queries.length,
      state = c.tree.rows;
    let calls = 0;
    c.tree.subscribe(() => {
      calls++;
    });
    await invoke(c.tree, "loadMore", row(c.tree, "B-root").id);
    await invoke(c.tree, "cancel", null);
    assert.deepEqual(c.tree.rows, state);
    assert.equal(calls, 0);
    assert.equal(c.wire.queries.length, before);
  },
);
const argumentsCases = [
  ...[null, 3, undefined, {}, () => {}].flatMap((value) =>
    ["setExpanded", "loadMore"].map((method) => [
      method + "/" + String(value),
      method,
      method === "setExpanded" ? [value, true] : [value],
    ]),
  ),
  ...[3, undefined, {}, () => {}].flatMap((value) =>
    ["reload", "cancel"].map((method) => [
      method + "/" + String(value),
      method,
      [value],
    ]),
  ),
  ...[undefined, null, 1, "true", {}].map((value) => [
    "group/" + String(value),
    "setShowGenerateScopes",
    [value],
  ]),
  ...[undefined, null, 1, "", {}, () => {}].map((value) => [
    "reveal/" + String(value),
    "reveal",
    [value],
  ]),
];
for (const [name, method, args] of argumentsCases)
  test(
    "T04: invalid primitive " + name + " rejects Promise atomically",
    guard,
    async (t) => {
      const c = await model(t),
        before = c.tree.rows;
      await assert.rejects(
        invoke(c.tree, method, ...args),
        local("invalid_argument"),
      );
      assert.deepEqual(c.tree.rows, before);
      assert.equal(c.wire.queries.length, 0);
    },
  );
test(
  "T04: invalid boolean object never coerces toString/valueOf",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    let coerced = 0;
    const value = {
      valueOf() {
        coerced++;
        return true;
      },
      toString() {
        coerced++;
        return "true";
      },
    };
    await assert.rejects(
      invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, value),
      local("invalid_argument"),
    );
    assert.equal(coerced, 0);
    assert.equal(row(c.tree, "B-root").expanded, false);
  },
);
for (const method of ["setExpanded", "loadMore", "reload", "cancel"])
  test("T04: unknown opaque row ID for " + method, guard, async (t) => {
    const c = await model(t);
    await load(c);
    const args =
      method === "setExpanded" ? ["not-this-model", true] : ["not-this-model"];
    await assert.rejects(invoke(c.tree, method, ...args), local("invalid_row"));
  });
test(
  "T04: foreign same-snapshot model IDs cannot be used and neither model is modified",
  guard,
  async (t) => {
    const a = await model(t),
      b = await model(t);
    await load(a);
    await load(b);
    const aid = row(a.tree, "B-root").id,
      bid = row(b.tree, "B-root").id;
    assert.notEqual(aid, bid);
    await assert.rejects(
      invoke(a.tree, "setExpanded", bid, true),
      local("invalid_row"),
    );
    assert.equal(row(a.tree, "B-root").expanded, false);
    assert.equal(row(b.tree, "B-root").expanded, false);
  },
);
test(
  "T04: status IDs and scope IDs cannot page/reload/cancel; folded instance cannot loadMore",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 2 });
    const initial = status(c.tree).id;
    for (const method of ["loadMore", "reload", "cancel"])
      await assert.rejects(
        invoke(c.tree, method, initial),
        local("invalid_row"),
      );
    await load(c);
    const parent = row(c.tree, "B-root").id;
    await assert.rejects(
      invoke(c.tree, "loadMore", parent),
      local("invalid_row"),
    );
    await first(c, "B-root", [child("A", ["g", "a"])], "next");
    const gid = scope(c.tree, ["g"]).id;
    for (const method of ["loadMore", "reload", "cancel"])
      await assert.rejects(invoke(c.tree, method, gid), local("invalid_row"));
  },
);
test(
  "T04: fold/re-expand retains descendants and their expanded intent without a fresh request",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    await first(c, "B-root", [child("A", ["a"], 1)]);
    await first(c, "A", [info("leaf", "leaf", ["top", "a", "leaf"])]);
    const aid = row(c.tree, "A").id,
      leaf = row(c.tree, "leaf"),
      before = c.wire.queries.length;
    await invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, false);
    await assert.rejects(
      invoke(c.tree, "setExpanded", aid, false),
      local("invalid_row"),
    );
    await invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
    assert.equal(row(c.tree, "A").id, aid);
    assert.equal(row(c.tree, "A").expanded, true);
    assert.deepEqual(row(c.tree, "leaf"), leaf);
    assert.equal(c.wire.queries.length, before);
  },
);
test(
  "T04: collapse invalidates in-flight first page; late reply cannot re-expand or add rows",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const id = row(c.tree, "B-root").id;
    const p = invoke(c.tree, "setExpanded", id, true),
      q = await c.wire.next("inst.children");
    await invoke(c.tree, "setExpanded", id, false);
    await assert.rejects(p, local("cancelled"));
    assert.equal(row(c.tree, "B-root").expanded, false);
    assert.equal(row(c.tree, "B-root").children.status, "cancelled");
    c.wire.ok(q, { items: [child("late")] });
    const again = invoke(c.tree, "setExpanded", id, true);
    await assert.rejects(again, local("cancelled"));
    assert.equal(instances(c.tree).length, 1);
    const retry = invoke(c.tree, "loadMore", id),
      fresh = await c.wire.next("inst.children");
    c.wire.ok(fresh, { items: [child("A")] });
    await retry;
    assert.equal(row(c.tree, "A").instance.ref, "A");
  },
);
test(
  "T04: reload removes prefix, old row cannot operate until restored with original ID",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    await first(c, "B-root", [child("A")]);
    const aid = row(c.tree, "A").id,
      old = c.tree.rows,
      rootId = row(c.tree, "B-root").id;
    const p = invoke(c.tree, "reload", rootId),
      q = await c.wire.next("inst.children");
    assert.equal(row(c.tree, "B-root").expanded, true);
    assert.equal(row(c.tree, "B-root").children.loadedCount, 0);
    await assert.rejects(
      invoke(c.tree, "setExpanded", aid, false),
      local("invalid_row"),
    );
    c.wire.ok(q, { items: [child("A")] });
    await p;
    assert.equal(row(c.tree, "A").id, aid);
    frozen(old);
    assert.equal(old.length, 2);
  },
);
test(
  "T04: reload a visible folded instance does not expand it",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const p = invoke(c.tree, "reload", row(c.tree, "B-root").id),
      q = await c.wire.next("inst.children");
    c.wire.ok(q, { items: [child("A")] });
    await p;
    assert.equal(row(c.tree, "B-root").expanded, false);
    assert.equal(instances(c.tree).length, 1);
    const before = c.wire.queries.length;
    await invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true);
    assert.equal(row(c.tree, "A").instance.ref, "A");
    assert.equal(c.wire.queries.length, before);
  },
);
test(
  "T04: cancelling Tree subscriber does not cancel another shared SDK consumer or close SDK",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const id = row(c.tree, "B-root").id;
    const p = invoke(c.tree, "setExpanded", id, true),
      q = await c.wire.next("inst.children");
    const external = watch(c.client.children("B-root", { limit: 200 }));
    await invoke(c.tree, "cancel", id);
    await assert.rejects(p, local("cancelled"));
    assert.equal(c.wire.cancels.length, 0);
    assert.equal(c.wire.closed, false);
    c.wire.ok(q, { items: [child("A")] });
    assert.equal((await external).result.items[0].ref, "A");
    assert.equal(row(c.tree, "B-root").children.status, "cancelled");
    assert.equal(instances(c.tree).length, 1);
  },
);
test(
  "T05: roots Core failure retained in read state; explicit loadRoots retries successfully",
  guard,
  async (t) => {
    const c = await model(t),
      p = invoke(c.tree, "loadRoots"),
      q = await c.wire.next("inst.roots");
    c.wire.fail(q, "internal", "B root diagnostic", { nested: { x: [1] } });
    let rejected;
    await assert.rejects(p, (e) => {
      rejected = e;
      return remote("internal")(e);
    });
    assert.equal(Object.isFrozen(rejected), false);
    assert.equal(c.tree.rootState.status, "failed");
    assert.deepEqual(c.tree.rootState.error, {
      code: "internal",
      origin: "core",
      message: "B root diagnostic",
      data: { nested: { x: [1] } },
    });
    frozen(c.tree.rootState);
    assert.equal(c.wire.closed, false);
    await load(c);
    assert.equal(c.tree.rootState.status, "success");
  },
);
test(
  "T05: failed second page preserves prefix/cursor and true returns existing error, loadMore retries cursor",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 2 });
    await load(c);
    await first(c, "B-root", [child("A")], "next");
    const id = row(c.tree, "B-root").id,
      p = invoke(c.tree, "loadMore", id),
      q = await c.wire.next("inst.children");
    assert.equal(q.params.cursor, "next");
    c.wire.fail(q, "stale_cursor");
    await assert.rejects(p, remote("stale_cursor"));
    const state = row(c.tree, "B-root").children;
    assert.equal(state.status, "failed");
    assert.equal(state.loadedCount, 1);
    assert.equal(state.next, "next");
    assert.deepEqual(
      instances(c.tree).map((r) => r.instance.ref),
      ["B-root", "A"],
    );
    const before = c.wire.queries.length;
    await assert.rejects(
      invoke(c.tree, "setExpanded", id, true),
      remote("stale_cursor"),
    );
    assert.equal(c.wire.queries.length, before);
    await more(c, "B-root", [child("B")], undefined, "next");
    assert.equal(row(c.tree, "B-root").children.loadedCount, 2);
  },
);
for (const [name, item] of [
  ["owner path not a segment prefix", info("bad", "a", ["topper", "a"])],
  ["not strict prefix", info("bad", "top", ["top"])],
  ["name differs from last segment", info("bad", "different", ["top", "a"])],
])
  test(
    "T05: " + name + " makes page inconsistent without a committed item",
    guard,
    async (t) => {
      const c = await model(t);
      await load(c);
      const p = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true),
        q = await c.wire.next("inst.children");
      c.wire.ok(q, { items: [item] });
      await assert.rejects(p, local("inconsistent_reply"));
      assert.equal(row(c.tree, "B-root").children.loadedCount, 0);
      assert.equal(instances(c.tree).length, 1);
    },
  );
for (const mode of [
  "cross-page repeated ref",
  "repeated cursor",
  "complete terminal count mismatch",
])
  test("T05: atomic bad page " + mode, guard, async (t) => {
    const c = await model(t, {
      childCount: mode === "complete terminal count mismatch" ? 2 : 3,
    });
    await load(c);
    await first(c, "B-root", [child("A")], "next");
    const p = invoke(c.tree, "loadMore", row(c.tree, "B-root").id),
      q = await c.wire.next("inst.children");
    const result =
      mode === "cross-page repeated ref"
        ? { items: [child("A"), child("B")] }
        : mode === "repeated cursor"
          ? { items: [child("B")], next: "next" }
          : { items: [child("B"), child("C")] };
    c.wire.ok(q, result);
    await assert.rejects(p, local("inconsistent_reply"));
    const s = row(c.tree, "B-root").children;
    assert.equal(s.status, "failed");
    assert.equal(s.error.origin, "tree");
    assert.equal(s.loadedCount, 1);
    assert.equal(s.next, "next");
    assert.deepEqual(
      instances(c.tree).map((r) => r.instance.ref),
      ["B-root", "A"],
    );
  });
test(
  "T05: cursor cycle cannot start an infinite page loop",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 4 });
    await load(c);
    await first(c, "B-root", [child("A")], "one");
    await more(c, "B-root", [child("B")], "two", "one");
    const p = invoke(c.tree, "loadMore", row(c.tree, "B-root").id),
      q = await c.wire.next("inst.children");
    c.wire.ok(q, { items: [child("C")], next: "one" });
    await assert.rejects(p, local("inconsistent_reply"));
    assert.equal(row(c.tree, "B-root").children.loadedCount, 2);
    assert.equal(c.wire.queries.length, 4);
  },
);
test(
  "T05: transport failure remains transport HierError, not a local empty success",
  guard,
  async (t) => {
    const c = await model(t),
      p = invoke(c.tree, "loadRoots");
    await c.wire.next("inst.roots");
    c.wire.close();
    await assert.rejects(p, remote("transport_closed", "transport"));
    assert.equal(c.tree.rootState.status, "failed");
    assert.equal(c.tree.rootState.error.origin, "transport");
    assert.equal(c.tree.disposed, false);
  },
);
async function revealObject(
  c,
  ref,
  inst = ref,
  kind = "instance",
  chain = [root(c.roots[0].childCount)],
) {
  const p = invoke(c.tree, "reveal", ref),
    o = await c.wire.next("obj.get");
  assert.equal(o.params.ref, ref);
  c.wire.ok(o, object(ref, inst, kind));
  const a = await c.wire.next("inst.ancestors");
  assert.equal(a.params.inst, inst);
  c.wire.ok(a, chain);
  return { p }; // Do not assimilate a still-pending command Promise.
}
test(
  "T06: reveal follows second page, opens scope/ancestor but not target, reuses a manual prefix",
  guard,
  async (t) => {
    const c = await model(t, { childCount: 2, options: { pageSize: 1 } });
    await load(c);
    await first(c, "B-root", [child("A")], "opaque-next");
    const { p } = await revealObject(c, "target");
    const q = await c.wire.next("inst.children");
    assert.equal(q.params.cursor, "opaque-next");
    c.wire.ok(q, { items: [child("target", ["g", "target"], 1)] });
    await p;
    assert.deepEqual(c.tree.revealState, {
      status: "success",
      ref: "target",
      rowId: row(c.tree, "target").id,
    });
    assert.equal(row(c.tree, "target").expanded, false);
    assert.equal(scope(c.tree, ["g"]).expanded, true);
    assert.equal(
      c.wire.queries.filter((x) => x.method === "inst.children").length,
      2,
    );
  },
);
test(
  "T06: non-instance opaque ref locates true owner while retaining original ref",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    await first(c, "B-root", [child("owner")]);
    const { p } = await revealObject(
      c,
      "opaque.port/with.dot",
      "owner",
      "port",
    );
    await p;
    assert.equal(c.tree.revealState.ref, "opaque.port/with.dot");
    assert.equal(c.tree.revealState.rowId, row(c.tree, "owner").id);
  },
);
test(
  "T06: root reveal loads roots if needed and does not expand the root",
  guard,
  async (t) => {
    const c = await model(t),
      { p } = await revealObject(c, "B-root", "B-root", "instance", []);
    const q = await c.wire.next("inst.roots");
    c.wire.ok(q, c.roots);
    await p;
    assert.equal(c.tree.revealState.rowId, row(c.tree, "B-root").id);
    assert.equal(row(c.tree, "B-root").expanded, false);
  },
);
test(
  "T06: DefRef-looking text is sent unchanged; Core bad_request retained, never picks an occurrence",
  guard,
  async (t) => {
    const c = await model(t),
      p = invoke(c.tree, "reveal", "d:17"),
      q = await c.wire.next("obj.get");
    assert.equal(q.params.ref, "d:17");
    c.wire.fail(q, "bad_request");
    await assert.rejects(p, remote("bad_request"));
    assert.equal(c.tree.revealState.status, "failed");
    assert.equal(c.tree.revealState.error.origin, "core");
    assert.equal(instances(c.tree).length, 0);
    assert.equal(c.wire.queries.length, 1);
  },
);
test(
  "T06: complete chain but exhausted page missing target fails inconsistent_reply, never similar-name fallback",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    await first(c, "B-root", [child("similar", ["target"])]);
    const { p } = await revealObject(c, "target");
    await assert.rejects(p, local("inconsistent_reply"));
    assert.equal(c.tree.revealState.status, "failed");
    assert.equal(row(c.tree, "similar").expanded, false);
  },
);
test(
  "T06: repeated ancestor reference is inconsistent, does not fabricate rows from ancestors",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const { p } = await revealObject(c, "target", "target", "instance", [
      root(1),
      root(1),
    ]);
    await assert.rejects(p, local("inconsistent_reply"));
    assert.equal(instances(c.tree).length, 1);
  },
);
for (const same of [false, true])
  test(
    "T07: new reveal supersedes old object wait, same ref=" + same,
    guard,
    async (t) => {
      const c = await model(t);
      await load(c);
      await first(c, "B-root", [child("target")]);
      const a = invoke(c.tree, "reveal", "old"),
        qa = await c.wire.next("obj.get");
      const ref = same ? "old" : "new",
        b = invoke(c.tree, "reveal", ref);
      await assert.rejects(a, local("cancelled"));
      const qb = await c.wire.next("obj.get");
      assert.notEqual(qb.id, qa.id);
      c.wire.ok(qa, object("old", "target", "port"));
      assert.equal(c.tree.revealState.status, "pending");
      assert.equal(c.tree.revealState.ref, ref);
      c.wire.ok(qb, object(ref, "target", "port"));
      const anc = await c.wire.next("inst.ancestors");
      c.wire.ok(anc, c.roots);
      await b;
      assert.equal(c.tree.revealState.status, "success");
      assert.equal(c.tree.revealState.ref, ref);
    },
  );
test(
  "T07: validated no-op external command cancels active reveal; invalid argument does not",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const p = invoke(c.tree, "reveal", "old"),
      q = await c.wire.next("obj.get");
    await assert.rejects(
      invoke(c.tree, "setShowGenerateScopes", 1),
      local("invalid_argument"),
    );
    assert.equal(c.tree.revealState.status, "pending");
    await invoke(c.tree, "setShowGenerateScopes", true);
    await assert.rejects(p, local("cancelled"));
    c.wire.ok(q, object("old", "B-root"));
    assert.equal(c.tree.revealState.status, "cancelled");
  },
);
test(
  "T07: invalid row leaves active reveal intact; explicit fold invalidates it even at SDK settlement boundary",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const p = invoke(c.tree, "reveal", "target"),
      q = await c.wire.next("obj.get");
    await assert.rejects(
      invoke(c.tree, "setExpanded", "not-this-model", false),
      local("invalid_row"),
    );
    c.wire.ok(q, object("target"));
    // SDK response has been delivered; tree continuation is still queued.
    const fold = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, false);
    await fold;
    await assert.rejects(p, local("cancelled"));
    assert.equal(row(c.tree, "B-root").expanded, false);
    assert.equal(
      c.wire.queries.some((x) => x.method === "inst.ancestors"),
      false,
    );
  },
);
test(
  "T07: reveal waiting on a preexisting manual page does not own its cancellation",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const rid = row(c.tree, "B-root").id;
    const manual = invoke(c.tree, "setExpanded", rid, true),
      page = await c.wire.next("inst.children");
    const { p } = await revealObject(c, "target");
    await invoke(c.tree, "setShowGenerateScopes", false);
    await assert.rejects(p, local("cancelled"));
    assert.equal(
      c.wire.cancels.some((x) => x.params.target === page.id),
      false,
    );
    c.wire.ok(page, { items: [child("target")] });
    await manual;
    assert.equal(row(c.tree, "target").instance.ref, "target");
    assert.equal(c.tree.revealState.status, "cancelled");
  },
);
test(
  "T08: registration identity, cancel-before-turn, add-next-batch and same committed state",
  guard,
  async (t) => {
    const c = await model(t),
      seen = [];
    let offB,
      newOff,
      did = false;
    c.tree.subscribe(() => {
      seen.push(["a", c.tree.rootState.status]);
      if (!did) {
        did = true;
        offB();
        newOff = c.tree.subscribe(() =>
          seen.push(["new", c.tree.rootState.status]),
        );
      }
    });
    offB = c.tree.subscribe(() =>
      seen.push(["removed", c.tree.rootState.status]),
    );
    const listener = () => seen.push(["peer", c.tree.rootState.status]);
    c.tree.subscribe(listener);
    c.tree.subscribe(listener);
    await load(c);
    assert.deepEqual(seen, [
      ["a", "pending"],
      ["peer", "pending"],
      ["peer", "pending"],
      ["a", "success"],
      ["peer", "success"],
      ["peer", "success"],
      ["new", "success"],
    ]);
    offB();
    newOff();
    newOff();
  },
);
test(
  "T08: observer throw preserves command work and rejects AggregateError in temporal/registration order",
  guard,
  async (t) => {
    const c = await model(t),
      a = { source: "B" },
      b = Symbol("B"),
      seen = [];
    c.tree.subscribe(() => {
      throw a;
    });
    c.tree.subscribe(() => {
      seen.push(c.tree.rootState.status);
      throw b;
    });
    const p = invoke(c.tree, "loadRoots"),
      q = await c.wire.next("inst.roots");
    c.wire.ok(q, c.roots);
    await assert.rejects(p, (e) => {
      assert.ok(e instanceof AggregateError);
      assert.deepEqual(e.errors, [a, b, a, b]);
      return true;
    });
    assert.equal(c.tree.rootState.status, "success");
    assert.deepEqual(seen, ["pending", "success"]);
  },
);
test(
  "T08: observer rejection cause preserves failed query and readable Core diagnosis",
  guard,
  async (t) => {
    const c = await model(t),
      failure = new Error("B observer");
    c.tree.subscribe(() => {
      throw failure;
    });
    const p = invoke(c.tree, "loadRoots"),
      q = await c.wire.next("inst.roots");
    c.wire.fail(q, "internal", "B query original");
    await assert.rejects(p, (e) => {
      assert.ok(e instanceof AggregateError);
      assert.deepEqual(e.errors, [failure, failure]);
      remote("internal")(e.cause);
      assert.equal(e.cause.message, "B query original");
      return true;
    });
    assert.equal(c.tree.rootState.status, "failed");
    assert.equal(c.tree.rootState.error.message, "B query original");
  },
);
const notificationCommands = [
  ["loadRoots", []],
  ["setExpanded", null],
  ["loadMore", null],
  ["reload", [null]],
  ["cancel", [null]],
  ["setShowGenerateScopes", [true]],
  ["reveal", ["B-root"]],
];
for (const [method, args] of notificationCommands)
  test(
    "T08: legal " +
      method +
      " including no-op rejects reentrant_change during notification",
    guard,
    async (t) => {
      const c = await model(t);
      await load(c);
      const rid = row(c.tree, "B-root").id,
        rejected = [];
      const off = c.tree.subscribe(() => {
        const values =
          args ?? (method === "setExpanded" ? [rid, false] : [rid]);
        rejected.push(
          assert.rejects(
            invoke(c.tree, method, ...values),
            local("reentrant_change"),
          ),
        );
      });
      await first(c, "B-root", [child("A")]);
      off();
      await Promise.all(rejected);
      assert.equal(rejected.length, 2);
      assert.equal(row(c.tree, "B-root").children.status, "success");
    },
  );
for (const bad of [null, {}, 1, "function"])
  test(
    "T08: invalid subscription " + String(bad) + " synchronously rejected",
    guard,
    async (t) => {
      const c = await model(t);
      assert.throws(() => c.tree.subscribe(bad), local("invalid_argument"));
    },
  );
test(
  "T08: dispose inside pending listener stops peers, settles disposed and does not close SDK",
  guard,
  async (t) => {
    const c = await model(t);
    let peer = 0;
    c.tree.subscribe(() => c.tree.dispose());
    c.tree.subscribe(() => {
      peer++;
    });
    const p = invoke(c.tree, "loadRoots");
    await assert.rejects(p, local("disposed"));
    assert.equal(peer, 0);
    assert.equal(c.tree.disposed, true);
    assert.deepEqual(c.tree.rows, []);
    assert.equal(c.wire.closed, false);
  },
);
test(
  "T08: dispose before SDK continuation wins, has no second state publication and old frozen values stay valid",
  guard,
  async (t) => {
    const c = await model(t);
    await load(c);
    const old = c.tree.rows;
    let count = 0;
    const off = c.tree.subscribe(() => {
      count++;
    });
    const p = invoke(c.tree, "setExpanded", row(c.tree, "B-root").id, true),
      q = await c.wire.next("inst.children");
    c.wire.ok(q, { items: [child("A")] });
    c.tree.dispose();
    c.tree.dispose();
    await assert.rejects(p, local("disposed"));
    off();
    off();
    assert.equal(count, 1);
    assert.deepEqual(c.tree.rows, []);
    frozen(old);
    assert.equal(old.length, 1);
    assert.equal(c.tree.snapshotId, c.snap.snapshotId);
    assert.equal(c.tree.showGenerateScopes, true);
    assert.deepEqual(c.tree.rootState, { status: "idle", loadedCount: 0 });
    assert.deepEqual(c.tree.revealState, { status: "idle" });
    const shared = watch(c.client.roots()),
      live = await c.wire.next("inst.roots");
    c.wire.ok(live, c.roots);
    assert.equal((await shared).result.length, 1);
    assert.equal(c.wire.closed, false);
  },
);
for (const [method, args] of [
  ["loadRoots", []],
  ["setExpanded", [null, null]],
  ["loadMore", [null]],
  ["reload", [undefined]],
  ["cancel", [undefined]],
  ["setShowGenerateScopes", [null]],
  ["reveal", [null]],
])
  test(
    "T08: disposed priority and rejected-Promise form for " + method,
    guard,
    async (t) => {
      const c = await model(t);
      c.tree.dispose();
      await assert.rejects(invoke(c.tree, method, ...args), local("disposed"));
      assert.equal(c.wire.queries.length, 0);
      assert.throws(() => c.tree.subscribe(null), local("disposed"));
    },
  );
test(
  "T08: same-input new model and snapshot do not accept old rows or late callbacks",
  guard,
  async (t) => {
    const old = await model(t, { id: "old" });
    await load(old);
    const id = row(old.tree, "B-root").id,
      p = invoke(old.tree, "setExpanded", id, true),
      q = await old.wire.next("inst.children");
    old.tree.dispose();
    await assert.rejects(p, local("disposed"));
    const fresh = await model(t, { id: "new" });
    await load(fresh);
    await assert.rejects(
      invoke(fresh.tree, "setExpanded", id, true),
      local("invalid_row"),
    );
    const before = fresh.tree.rows;
    old.wire.ok(q, { items: [child("old")] });
    assert.deepEqual(fresh.tree.rows, before);
    assert.equal(fresh.tree.snapshotId, "new");
  },
);

for (const ownership of ["reveal-owned", "preexisting-manual"])
  for (const shared of [false, true])
    test(
      "C72: scope fold " +
        ownership +
        " owner page, extra SDK subscriber=" +
        shared,
      guard,
      async (t) => {
        const c = await model(t, { childCount: 3, options: { pageSize: 1 } });
        await load(c);
        await first(c, "B-root", [child("A", ["g", "a"])], "next");
        const rid = row(c.tree, "B-root").id,
          gid = scope(c.tree, ["g"]).id;
        let manual, page;
        if (ownership === "preexisting-manual") {
          manual = invoke(c.tree, "loadMore", rid);
          page = await c.wire.next("inst.children");
        }
        const { p } = await revealObject(c, "target");
        if (ownership === "reveal-owned")
          page = await c.wire.next("inst.children");
        assert.equal(page.params.cursor, "next");
        assert.equal(page.params.inst, "B-root");
        const external = shared
          ? watch(c.client.children("B-root", { limit: 1, cursor: "next" }))
          : undefined;
        await invoke(c.tree, "setExpanded", gid, false);
        await assert.rejects(p, local("cancelled"));
        assert.equal(c.tree.revealState.status, "cancelled");
        assert.equal(scope(c.tree, ["g"]).expanded, false);
        const before = row(c.tree, "B-root").children;
        assert.equal(before.loadedCount, 1);
        assert.equal(before.next, "next");
        assert.equal(
          before.status,
          ownership === "reveal-owned" ? "cancelled" : "pending",
        );
        if (ownership === "reveal-owned") {
          assert.equal(before.error.origin, "tree");
          assert.equal(
            c.wire.cancels.some((x) => x.params.target === page.id),
            !shared,
          );
        } else {
          assert.equal(
            c.wire.cancels.some((x) => x.params.target === page.id),
            false,
          );
        }
        c.wire.ok(page, {
          items: [child("target", ["g", "target"]), child("plain", ["plain"])],
        });
        if (external) assert.equal((await external).result.items.length, 2);
        if (manual) await manual;
        if (ownership === "reveal-owned") {
          assert.equal(row(c.tree, "B-root").children.loadedCount, 1);
          assert.equal(row(c.tree, "B-root").children.status, "cancelled");
          assert.equal(
            instances(c.tree).some((x) => x.instance.ref === "plain"),
            false,
          );
        } else {
          assert.equal(row(c.tree, "B-root").children.loadedCount, 3);
          assert.equal(row(c.tree, "B-root").children.status, "success");
          assert.equal(row(c.tree, "plain").instance.ref, "plain");
        }
        assert.equal(
          instances(c.tree).some((x) => x.instance.ref === "target"),
          false,
        );
        assert.equal(scope(c.tree, ["g"]).expanded, false);
        assert.equal(c.tree.revealState.status, "cancelled");
        assert.equal(c.wire.closed, false);
      },
    );
for (const name of ["roots", "children", "object", "ancestors"])
  for (const empty of [false, true])
    test(
      "B16: " +
        name +
        " illegal partial " +
        (name === "object" ? "indexing reason=" : "empty=") +
        empty +
        " fails at SDK and is projected without fake success",
      guard,
      async (t) => {
        const c = await model(t, { childCount: 2 }),
          partial = {
            status: "partial",
            reasons: [
              { code: name === "object" && empty ? "indexing" : "unsupported" },
            ],
          };
        let p, q, result, owner;
        if (name === "roots") {
          p = invoke(c.tree, "loadRoots");
          q = await c.wire.next("inst.roots");
          result = empty ? [] : c.roots;
        } else if (name === "children") {
          await load(c);
          await first(c, "B-root", [child("A")], "next");
          owner = row(c.tree, "B-root").id;
          p = invoke(c.tree, "loadMore", owner);
          q = await c.wire.next("inst.children");
          result = { items: empty ? [] : [child("B")] };
        } else {
          p = invoke(c.tree, "reveal", "target");
          q = await c.wire.next("obj.get");
          if (name === "ancestors") {
            c.wire.ok(q, object("target"));
            q = await c.wire.next("inst.ancestors");
            result = empty ? [] : c.roots;
          } else {
            // ObjectInfo cannot be empty; vary a lawful reason rather than conflate two invalid inputs.
            result = object("target");
          }
        }
        c.wire.ok(q, result, partial);
        await assert.rejects(p, remote("protocol_error", "client"));
        assert.equal(c.wire.closed, true);
        assert.equal(c.tree.disposed, false);
        const state =
          name === "roots"
            ? c.tree.rootState
            : name === "children"
              ? row(c.tree, "B-root").children
              : c.tree.revealState;
        assert.equal(state.status, "failed");
        assert.equal(state.error.code, "protocol_error");
        assert.equal(state.error.origin, "client");
        if (name === "children") {
          assert.equal(state.loadedCount, 1);
          assert.equal(state.next, "next");
          assert.deepEqual(
            instances(c.tree).map((r) => r.instance.ref),
            ["B-root", "A"],
          );
        } else if (name === "object" || name === "ancestors") {
          assert.equal(instances(c.tree).length, 0);
          assert.equal(
            c.wire.queries.some(
              (r) => r.method === "inst.roots" || r.method === "inst.children",
            ),
            false,
          );
        } else assert.equal(state.loadedCount, 0);
      },
    );
test(
  "C71: only success listener throws; published success has no error and no global diagnostic slot invented",
  guard,
  async (t) => {
    const c = await model(t),
      original = new Error("B success-only listener"),
      seen = [];
    c.tree.subscribe(() => {
      if (c.tree.rootState.status === "success") throw original;
    });
    c.tree.subscribe(() => seen.push(c.tree.rootState.status));
    const p = invoke(c.tree, "loadRoots"),
      q = await c.wire.next("inst.roots");
    c.wire.ok(q, c.roots);
    await assert.rejects(p, (e) => {
      assert.ok(e instanceof AggregateError);
      assert.deepEqual(e.errors, [original]);
      return true;
    });
    assert.equal(c.tree.rootState.status, "success");
    assert.equal(Object.hasOwn(c.tree.rootState, "error"), false);
    assert.deepEqual(c.tree.revealState, { status: "idle" });
    assert.deepEqual(seen, ["pending", "success"]);
    assert.equal(instances(c.tree).length, 1);
  },
);
test(
  "T08: returned listener Promise is not awaited; asynchronous work is caller-owned",
  guard,
  async (t) => {
    const c = await model(t),
      resolvers = [];
    c.tree.subscribe(() => new Promise((resolve) => resolvers.push(resolve)));
    await load(c);
    assert.equal(resolvers.length, 2);
    assert.equal(c.tree.rootState.status, "success");
    for (const resolve of resolvers) resolve();
  },
);
