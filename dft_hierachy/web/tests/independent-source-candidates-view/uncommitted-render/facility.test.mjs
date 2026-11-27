import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { gate } from "./gate.mjs";
import { beforeCommit, afterCommit } from "./assertions.mjs";
import { modelControl } from "./public-model.mjs";
test("B44 three independent uncommitted-render inputs", () =>
  assert.deepEqual(
    cases.map((c) => c.id),
    ["U01", "U02", "U03"],
  ));
function sample() {
  const page = {},
    state = { candidates: { state: { pages: [page] } } },
    current = {};
  const c = {
    n: { state, disposed: false },
    s: { current, canGoBack: false, canGoForward: false, disposed: false },
    originalState: state,
    page,
    before: current,
    history: { back: false, forward: false },
    sent: [],
    sentBefore: 0,
    tap: { records: [] },
    subscribeTap: { records: [] },
    selectionTap: { records: [] },
    feedback: [],
    commitSnapshots: [],
  };
  return c;
}
function bound() {
  const c = sample();
  c.tap.records = [0, 1].map((i) => ({
    name: "createCandidateAction",
    receiver: c.n,
    args: [c.page, i],
    status: "returned",
    value: {},
  }));
  c.subscribeTap.records = [
    {
      name: "subscribe",
      receiver: c.n,
      args: [() => {}],
      status: "returned",
      value: () => {},
    },
  ];
  c.commitSnapshots = [{ state: c.originalState, commands: [] }];
  return c;
}
test("B44 zero uncommitted side effects positive", () =>
  beforeCommit(sample()));
for (const [name, mutate] of [
  [
    "premature signing",
    (c) => c.tap.records.push({ name: "createCandidateAction" }),
  ],
  [
    "hidden Selection operation",
    (c) => c.selectionTap.records.push({ name: "select" }),
  ],
  ["uncommitted feedback", (c) => c.feedback.push({})],
])
  test("B44 rejects " + name, () => {
    const c = sample();
    mutate(c);
    assert.throws(() => beforeCommit(c));
  });
test("B44 does not invent an unspecified uncommitted subscribe-call count", () => {
  const c = sample();
  c.subscribeTap.records.push({ name: "subscribe" });
  beforeCommit(c);
  assert.equal(c.subscribeTap.records.length, 1);
});
test("B44 one committed original batch positive", () =>
  assert.equal(afterCommit(bound()).length, 2));
for (const [name, mutate] of [
  ["extra new command", (c) => c.tap.records.push({ name: "loadMore" })],
  [
    "synchronous commit signing",
    (c) => c.commitSnapshots[0].commands.push(c.tap.records[0]),
  ],
  ["replacement page", (c) => (c.tap.records[0].args[0] = {})],
])
  test("B44 rejects " + name, () => {
    const c = bound();
    mutate(c);
    assert.throws(() => afterCommit(c));
  });
test("B44 host gate opens before settling and release is idempotent", async () => {
  const g = gate();
  let original;
  try {
    g.read();
  } catch (e) {
    original = e;
  }
  assert.equal(original, g.promise);
  assert.equal(g.open, false);
  g.release();
  g.release();
  assert.equal(g.open, true);
  g.read();
  await original;
  assert.equal(g.reads, 2);
});
test("B44 actual public-model original tuple premise", async () => {
  const P = process.env.HIER_B_PRODUCT_ROOT;
  assert(P);
  const classes = await import(P + "/web/packages/viewmodel/dist/index.js");
  const { HierClient } = await import(P + "/web/packages/client/dist/index.js");
  assert.equal((await modelControl({ ...classes, HierClient })).items, 2);
});
