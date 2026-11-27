import assert from "node:assert/strict";
import { test } from "node:test";
import { GraphSession, GraphSessionError } from "@hier/viewmodel";
import { HierError } from "@hier/client";
import { sdk, watch } from "../independent-tree/harness.mjs";

// A regression coverage; B's frozen inputs remain unchanged.
async function graph(t) {
  const c = await sdk(t);
  const g = new GraphSession(c.client);
  c.models.push(g);
  return { g, source: g.registerSource({ label: "A", origin: "analysis" }) };
}
const empty = (g) => ({
  snapshotId: g.snapshotId,
  nodes: [],
  edges: [],
  completeness: { status: "complete", reasons: [] },
  frontier: [],
  hasConservative: false,
});
const code = (expected) => (error) => error instanceof GraphSessionError && error.code === expected;

test("A graph: disposal in cancel notification settles both waiters with prior errors", async (t) => {
  const { g, source } = await graph(t);
  const marker = { phase: "pending" };
  g.subscribe(() => {
    if (source.state.status === "pending") throw marker;
    g.dispose();
  });
  const loading = watch(source.refresh(() => new Promise(() => {})));
  await assert.rejects(source.cancel(), code("disposed"));
  await assert.rejects(loading, (error) => {
    assert.equal(error.code, "disposed");
    assert(error.cause instanceof AggregateError);
    assert.deepEqual(error.cause.errors, [marker]);
    assert.equal(error.cause.cause.code, "cancelled");
    return true;
  });
});

test("A graph: original error diagnostic reads reject reentry and retain dataIssue", async (t) => {
  const { g, source } = await graph(t);
  const failure = new HierError("invalid_argument", "core", "original");
  let reentered;
  Object.defineProperty(failure, "data", {
    get() {
      reentered = watch(source.clear());
      throw new Error("data read");
    },
  });
  await assert.rejects(
    source.refresh(() => Promise.reject(failure)),
    (error) => error === failure,
  );
  await assert.rejects(reentered, code("reentrant_change"));
  assert.equal(source.state.status, "failed");
  assert.equal(source.state.error.dataIssue.code, "data_read_failed");
  assert.deepEqual(source.state.error.data, {});
  const closed = new HierError("invalid_argument", "core", "dispose during diagnosis");
  Object.defineProperty(closed, "data", {
    get() {
      g.dispose();
      return {};
    },
  });
  await assert.rejects(
    source.refresh(() => Promise.reject(closed)),
    (error) => {
      assert.equal(error.code, "disposed");
      assert.equal(error.cause, closed);
      return true;
    },
  );
});

test("A graph: a provider can supersede itself and its later thenable rejection is consumed", async (t) => {
  const { g, source } = await graph(t);
  let replacement, rejectOld;
  const loading = watch(
    source.refresh(() => {
      replacement = source.replace(empty(g));
      return {
        then(_resolve, reject) {
          rejectOld = reject;
        },
      };
    }),
  );
  await replacement;
  await assert.rejects(loading, code("cancelled"));
  const state = g.state;
  rejectOld(new Error("superseded provider"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(g.state, state);
});

test("A graph: extension aliases read once, cycles rejected without cancelling current load", async (t) => {
  const { g, source } = await graph(t);
  let reads = 0;
  const extension = {
    get a() {
      reads++;
      return 7;
    },
  };
  const input = empty(g);
  input.nodes = [
    {
      kind: "design",
      value: {
        id: "A-node",
        kind: "slice",
        point: { slice: { ref: "A-ref", bits: { lsb: 0, width: 1 } } },
        extra: [extension, extension],
      },
    },
  ];
  await source.replace(input);
  assert.equal(reads, 1);
  let signal;
  const loading = watch(
    source.refresh((ctx) => {
      signal = ctx.signal;
      return new Promise(() => {});
    }),
  );
  const state = g.state;
  extension.loop = extension;
  await assert.rejects(source.replace(input), code("invalid_argument"));
  assert.equal(g.state, state);
  assert.equal(signal.aborted, false);
  g.dispose();
  await assert.rejects(loading, code("disposed"));
});
