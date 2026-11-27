import assert from "node:assert/strict";
import test from "node:test";
import { cases } from "./cases.mjs";
test("B C82 inventory is unique and each input has normative basis", () => {
  assert.equal(cases.length, 25);
  assert.equal(new Set(cases.map((x) => x.id)).size, 25);
  for (const row of cases) {
    assert.ok(row.input && row.expected && row.basis);
    assert.equal(typeof row.run, "function");
    assert.notEqual(row.input.claimId, row.input.foreignId);
  }
});
test("B C82 input partitions are five open plus twenty paired first-cause controls", () => {
  assert.equal(cases.filter((x) => x.id.startsWith("ER82-OPEN-")).length, 5);
  assert.equal(cases.filter((x) => x.id.startsWith("ER82-CLOSED-")).length, 20);
  for (const cause of ["normal", "diagnostic"])
    for (const order of ["before", "after"])
      assert.equal(
        cases.filter(
          (x) =>
            x.input.currentClose === cause &&
            x.input.foreignRelativeToCurrentClose === order,
        ).length,
        5,
      );
});
