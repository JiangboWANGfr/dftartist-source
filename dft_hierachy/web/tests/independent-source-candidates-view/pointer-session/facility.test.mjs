import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { noConfirm, currentConfirm } from "./assertions.mjs";
import { modelPremise } from "./public-model.mjs";
import { pointerInit } from "../pointer-rebind/input.mjs";
import { publicEntry } from "../../independent-electron-renderer/public-entry.mjs";
test("B47 two explicit session gesture inputs", () =>
  assert.deepEqual(
    cases.map((c) => c.mode),
    ["pair", "selection"],
  ));
test("B47 no confirmation accepts unrelated binding receipts", () =>
  noConfirm([{ name: "createCandidateAction" }]));
for (const status of ["returned", "thrown"])
  test("B47 zero-call rejects even " + status + " confirmation", () =>
    assert.throws(() => noConfirm([{ name: "confirmCandidate", status }])),
  );
function receipt() {
  const n = {},
    s = {},
    action = {};
  return {
    n,
    s,
    action,
    records: [
      {
        name: "confirmCandidate",
        receiver: n,
        args: [action, s],
        status: "returned",
      },
    ],
  };
}
test("B47 exact current confirmation accepted", () => {
  const c = receipt();
  currentConfirm(c.records, c.n, c.s, c.action);
});
for (const [name, change] of [
  ["wrong action", (c) => (c.records[0].args[0] = {})],
  ["wrong Selection", (c) => (c.records[0].args[1] = {})],
  ["wrong receiver", (c) => (c.records[0].receiver = {})],
  ["duplicate", (c) => c.records.push({ ...c.records[0] })],
])
  test("B47 AT false green rejected: " + name, () => {
    const c = receipt();
    change(c);
    assert.throws(() => currentConfirm(c.records, c.n, c.s, c.action));
  });
test("B47 synthetic paired click is distinct from independent AT shape", () => {
  const p = pointerInit("click");
  assert.equal(p.pointerId, 37);
  assert.equal(p.detail, 1);
  assert.equal(p.pointerType, "mouse");
  assert.equal(p.isPrimary, true);
});
const P = process.env.HIER_B_PRODUCT_ROOT;
assert(P, "explicit fixed product");
const { HierClient } = await import(publicEntry(P, "@hier/client")),
  { SourceNavigationModel, SelectionModel } = await import(
    publicEntry(P, "@hier/viewmodel")
  );
for (const mode of ["pair", "selection"])
  test("B47 real public model premise " + mode, async () =>
    assert.equal(
      (
        await modelPremise(
          { HierClient, SourceNavigationModel, SelectionModel },
          mode,
        )
      ).pass,
      true,
    ),
  );
