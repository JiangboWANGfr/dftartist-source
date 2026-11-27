import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { bindings, activation } from "./assertions.mjs";
import { ready, selected } from "./public-model.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
test("B36 six unique cases keep explicit input/expected/basis", () => {
  assert.equal(cases.length, 6);
  assert.equal(new Set(cases.map((c) => c.id)).size, 6);
  for (const c of cases)
    assert.ok(
      c.input.pages === 2 && c.expected.bindings === 4 && c.detail && c.basis,
    );
});
function receipt(order = [0, 1, 2, 3]) {
  const n = {},
    s = {},
    pages = [{}, {}],
    actions = [{}, {}, {}, {}],
    r = order.map((k) => ({
      name: "createCandidateAction",
      receiver: n,
      args: [pages[Math.floor(k / 2)], k % 2],
      status: "returned",
      value: actions[k],
    }));
  r.push({
    name: "confirmCandidate",
    receiver: n,
    args: [actions[2], s],
    status: "returned",
  });
  return { n, s, pages, actions, r };
}
for (const order of [
  [0, 1, 2, 3],
  [3, 1, 2, 0],
])
  test(
    "B36 exact tuple/action assertion permits signing order " + order.join(","),
    () => {
      const c = receipt(order);
      activation(c.r, c.n, c.s, c.pages, 2, 1, c.actions);
    },
  );
for (const [name, change] of [
  ["cloned page", (c) => (c.r[2].args[0] = {})],
  ["flattened index", (c) => (c.r[2].args[1] = 2)],
  ["duplicate page/index", (c) => (c.r[2].args = [c.pages[0], 0])],
  ["deduplicated value-equal rows", (c) => c.r.splice(1, 1)],
  [
    "reused action for distinct occurrences",
    (c) => (c.r[2].value = c.actions[0]),
  ],
  [
    "wrong equal-hit action confirmed",
    (c) => (c.r.at(-1).args[0] = c.actions[0]),
  ],
  ["duplicate public confirmation", (c) => c.r.push({ ...c.r.at(-1) })],
  ["other Selection", (c) => (c.r.at(-1).args[1] = {})],
])
  test("B36 facility negative rejects " + name, () => {
    const c = receipt();
    change(c);
    assert.throws(() => activation(c.r, c.n, c.s, c.pages, 2, 1, c.actions));
  });
const P = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(P, "explicit fixed product");
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { SourceNavigationModel, SelectionModel } = await import(
    publicEntry(P, "@hier/viewmodel")
  );
for (const mode of ["tuples", "confirm-second-page", "clone-page"])
  test("B36 actual public model premise " + mode, async () => {
    const c = await ready({
      HierClient,
      SourceNavigationModel,
      SelectionModel,
    });
    let tap;
    try {
      tap = observePublicCalls(c.n, [
        "createCandidateAction",
        "confirmCandidate",
        "loadMore",
        "reloadCandidates",
        "cancelCandidates",
      ]);
      const actions = Array(4);
      for (const row of [3, 0, 2, 1])
        actions[row] = c.n.createCandidateAction(
          c.pages[Math.floor(row / 2)],
          row % 2,
        );
      assert.deepEqual(bindings(tap.records, c.n, c.pages), actions);
      if (mode === "tuples") {
        selected(c, 0);
        assert.equal(new Set(actions).size, 4);
      }
      if (mode === "confirm-second-page") {
        c.n.confirmCandidate(actions[2], c.s);
        activation(tap.records, c.n, c.s, c.pages, 2, 1, actions);
        selected(c, 1);
      }
      if (mode === "clone-page") {
        assert.throws(
          () => c.n.createCandidateAction({ ...c.pages[1] }, 0),
          (e) => e.code === "invalid_page" && tap.records.at(-1).error === e,
        );
        selected(c, 0);
      }
    } finally {
      const errors = [];
      try {
        tap?.dispose();
      } catch (e) {
        errors.push(e);
      }
      try {
        errors.push(...(await c.close()));
      } catch (e) {
        errors.push(e);
      }
      assert.deepEqual(errors, [], "all cleanup attempted");
    }
  });
