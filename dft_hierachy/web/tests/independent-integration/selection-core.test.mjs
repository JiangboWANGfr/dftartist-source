// Agent B frozen public integration oracle. DESIGN §4.3/5.5/5.6/6.5.
// Literal names/widths/candidate set from B sdk_core.sv, not A integration code.
// Real public Node transport only; no rewriting, private field control or sleep.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HierClient, HierError } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";
import * as viewmodel from "@hier/viewmodel";

const guard = { timeout: 20000 }; // Harness bound, not cancellation/latency SLA.
const fixture = fileURLToPath(
  new URL("../../../core/tests/fixtures/m4/sdk_core.sv", import.meta.url),
);
const complete = (reply) => {
  assert.deepEqual(reply.completeness, { status: "complete", reasons: [] });
  return reply.result;
};
const select = (ctx, items, origin) => ({
  snapshotId: ctx.snapshot.snapshotId,
  items,
  origin,
});
const localError = (code) => (error) => {
  assert.ok(error instanceof viewmodel.SelectionError);
  assert.equal(error.code, code);
  assert.ok(typeof error.message === "string" && error.message.length > 0);
  return true;
};

async function session(t) {
  // This explicit capability failure also defines the unimplemented 61a baseline.
  assert.equal(
    typeof viewmodel.SelectionModel,
    "function",
    "M5 must export SelectionModel",
  );
  assert.equal(
    typeof viewmodel.SelectionError,
    "function",
    "M5 must export SelectionError",
  );
  assert.ok(
    process.env.HIER_BIN,
    "HIER_BIN must name this verifier's own fixed Core",
  );
  const transport = createProcessTransport({
    command: process.env.HIER_BIN,
    args: ["serve", "--top", "b_m4_top", fixture],
  });
  transport.exited.catch(() => {});
  const client = new HierClient(transport);
  let model,
    indexReady = false,
    resolveIndex;
  const index = new Promise((resolve) => {
    resolveIndex = resolve;
  });
  const off = client.onIndexReady(() => {
    indexReady = true;
    resolveIndex();
  });
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      model?.dispose();
      off();
      client.dispose();
    }
    assert.deepEqual(await transport.exited, { code: 0, signal: null });
  };
  t.after(close);
  const snapshot = await client.ready;
  if (snapshot.indexState === "ready") {
    indexReady = true;
    resolveIndex();
  }
  assert.deepEqual(
    snapshot.tops.map((x) => x.name),
    ["b_m4_top"],
  );
  model = new viewmodel.SelectionModel({ snapshotId: snapshot.snapshotId });
  const roots = complete(await client.roots());
  assert.deepEqual(
    roots.map((x) => x.name),
    ["b_m4_top"],
  );
  return {
    client,
    transport,
    snapshot,
    model,
    root: roots[0],
    close,
    async indexed(work) {
      let reply = await work();
      if (reply.completeness.status === "partial") {
        assert.deepEqual(
          reply.completeness.reasons.map((x) => x.code),
          ["indexing"],
        );
        if (!indexReady) await index;
        reply = await work();
      }
      return complete(reply);
    },
  };
}

test(
  "B M5 Core: ready-bound port choice, public properties and exact navigation restore",
  guard,
  async (t) => {
    const ctx = await session(t);
    const ports = complete(await ctx.client.ports(ctx.root.ref));
    assert.deepEqual(
      ports.map((x) => x.name),
      ["clk", "rst_n", "d", "y", "q"],
    );
    const d = ports.find((x) => x.name === "d");
    assert.equal(d.direction, "in");
    assert.equal(d.width, 4);
    const rootChoice = select(ctx, [{ ref: ctx.root.ref }], "tree");
    const portChoice = select(
      ctx,
      [{ ref: d.ref, bits: { lsb: 1, width: 2 }, side: "inside" }],
      "props",
    );
    const seen = [];
    ctx.model.subscribe((s) => seen.push(s));
    ctx.model.select(rootChoice);
    ctx.model.select(portChoice);
    const info = complete(
      await ctx.client.object(ctx.model.current.items[0].ref),
    );
    assert.equal(info.ref, d.ref);
    assert.equal(info.kind, "port");
    assert.equal(info.name, "d");
    assert.equal(info.inst, ctx.root.ref);
    assert.deepEqual(ctx.model.current, portChoice);
    ctx.model.back();
    assert.deepEqual(ctx.model.current, rootChoice);
    ctx.model.forward();
    assert.deepEqual(ctx.model.current, portChoice);
    assert.deepEqual(seen, [rootChoice, portChoice, rootChoice, portChoice]);
  },
);

test(
  "B M5 Core: definition stays a definition until caller explicitly picks second paged occurrence",
  guard,
  async (t) => {
    const ctx = await session(t);
    const defs = complete(await ctx.client.definitions()).items;
    assert.deepEqual(
      defs.map((x) => x.name),
      ["b_m4_leaf", "b_m4_top"],
    );
    const leaf = defs.find((x) => x.name === "b_m4_leaf");
    const definitionChoice = select(ctx, [{ def: leaf.ref }], "source");
    ctx.model.select(definitionChoice);
    const first = await ctx.indexed(() =>
      ctx.client.instancesOf(leaf.ref, { limit: 1 }),
    );
    assert.deepEqual(
      first.items.map((x) => x.name),
      ["u"],
    );
    assert.equal(typeof first.next, "string");
    assert.ok(first.next.length > 0);
    assert.deepEqual(ctx.model.current, definitionChoice);
    const second = await ctx.indexed(() =>
      ctx.client.instancesOf(leaf.ref, { limit: 1, cursor: first.next }),
    );
    assert.deepEqual(
      second.items.map((x) => x.name),
      ["v"],
    );
    assert.equal(Object.hasOwn(second, "next"), false);
    assert.notEqual(first.items[0].ref, second.items[0].ref);
    assert.equal(first.items[0].def, leaf.ref);
    assert.equal(second.items[0].def, leaf.ref);
    assert.deepEqual(ctx.model.current, definitionChoice);
    const occurrenceChoice = select(
      ctx,
      [{ ref: second.items[0].ref }],
      "tree",
    );
    ctx.model.select(occurrenceChoice);
    const info = complete(await ctx.client.object(second.items[0].ref));
    assert.equal(info.name, "v");
    assert.equal(info.kind, "instance");
    ctx.model.back();
    assert.deepEqual(ctx.model.current, definitionChoice);
    ctx.model.forward();
    assert.deepEqual(ctx.model.current, occurrenceChoice);
  },
);

test(
  "B M5 Core: disposing navigation model leaves the shared SDK and Core queryable",
  guard,
  async (t) => {
    const ctx = await session(t);
    const selected = select(ctx, [{ ref: ctx.root.ref }], "tree");
    ctx.model.select(selected);
    const published = ctx.model.current;
    ctx.model.dispose();
    ctx.model.dispose();
    assert.equal(ctx.model.disposed, true);
    assert.deepEqual(ctx.model.current, select(ctx, [], "external"));
    assert.throws(() => ctx.model.select(selected), localError("disposed"));
    const roots = complete(await ctx.client.roots());
    assert.deepEqual(
      roots.map((x) => x.name),
      ["b_m4_top"],
    );
    const ports = complete(await ctx.client.ports(ctx.root.ref));
    assert.deepEqual(
      ports.map((x) => x.name),
      ["clk", "rst_n", "d", "y", "q"],
    );
    assert.deepEqual(published, selected);
    assert.ok(Object.isFrozen(published));
    await ctx.close(); // natural actual process exit; no fake transport close callback
  },
);

test(
  "B M5 Core: same-file reopen rejects old snapshot selection and delayed application delivery",
  guard,
  async (t) => {
    const old = await session(t);
    const ports = complete(await old.client.ports(old.root.ref));
    const selected = select(
      old,
      [{ ref: ports.find((x) => x.name === "d").ref }],
      "props",
    );
    old.model.select(selected);
    // Actual Core reply has arrived; hold only application delivery explicitly.
    // This is stale callback isolation, not a claim of execution-time cancellation.
    let deliver;
    const barrier = new Promise((resolve) => {
      deliver = resolve;
    });
    const delayed = barrier.then(() => old.model.select(selected));
    delayed.catch(() => {});
    await old.close();
    const fresh = await session(t);
    assert.notEqual(fresh.snapshot.snapshotId, old.snapshot.snapshotId);
    assert.equal(fresh.snapshot.inputHash, old.snapshot.inputHash);
    assert.equal(old.model.disposed, true);
    assert.deepEqual(old.model.current, select(old, [], "external"));
    const freshChoice = select(fresh, [{ ref: fresh.root.ref }], "tree");
    const seen = [];
    fresh.model.subscribe((s) => seen.push(s));
    fresh.model.select(freshChoice);
    assert.throws(
      () => fresh.model.select(selected),
      localError("snapshot_mismatch"),
    );
    assert.deepEqual(fresh.model.current, freshChoice);
    deliver();
    await assert.rejects(delayed, localError("disposed"));
    assert.deepEqual(fresh.model.current, freshChoice);
    assert.deepEqual(seen, [freshChoice]);
    assert.deepEqual(
      complete(await fresh.client.roots()).map((x) => x.name),
      ["b_m4_top"],
    );
  },
);

test(
  "B M5 Core: domain side error remains HierError(core), not a local selection error or a poisoned session",
  guard,
  async (t) => {
    const ctx = await session(t);
    const port = complete(await ctx.client.ports(ctx.root.ref)).find(
      (x) => x.name === "y",
    );
    assert.equal(port.direction, "out");
    assert.equal(port.width, 4);
    const outside = select(
      ctx,
      [{ ref: port.ref, bits: { lsb: 1, width: 2 }, side: "outside" }],
      "graph",
    );
    ctx.model.select(outside); // model owns only structural Side enum validation
    await assert.rejects(
      ctx.client.drivers({
        slice: { ref: port.ref, bits: { lsb: 1, width: 2 } },
        reach: "local",
        side: "outside",
      }),
      (error) => {
        assert.ok(error instanceof HierError);
        assert.equal(error instanceof viewmodel.SelectionError, false);
        assert.equal(error.origin, "core");
        assert.equal(error.code, "bad_request");
        assert.ok(
          typeof error.message === "string" && error.message.length > 0,
        );
        assert.ok(error.data && typeof error.data === "object");
        return true;
      },
    );
    assert.deepEqual(ctx.model.current, outside);
    const inside = select(
      ctx,
      [{ ref: port.ref, bits: { lsb: 1, width: 2 }, side: "inside" }],
      "graph",
    );
    ctx.model.select(inside);
    complete(
      await ctx.client.drivers({
        slice: { ref: port.ref, bits: { lsb: 1, width: 2 } },
        reach: "local",
        side: "inside",
      }),
    );
    assert.equal(complete(await ctx.client.object(port.ref)).kind, "port");
    assert.deepEqual(ctx.model.current, inside);
  },
);

test(
  "B M5 Core: closing one panel subscription does not close shared selection or the SDK",
  guard,
  async (t) => {
    const ctx = await session(t);
    const first = [],
      second = [];
    const remove = ctx.model.subscribe((s) => first.push(s));
    ctx.model.subscribe((s) => second.push(s));
    const root = select(ctx, [{ ref: ctx.root.ref }], "tree");
    const port = complete(await ctx.client.ports(ctx.root.ref)).find(
      (x) => x.name === "clk",
    );
    assert.equal(port.width, 1);
    assert.equal(port.direction, "in");
    const selected = select(ctx, [{ ref: port.ref }], "props");
    ctx.model.select(root);
    remove();
    remove();
    ctx.model.select(selected);
    assert.deepEqual(first, [root]);
    assert.deepEqual(second, [root, selected]);
    assert.equal(ctx.model.disposed, false);
    assert.equal(complete(await ctx.client.object(port.ref)).name, "clk");
    assert.deepEqual(ctx.model.current, selected);
  },
);
