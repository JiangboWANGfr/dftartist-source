import assert from "node:assert/strict";
import test from "node:test";
import { AnnotationLayer, resolveObjectAnnotations } from "../packages/viewmodel/dist/index.js";
const old = process.env.HIER_A_LEGACY_ANNOTATIONS === "1";
const index = old ? undefined : (await import("../packages/views/dist/annotation-lookup.js")).indexAnnotations;
const snapshotId = "A-annotation-presentation";
const refs = ["A/mark/same", "A/mark/b", "A/mark/e\u0301", "A/mark/é", "A/mark/\u0000", "A/mark/missing"];
const frame = (all, layers) => old
  ? query => resolveObjectAnnotations(snapshotId, query, layers)
  : index(resolveObjectAnnotations(snapshotId, all, layers));
function layers() {
  return Array.from({ length: 4 }, (_, i) => {
    const layer = new AnnotationLayer({ snapshotId, id: `layer/${i}`, label: i === 2 ? "same label" : `layer ${i}` });
    layer.set(refs.slice(0, 5).filter((_, n) => (n + i) % 3 !== 0).map((ref, n) => ({ ref, mark: { badge: n % 2 ? "" : `badge ${i}`, tooltip: "尾 <&>", color: "#aAbB09", severity: "warn" } })));
    return layer;
  });
}
test("A M7 annotation presentation: exact refs, layer-major and per-description first-ref order", () => {
  const values = layers();
  try {
    const queries = [[], ...refs.map(ref => [ref]), [refs[1], refs[0]], [refs[0], refs[0], refs[2], refs[1]], [...refs].reverse()];
    for (const ordered of [values, [...values].reverse(), [values[2], values[0], values[3], values[1]]]) {
      const lookup = frame(queries.flat(), ordered);
      for (const query of queries) {
        const actual = lookup(query), expected = resolveObjectAnnotations(snapshotId, query, ordered);
        assert.deepEqual(actual, expected); assert.ok(Object.isFrozen(actual));
        for (const value of actual) {
          assert.ok(ordered.some(layer => layer.state === value.layer));
          assert.equal(value.layer.marks.find(mark => mark.ref === value.entry.ref), value.entry);
        }
      }
    }
  } finally { for (const value of values) value.dispose(); }
});
test("A M7 annotation presentation: each frame follows set, clear, disposal and replacement without changing old records", () => {
  const values = layers();
  try {
    const oldMarks = resolveObjectAnnotations(snapshotId, refs, values), before = JSON.stringify(oldMarks);
    for (const change of [() => values[0].set([{ ref: refs[1], mark: {} }]), () => values[1].clear(), () => values[2].dispose(), () => values.reverse()]) {
      change(); const lookup = frame(refs, values);
      for (const query of [refs, [refs[1], refs[0]], [], [refs[0], refs[0]]])
        assert.deepEqual(lookup(query), resolveObjectAnnotations(snapshotId, query, values));
      assert.equal(JSON.stringify(oldMarks), before);
    }
  } finally { for (const value of values) value.dispose(); }
});
