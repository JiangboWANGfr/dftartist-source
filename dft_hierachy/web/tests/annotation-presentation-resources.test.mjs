import assert from "node:assert/strict";
import test from "node:test";
import { AnnotationLayer, resolveObjectAnnotations } from "../packages/viewmodel/dist/index.js";
import { indexAnnotations } from "../packages/views/dist/annotation-lookup.js";
import { annotationDescription, createAnnotationDescriptions } from "../packages/views/dist/annotation-presentation.js";
test("A M7 annotation presentation: repeated descriptors borrow one frame's resolved records", () => {
  const snapshotId = "A-annotation-resources", refs = ["A/mark/a", "A/mark/b"];
  const layers = Array.from({ length: 64 }, (_, i) => new AnnotationLayer({ snapshotId, id: `${i}`, label: `layer ${i}` }));
  for (const layer of layers) layer.set(refs.map(ref => ({ ref, mark: { badge: "" } })));
  const get = Map.prototype.get; let modelHits = 0;
  Map.prototype.get = function (key) {
    const value = get.call(this, key);
    if (typeof key === "string" && key.startsWith("A/mark/") && value?.mark) modelHits++;
    return value;
  };
  try {
    const resolved = resolveObjectAnnotations(snapshotId, Array.from({ length: 10000 }, (_, i) => refs[i % 2]), layers);
    const lookup = indexAnnotations(resolved), first = lookup([refs[0]]);
    assert.equal(modelHits, 128);
    for (let i = 0; i < 10000; i++) {
      assert.equal(lookup([refs[0]]), first);
      const matches = lookup([refs[1], refs[0], refs[1]]);
      assert.equal(matches.length, 128); assert.ok(Object.isFrozen(matches));
      assert.equal(matches[0].entry.ref, refs[1]); assert.equal(matches[1].entry.ref, refs[0]);
    }
    assert.equal(modelHits, 128, "presentation lookup must not revisit model marks");
    assert.ok(first.every(value => resolved.includes(value)), "borrow original resolved records");
    const expected = annotationDescription(first), description = createAnnotationDescriptions();
    const map = Array.prototype.map; let formats = 0;
    Array.prototype.map = function (callback, self) {
      if (this === first) formats++;
      return map.call(this, callback, self);
    };
    try {
      for (let i = 0; i < 10000; i++) assert.equal(description(first), expected);
      assert.equal(formats, 1, "one immutable list is formatted once per presentation");
    } finally { Array.prototype.map = map; }
  } finally { Map.prototype.get = get; for (const layer of layers) layer.dispose(); }
});
