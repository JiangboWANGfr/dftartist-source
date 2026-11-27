import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { bindings, activation, keyboardBoundary } from "./assertions.mjs";
import { pointerInit } from "./input.mjs";
import { ready, selected } from "./public-model.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
test("B35 eight unique inputs have explicit expected/basis; no skip substitution", () => {
  assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map((c) => c.id)).size, 8);
  for (const c of cases)
    assert.ok(
      c.input.event && c.expected.bindings === 2 && c.detail && c.basis,
    );
});
const receipt = () => {
  const navigation = {},
    selection = {},
    page = {},
    actions = [{}, {}],
    r = actions.map((value, i) => ({
      name: "createCandidateAction",
      receiver: navigation,
      args: [page, i],
      status: "returned",
      value,
    }));
  r.push({
    name: "confirmCandidate",
    receiver: navigation,
    args: [actions[1], selection],
    status: "returned",
    value: undefined,
  });
  return { navigation, selection, page, actions, r };
};
test("B35 pure assertion positive retains identity/arity/order and exact count", () => {
  const c = receipt();
  activation(c.r, c.navigation, c.selection, c.page, 1, 1, c.actions);
});
test("B35 valid reverse issuance order preserves item/action mapping", () => {
  const c = receipt();
  [c.r[0], c.r[1]] = [c.r[1], c.r[0]];
  activation(c.r, c.navigation, c.selection, c.page, 1, 1, c.actions);
});
test("B35 paired synthetic pointer fields retain pointer identity", () => {
  for (const type of ["pointerdown", "pointerup", "click"])
    assert.equal(pointerInit(type).pointerId, 35);
  assert.equal(pointerInit("click").detail, 1);
});
for (const [name, mutate, expected] of [
  ["immediate prevented confirmation", () => {}, true],
  ["only keyup confirmation", (c) => c.r.pop(), false],
  [
    "native default not prevented",
    (c) => (c.event.defaultPrevented = false),
    false,
  ],
])
  test("B35 keydown boundary " + name, () => {
    const c = receipt();
    c.event = { key: "Enter", defaultPrevented: true };
    mutate(c);
    const check = () =>
      keyboardBoundary(
        c.r,
        c.navigation,
        c.selection,
        c.page,
        1,
        c.actions,
        c.event,
      );
    if (expected) check();
    else assert.throws(check);
  });
for (const [name, mutate] of [
  ["cloned page", (c) => (c.r[0].args[0] = {})],
  ["wrong index", (c) => (c.r[0].args[1] = 1)],
  ["cloned action", (c) => (c.r[2].args[0] = {})],
  ["other selection", (c) => (c.r[2].args[1] = {})],
  ["wrong receiver", (c) => (c.r[2].receiver = {})],
  ["second confirmation", (c) => c.r.push({ ...c.r[2] })],
  ["event-time reissue", (c) => c.r.splice(2, 0, { ...c.r[1], value: {} })],
])
  test(
    "B35 assertion rejects " +
      name +
      " (facility negative; not a product case)",
    () => {
      const c = receipt();
      mutate(c);
      assert.throws(() =>
        activation(c.r, c.navigation, c.selection, c.page, 1, 1, c.actions),
      );
    },
  );
const P = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(P, "explicit fixed product");
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { SourceNavigationModel, SelectionModel } = await import(
    publicEntry(P, "@hier/viewmodel")
  );
for (const mode of ["real-action", "clone-rejected", "duplicate-calls"])
  test("B35 actual public models " + mode, async () => {
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
      const a = [
        c.n.createCandidateAction(c.page, 0),
        c.n.createCandidateAction(c.page, 1),
      ];
      bindings(tap.records, c.n, c.page);
      if (mode === "real-action") {
        c.n.confirmCandidate(a[1], c.s);
        activation(tap.records, c.n, c.s, c.page, 1, 1, a);
        selected(c, 1, 1);
      }
      if (mode === "clone-rejected") {
        assert.throws(
          () => c.n.confirmCandidate({ ...a[1] }, c.s),
          (e) => {
            assert.equal(e.code, "invalid_action");
            assert.equal(tap.records.at(-1).error, e);
            return true;
          },
        );
        selected(c, 0, 0);
      }
      if (mode === "duplicate-calls") {
        c.n.confirmCandidate(a[0], c.s);
        c.n.confirmCandidate(a[0], c.s);
        assert.equal(
          tap.records.filter((r) => r.name === "confirmCandidate").length,
          2,
        );
        assert.throws(() => activation(tap.records, c.n, c.s, c.page, 0, 1, a));
        selected(c, 0, 1);
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
      assert.deepEqual(errors, [], "every release attempted");
    }
  });
