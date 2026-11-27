import test from "node:test";
import assert from "node:assert/strict";
import { cases, texts, ambiguities } from "./cases.mjs";
import { document, state, position } from "./source-data.mjs";
test("B inventory: 89 explicit unique inputs/expected/basis; two unresolved not silently decided", () => {
  assert.equal(cases.length, 89);
  assert.equal(new Set(cases.map((c) => c.id)).size, 89);
  assert.ok(cases.every((c) => c.input && c.expected && c.basis));
  assert.equal(ambiguities.length, 2);
});
test("B DTOs: public five union states, frozen borrowed documents and exact UTF16 offsets", () => {
  for (const status of ["idle", "pending", "success", "failed", "cancelled"]) {
    const s = state(status);
    assert.equal(s.status, status);
    assert.ok(Object.isFrozen(s));
  }
  const d = document("a😀\r\nz", 1, 3);
  assert.deepEqual(d.location.range, {
    start: { offset: 1, line: 1, column: 2 },
    end: { offset: 3, line: 1, column: 4 },
  });
  assert.equal(d.source.result.end.offset, 5);
  assert.ok(Object.isFrozen(d));
});
test("B byte tables: CRLF/CR/BOM/tab/nonBMP/HTML/empty, never from product output", () => {
  assert.equal(Object.keys(texts).length, 10);
  assert.equal(position("a\r\nb", 3).line, 2);
  assert.equal(document("", 0, 0).content.result.text, "");
  assert.equal(document("short", 0, 0, true).location.status, "changed");
});
