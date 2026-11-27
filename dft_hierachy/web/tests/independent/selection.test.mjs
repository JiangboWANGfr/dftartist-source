// M5 selection history is navigation, NOT A21 planning-edit undo/redo.
// Only the specified current/select/back/forward/subscribe interface is exercised.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as viewmodel from "@hier/viewmodel";

const selection = (ref, origin) => ({ items: [{ ref, bits: { lsb: 0, width: 1 } }], origin });
const a = selection("s:0:0", "tree");
const b = selection("s:0.1:0", "graph");

function model() {
  assert.equal(typeof viewmodel.SelectionModel, "function", "M5 must export SelectionModel");
  return new viewmodel.SelectionModel();
}

test("M5: history restores exact object, bits and origin", () => {
  const m = model();
  m.select(a); m.select(b);
  assert.deepEqual(m.current, b);
  m.back(); assert.deepEqual(m.current, a);
  m.forward(); assert.deepEqual(m.current, b);
});

test("M5: subscriber sees selection and can unsubscribe", () => {
  const m = model();
  const seen = [];
  const unsubscribe = m.subscribe(s => seen.push(structuredClone(s)));
  m.select(a);
  assert.deepEqual(seen.at(-1), a);
  unsubscribe();
  const length = seen.length;
  m.select(b);
  assert.equal(seen.length, length);
});
