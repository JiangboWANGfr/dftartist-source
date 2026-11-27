import test from "node:test";
import assert from "node:assert/strict";
import { cases, documents, expected, resolved } from "./cases.mjs";
import { cases as original, ambiguities } from "../cases.mjs";
test("B20:19 explicit Q1/Q2 scenarios, original89 and historical ambiguity records untouched", () => {
  assert.equal(cases.length, 19);
  assert.equal(new Set(cases.map((c) => c.id)).size, 19);
  assert.ok(cases.every((c) => c.input && c.expected && c.basis));
  assert.equal(original.length, 89);
  assert.deepEqual(
    resolved,
    ambiguities.map((q) => q.id),
  );
});
test("B20:8 legal literal documents include no-overflow emptyfile and both EOF forms", () => {
  assert.equal(Object.keys(documents).length, 8);
  assert.equal(documents["empty-file"].content.result.text, "");
  assert.deepEqual(documents["empty-trailing-eof"].location.range.start, {
    offset: 5,
    line: 2,
    column: 1,
  });
  assert.deepEqual(expected(documents["empty-file"]), {
    numbers: [1, 1, 1, 1],
    empty: true,
  });
  assert.ok(expected(documents["changed-empty"]).warning);
});
